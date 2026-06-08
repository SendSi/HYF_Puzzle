const PROGRESS_KEY = 'game_progress_local'
const CLOUD_INT_KEY = 'cloud_int_value_local'
const CLOUD_FUNCTION_NAME = 'progressStorage'

let cloudReady = false
let syncingFromCloud = false
let loading = false
let cloudIntLoading = false
let saving = false
let cloudIntSaving = false
let pendingProgress = 0
let pendingCloudIntValue = null
let lastSyncedProgress = 0
let lastSyncedCloudIntValue = null
let restoredOnce = false
let cloudIntRestoredOnce = false

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

function parseCloudIntValue(value) {
  const intValue = parseInt(value || '0', 10)
  return Number.isNaN(intValue) || intValue < 0 ? 0 : intValue
}

function getLocalProgress() {
  try {
    return parseProgress(wx.getStorageSync(PROGRESS_KEY))
  } catch (error) {
    return 0
  }
}

function getLocalCloudIntValue() {
  try {
    return parseCloudIntValue(wx.getStorageSync(CLOUD_INT_KEY))
  } catch (error) {
    return 0
  }
}

function buildCloudData(action, progress) {
  const data = { action }
  if (progress !== undefined) data.progress = progress
  return data
}

function buildCloudIntData(action, value) {
  const data = { action }
  if (value !== undefined) data.cloudIntValue = value
  return data
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

function notifyUnityCloudIntValue(value, source) {
  value = parseCloudIntValue(value)

  const notify = function () {
    try {
      if (typeof SendMessage === 'function') {
        SendMessage('WXCloudStorageCallbackObj', 'OnCloudIntValueLocalLoaded', String(value))
        console.log('[WXCloudProgressSync] notified unity cloud int:', value, 'source:', source)
      }
    } catch (error) {
      console.warn('[WXCloudProgressSync] notify unity cloud int failed:', error, 'source:', source)
    }
  }

  notify()
  setTimeout(notify, 1000)
  setTimeout(notify, 3000)
}

function syncProgressToCloud(progress, source) {
  progress = parseProgress(progress)
  if (progress <= 0 || syncingFromCloud) return
  if (!initCloud()) {
    console.warn('[WXCloudProgressSync] cloud unavailable, skip cloud save:', progress, 'source:', source)
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
        console.warn('[WXCloudProgressSync] cloud file save failed:', result.error || result, 'source:', source)
        pendingProgress = Math.max(pendingProgress, progressToSave)
        return
      }

      lastSyncedProgress = Math.max(lastSyncedProgress, parseProgress(result.progress || progressToSave))
      console.log('[WXCloudProgressSync] cloud file saved:', lastSyncedProgress, 'cloudIntValue:', result.cloudIntValue || 0, 'recordId:', result.recordId || '', 'fileID:', result.fileID || '', 'mode:', result.mode || '', 'source:', source)
      notifyUnityProgress(lastSyncedProgress, 'cloud-file-save-' + source)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] callFunction set fail:', error, 'source:', source)
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

function syncCloudIntValueToCloud(value, source) {
  value = parseCloudIntValue(value)
  if (syncingFromCloud) return
  if (!initCloud()) {
    console.warn('[WXCloudProgressSync] cloud unavailable, skip cloud int save:', value, 'source:', source)
    return
  }

  pendingCloudIntValue = value
  if (lastSyncedCloudIntValue !== null && pendingCloudIntValue === lastSyncedCloudIntValue) return
  if (cloudIntSaving) return

  cloudIntSaving = true
  const valueToSave = pendingCloudIntValue
  pendingCloudIntValue = null

  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: buildCloudIntData('setCloudIntValue', valueToSave),
    success(res) {
      const result = res && res.result ? res.result : {}
      if (result.ok === false) {
        console.warn('[WXCloudProgressSync] cloud int save failed:', result.error || result, 'source:', source)
        pendingCloudIntValue = valueToSave
        return
      }

      lastSyncedCloudIntValue = parseCloudIntValue(result.cloudIntValue)
      console.log('[WXCloudProgressSync] cloud int saved:', lastSyncedCloudIntValue, 'progress:', result.progress || 0, 'recordId:', result.recordId || '', 'fileID:', result.fileID || '', 'mode:', result.mode || '', 'source:', source)
      notifyUnityCloudIntValue(lastSyncedCloudIntValue, 'cloud-int-save-' + source)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] callFunction setCloudIntValue fail:', error, 'source:', source)
      pendingCloudIntValue = valueToSave
    },
    complete() {
      cloudIntSaving = false
      if (pendingCloudIntValue !== null && pendingCloudIntValue !== lastSyncedCloudIntValue) {
        setTimeout(function retryPendingCloudIntValue() {
          syncCloudIntValueToCloud(pendingCloudIntValue, 'pending')
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
  if (!initCloud()) return

  restoredOnce = true
  loading = true
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: buildCloudData('get'),
    success(res) {
      const result = res && res.result ? res.result : {}
      if (result.ok === false) {
        console.warn('[WXCloudProgressSync] load failed:', result.error || result)
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
        console.log('[WXCloudProgressSync] cloud file restored local progress:', progress, 'mode:', result.mode || '')
        notifyUnityProgress(progress, 'cloud-file-restore')
      } else {
        console.log('[WXCloudProgressSync] cloud file loaded:', cloudProgress, 'local:', localProgress, 'mode:', result.mode || '', 'error:', result.error || '')
        if (progress > 0) notifyUnityProgress(progress, 'cloud-file-loaded')
      }
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] callFunction get fail:', error)
    },
    complete() {
      loading = false
    },
  })
}

function restoreCloudIntValueFromCloud(force) {
  if (cloudIntLoading) {
    if (force) {
      setTimeout(function retryForcedCloudIntRestore() { restoreCloudIntValueFromCloud(true) }, 800)
    }
    return
  }
  if (cloudIntRestoredOnce && !force) return
  if (!initCloud()) return

  cloudIntRestoredOnce = true
  cloudIntLoading = true
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: buildCloudIntData('getCloudIntValue'),
    success(res) {
      const result = res && res.result ? res.result : {}
      if (result.ok === false) {
        console.warn('[WXCloudProgressSync] cloud int load failed:', result.error || result)
        return
      }

      const cloudValue = parseCloudIntValue(result.cloudIntValue)
      const localValue = getLocalCloudIntValue()
      const hasCloudValue = !!result.hasCloudIntValue
      const value = hasCloudValue ? cloudValue : localValue
      lastSyncedCloudIntValue = cloudValue

      if (hasCloudValue && value !== localValue) {
        syncingFromCloud = true
        wx.setStorageSync(CLOUD_INT_KEY, String(value))
        syncingFromCloud = false
        console.log('[WXCloudProgressSync] cloud int restored local value:', value, 'mode:', result.mode || '')
      } else {
        console.log('[WXCloudProgressSync] cloud int loaded:', cloudValue, 'local:', localValue, 'hasCloudValue:', hasCloudValue, 'mode:', result.mode || '', 'error:', result.error || '')
      }
      notifyUnityCloudIntValue(value, hasCloudValue ? 'cloud-int-restore' : 'cloud-int-local-loaded')
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] callFunction getCloudIntValue fail:', error)
    },
    complete() {
      cloudIntLoading = false
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
    if (key === CLOUD_INT_KEY) {
      syncCloudIntValueToCloud(value, 'setStorageSync')
    }
    return result
  }

  wx.__HYFCloudProgressPatched = true
  console.log('[WXCloudProgressSync] wx.setStorageSync patched')
}

