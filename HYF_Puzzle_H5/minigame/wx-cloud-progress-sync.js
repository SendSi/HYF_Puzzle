const PROGRESS_KEY = 'game_progress_local'
const CLOUD_FUNCTION_NAME = 'progressStorage'
const USER_ID_KEY = 'hyf_cloud_user_id'

let cloudReady = false
let syncingFromCloud = false
let loading = false
let saving = false
let pendingProgress = 0
let lastSyncedProgress = 0
let restoredOnce = false

function initCloud() {
  if (cloudReady) return true
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.init || !wx.cloud.callFunction) {
    console.warn('[WXCloudProgressSync] wx.cloud not available')
    return false
  }

  wx.cloud.init({ traceUser: true })
  cloudReady = true
  console.log('[WXCloudProgressSync] cloud initialized')
  return true
}

function parseProgress(value) {
  const progress = parseInt(value || '0', 10)
  return Number.isNaN(progress) || progress <= 0 ? 0 : progress
}

function getLocalProgress() {
  return parseProgress(wx.getStorageSync(PROGRESS_KEY))
}

function getUserId() {
  try {
    const accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : null
    const appid = accountInfo && accountInfo.miniProgram ? accountInfo.miniProgram.appId || '' : ''
    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
    const deviceKey = [
      appid,
      systemInfo.brand || '',
      systemInfo.model || '',
      systemInfo.system || '',
      systemInfo.platform || '',
      systemInfo.deviceId || '',
    ].join('|')

    let saved = wx.getStorageSync(USER_ID_KEY)
    if (saved) return String(saved)

    saved = 'device_' + hashString(deviceKey)
    wx.setStorageSync(USER_ID_KEY, saved)
    return saved
  } catch (error) {
    return ''
  }
}

function hashString(value) {
  value = String(value || '')
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return (hash >>> 0).toString(16)
}

function buildCloudData(action, progress) {
  // 不再从前端传 userId。卸载后本地 userId 可能变化，导致保存和恢复不是同一份数据。
  // 云函数里使用微信稳定 OPENID 作为主键。
  const data = { action }
  if (progress !== undefined) data.progress = progress
  return data
}

function stringifyError(error) {
  if (!error) return 'unknown'
  if (typeof error === 'string') return error
  if (error.errMsg) return error.errMsg
  if (error.message) return error.message
  try {
    return JSON.stringify(error)
  } catch (ignore) {
    return String(error)
  }
}

function showCloudSyncToast(title) {
  try {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: String(title).slice(0, 28), icon: 'none', duration: 2500 })
    }
  } catch (ignore) {}
}

function saveProgressToUserCloudStorage(progress, source) {
  progress = parseProgress(progress)
  if (progress <= 0) return
  if (typeof wx === 'undefined' || !wx.setUserCloudStorage) {
    console.warn('[WXCloudProgressSync] setUserCloudStorage not available')
    return
  }

  wx.setUserCloudStorage({
    KVDataList: [
      { key: 'game_progress', value: String(progress) },
      { key: PROGRESS_KEY, value: String(progress) },
    ],
    success() {
      lastSyncedProgress = Math.max(lastSyncedProgress, progress)
      console.log('[WXCloudProgressSync] user cloud saved:', progress, 'source:', source)
      showCloudSyncToast('云存档成功:' + progress)
      notifyUnityProgress(progress, 'user-cloud-save-' + source)
    },
    fail(error) {
      console.error('[WXCloudProgressSync] setUserCloudStorage fail:', error, 'source:', source)
      showCloudSyncToast('开放云存储失败:' + stringifyError(error))
    },
  })
}

function notifyUnityProgress(progress, source) {
  progress = parseProgress(progress)
  if (progress <= 0) return

  const notify = function () {
    try {
      if (typeof SendMessage === 'function') {
        SendMessage('WXCloudStorageCallbackObj', 'OnLocalLoaded', String(progress))
        console.log('[WXCloudProgressSync] notified unity:', progress, 'source:', source)
      }
    } catch (error) {
      console.warn('[WXCloudProgressSync] notify unity failed:', error, 'source:', source)
    }
  }

  notify()
  setTimeout(notify, 1000)
  setTimeout(notify, 3000)
}

function restoreProgressFromUserCloudStorage(source) {
  if (typeof wx === 'undefined' || !wx.getUserCloudStorage) {
    console.warn('[WXCloudProgressSync] getUserCloudStorage not available')
    return
  }

  wx.getUserCloudStorage({
    keyList: ['game_progress', PROGRESS_KEY],
    success(res) {
      const list = res && res.KVDataList ? res.KVDataList : []
      let progress = 0
      for (let i = 0; i < list.length; i += 1) {
        progress = Math.max(progress, parseProgress(list[i].value))
      }

      const localProgress = getLocalProgress()
      if (progress > localProgress) {
        syncingFromCloud = true
        wx.setStorageSync(PROGRESS_KEY, String(progress))
        syncingFromCloud = false
        lastSyncedProgress = Math.max(lastSyncedProgress, progress)
        console.log('[WXCloudProgressSync] user cloud restored:', progress, 'source:', source)
        showCloudSyncToast('云存档恢复:' + progress + ':user-cloud-' + source)
        notifyUnityProgress(progress, 'user-cloud-' + source)
      } else {
        console.log('[WXCloudProgressSync] user cloud loaded:', progress, 'local:', localProgress, 'source:', source)
        if (progress > 0) {
          notifyUnityProgress(progress, 'user-cloud-loaded-' + source)
        }
      }
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] getUserCloudStorage fail:', error, 'source:', source)
      showCloudSyncToast('云存档读取失败:' + stringifyError(error))
    },
  })
}

