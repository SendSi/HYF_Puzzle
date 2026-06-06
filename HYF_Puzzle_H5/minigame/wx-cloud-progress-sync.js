const PROGRESS_KEY = 'game_progress_local'
const CLOUD_FUNCTION_NAME = 'progressStorage'

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

function syncProgressToCloud(progress, source) {
  progress = parseProgress(progress)
  if (progress <= 0 || syncingFromCloud) return
  if (!initCloud()) return
  if (progress <= lastSyncedProgress) return

  pendingProgress = Math.max(pendingProgress, progress)
  if (saving) return

  saving = true
  const progressToSave = pendingProgress
  pendingProgress = 0

  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'set', progress: progressToSave },
    success(res) {
      const result = res && res.result ? res.result : {}
      if (result.ok === false) {
        console.warn('[WXCloudProgressSync] save failed:', result.error || result, 'source:', source)
        return
      }

      lastSyncedProgress = Math.max(lastSyncedProgress, parseProgress(result.progress || progressToSave))
      console.log('[WXCloudProgressSync] saved:', lastSyncedProgress, 'recordId:', result.recordId || '', 'source:', source)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] callFunction set fail:', error, 'source:', source)
    },
    complete() {
      saving = false
      if (pendingProgress > lastSyncedProgress) {
        syncProgressToCloud(pendingProgress, 'pending')
      }
    },
  })
}

function restoreProgressFromCloud(force) {
  if (loading) return
  if (restoredOnce && !force) return
  if (!initCloud()) return

  restoredOnce = true
  loading = true
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'get' },
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
        console.log('[WXCloudProgressSync] restored local progress:', progress)
      } else {
        console.log('[WXCloudProgressSync] loaded:', cloudProgress, 'local:', localProgress)
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
setTimeout(function syncOnStartup() {
  const localProgress = getLocalProgress()
  if (localProgress > 0) {
    syncProgressToCloud(localProgress, 'startup-local')
  } else {
    restoreProgressFromCloud(false)
  }
}, 1000)

GameGlobal.__HYFSaveProgressToCloud = syncProgressToCloud
GameGlobal.__HYFRestoreProgressFromCloud = function () { restoreProgressFromCloud(false) }