function startupRestore(source) {
  const localProgress = getLocalProgress()
  if (localProgress > 0) {
    console.log('[WXCloudProgressSync] startup local progress:', localProgress, 'source:', source)
    notifyUnityProgress(localProgress, 'startup-local-' + source)
    syncProgressToCloud(localProgress, 'startup-local-' + source)
  }

  const localCloudIntValue = getLocalCloudIntValue()
  console.log('[WXCloudProgressSync] startup local cloud int:', localCloudIntValue, 'source:', source)
  notifyUnityCloudIntValue(localCloudIntValue, 'startup-local-cloud-int-' + source)

  restoreProgressFromCloud(true)
  restoreCloudIntValueFromCloud(true)
}

patchStorageSync()
startupRestore('immediate')
setTimeout(function restoreAtOneSecond() { startupRestore('1s') }, 1000)
setTimeout(function restoreAtThreeSeconds() { startupRestore('3s') }, 3000)
setTimeout(function restoreAtSixSeconds() { startupRestore('6s') }, 6000)

if (typeof GameGlobal !== 'undefined') {
  GameGlobal.__HYFSaveProgressToCloud = syncProgressToCloud
  GameGlobal.__HYFRestoreProgressFromCloud = function () { restoreProgressFromCloud(false) }
  GameGlobal.__HYFSaveCloudIntValueToCloud = syncCloudIntValueToCloud
  GameGlobal.__HYFRestoreCloudIntValueFromCloud = function () { restoreCloudIntValueFromCloud(false) }
  console.log('[WXCloudProgressSync] bridge ready')
} else {
  console.warn('[WXCloudProgressSync] GameGlobal not available')
}