function syncProgressToCloud(progress, source) {
  progress = parseProgress(progress)
  if (progress <= 0 || syncingFromCloud) return

  if (!initCloud()) {
    saveProgressToUserCloudStorage(progress, source)
    return
  }

  pendingProgress = Math.max(pendingProgress, progress)
  if (progress <= lastSyncedProgress && pendingProgress <= lastSyncedProgress) return
  if (saving) return

  saving = true
  const progressToSave = pendingProgress
  pendingProgress = 0

  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: buildCloudData('set', progressToSave),
    success(res) {
      const result = res && res.result ? res.result : {}
      if (result.ok === false) {
        console.warn('[WXCloudProgressSync] cloud file save failed:', result.error || result, 'source:', source, 'data:', buildCloudData('set', progressToSave))
        saveProgressToUserCloudStorage(progressToSave, source + '-fallback')
        pendingProgress = Math.max(pendingProgress, progressToSave)
        return
      }

      lastSyncedProgress = Math.max(lastSyncedProgress, parseProgress(result.progress || progressToSave))
      console.log('[WXCloudProgressSync] cloud file saved:', lastSyncedProgress, 'recordId:', result.recordId || '', 'fileID:', result.fileID || '', 'mode:', result.mode || '', 'source:', source)
      showCloudSyncToast('云存档成功:' + lastSyncedProgress + ':' + (result.mode || ''))
      notifyUnityProgress(lastSyncedProgress, 'cloud-file-save-' + source)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] callFunction set fail:', error, 'source:', source, 'data:', buildCloudData('set', progressToSave))
      saveProgressToUserCloudStorage(progressToSave, source + '-fallback')
      pendingProgress = Math.max(pendingProgress, progressToSave)
    },
    complete() {
      saving = false
      if (pendingProgress > lastSyncedProgress) {
        setTimeout(function retryPendingProgress() {
          syncProgressToCloud(pendingProgress, 'pending')
        }, 3000)
      }
    },
  })
}

function restoreProgressFromCloud(force) {
  if (loading) {
    if (force) {
      setTimeout(function retryForcedRestore() { restoreProgressFromCloud(true) }, 800)
    }
    return
  }
  if (restoredOnce && !force) return

  restoreProgressFromUserCloudStorage('restore')

  if (!initCloud()) {
    showCloudSyncToast('云环境未就绪')
    return
  }

  restoredOnce = true
  loading = true
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: buildCloudData('get'),
    success(res) {
      const result = res && res.result ? res.result : {}
      if (result.ok === false) {
        console.warn('[WXCloudProgressSync] load failed:', result.error || result)
        showCloudSyncToast('云存档读取失败:' + (result.error || 'unknown'))
        return
      }

      const cloudProgress = parseProgress(result.progress)
      const localProgress = getLocalProgress()
      const progress = Math.max(cloudProgress, localProgress)
      lastSyncedProgress = Math.max(lastSyncedProgress, cloudProgress)

      if (progress > 0 && progress > localProgress) {
        syncingFromCloud = true
        wx.setStorageSync(PROGRESS_KEY, String(progress))
        syncingFromCloud = false
        console.log('[WXCloudProgressSync] cloud file restored local progress:', progress)
        showCloudSyncToast('云存档恢复:' + progress + ':' + (result.mode || 'cloud-file'))
        notifyUnityProgress(progress, 'cloud-file-restore')
      } else {
        console.log('[WXCloudProgressSync] cloud file loaded:', cloudProgress, 'local:', localProgress, 'mode:', result.mode || '', 'error:', result.error || '')
        if (cloudProgress <= 0 && localProgress <= 0) {
          showCloudSyncToast('云存档为空:' + (result.detectedPrefix ? 'prefix' : 'noprefix') + ':' + (result.error || result.mode || ''))
        }
        if (progress > 0) notifyUnityProgress(progress, 'cloud-file-loaded')
      }
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] callFunction get fail:', error)
      showCloudSyncToast('云函数读取失败:' + stringifyError(error))
    },
    complete() {
      loading = false
    },
  })
}

function patchStorageSync() {
  if (typeof wx === 'undefined' || !wx.setStorageSync || wx.__HYFCloudProgressPatched) return

  const originalSetStorageSync = wx.setStorageSync.bind(wx)
  wx.setStorageSync = function patchedSetStorageSync(key, value) {
    const result = originalSetStorageSync(key, value)
    if (key === PROGRESS_KEY) {
      syncProgressToCloud(value, 'setStorageSync')
    }
    return result
  }

  wx.__HYFCloudProgressPatched = true
  console.log('[WXCloudProgressSync] wx.setStorageSync patched')
}

patchStorageSync()

function startupRestore(source) {
  const localProgress = getLocalProgress()
  if (localProgress > 0) {
    console.log('[WXCloudProgressSync] startup local progress:', localProgress, 'source:', source)
    notifyUnityProgress(localProgress, 'startup-local-' + source)
    syncProgressToCloud(localProgress, 'startup-local-' + source)
  }

  restoreProgressFromUserCloudStorage(source)
  restoreProgressFromCloud(true)
}

startupRestore('immediate')
setTimeout(function restoreAtOneSecond() { startupRestore('1s') }, 1000)
setTimeout(function restoreAtThreeSeconds() { startupRestore('3s') }, 3000)
setTimeout(function restoreAtSixSeconds() { startupRestore('6s') }, 6000)

if (typeof GameGlobal !== 'undefined') {
  GameGlobal.__HYFSaveProgressToCloud = syncProgressToCloud
  GameGlobal.__HYFRestoreProgressFromCloud = function () { restoreProgressFromCloud(false) }
  console.log('[WXCloudProgressSync] bridge ready')
} else {
  console.warn('[WXCloudProgressSync] GameGlobal not available')
}
