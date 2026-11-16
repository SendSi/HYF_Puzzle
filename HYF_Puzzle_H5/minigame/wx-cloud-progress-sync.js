const PROGRESS_KEY = 'game_progress_local'
const CLOUD_INT_KEY = 'cloud_int_value_local'
const PROFILE_KEY = 'game_profile_local'
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
let profileLoading = false
let profileRestoredOnce = false
let profileSaving = false
let pendingProfile = null
let suppressProfileSync = false

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

function parseProfile(value) {
  if (!value) return null
  try {
    if (typeof value === 'object') return value
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    return null
  }
}

function getLocalProfile() {
  try {
    return parseProfile(wx.getStorageSync(PROFILE_KEY))
  } catch (error) {
    return null
  }
}

function writeLocalProfile(profile) {
  if (!profile) return
  try {
    suppressProfileSync = true
    wx.setStorageSync(PROFILE_KEY, JSON.stringify(profile))
  } catch (error) {
    console.warn('[WXCloudProgressSync] write local profile failed:', error)
  } finally {
    suppressProfileSync = false
  }
}

function notifyUnityProfile(profile, source) {
  if (!profile) return
  const json = JSON.stringify(profile)
  const notify = function () {
    try {
      if (typeof SendMessage === 'function') {
        SendMessage('WXCloudStorageCallbackObj', 'OnProfileLoaded', json)
        console.log('[WXCloudProgressSync] notified unity profile:', source)
      }
    } catch (error) {
      console.warn('[WXCloudProgressSync] notify unity profile failed:', error, 'source:', source)
    }
  }
  notify()
  setTimeout(notify, 800)
}

function handleProfileResult(result, source, fallbackProfile) {
  if (!result || result.ok === false) {
    console.warn('[WXCloudProgressSync] profile cloud call failed:', result && result.error, 'source:', source)
    return false
  }

  const profile = parseProfile(result.profile) || fallbackProfile
  if (!profile) return false
  writeLocalProfile(profile)
  notifyUnityProfile(profile, source)
  return true
}

function saveProfileToCloud(profile, source) {
  const payload = parseProfile(profile)
  if (!payload || !initCloud()) return

  pendingProfile = payload
  if (profileSaving) return

  profileSaving = true
  const toSave = pendingProfile
  pendingProfile = null

  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'saveProfile', profile: toSave },
    success(res) {
      handleProfileResult(res && res.result, 'profile-save-' + source, toSave)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] saveProfile fail:', error, 'source:', source)
      pendingProfile = toSave
    },
    complete() {
      profileSaving = false
      if (pendingProfile) {
        setTimeout(function retryPendingProfile() {
          saveProfileToCloud(pendingProfile, 'pending')
        }, 3000)
      }
    },
  })
}

function reportLevelClearToCloud(payload, source) {
  const report = parseProfile(payload)
  if (!report || !initCloud()) return

  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: {
      action: 'reportLevelClear',
      level: parseInt(report.level || 0, 10),
      stars: parseInt(report.stars || 1, 10),
      timeMs: parseInt(report.timeMs || 0, 10),
      hintsUsed: parseInt(report.hintsUsed || 0, 10),
    },
    success(res) {
      handleProfileResult(res && res.result, 'level-clear-' + source, null)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] reportLevelClear fail:', error, 'source:', source)
    },
  })
}

function dailySignInToCloud(source) {
  if (!initCloud()) return

  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'dailySignIn' },
    success(res) {
      handleProfileResult(res && res.result, 'daily-sign-in-' + source, null)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] dailySignIn fail:', error, 'source:', source)
    },
  })
}

function changeHintsToCloud(delta, source) {
  const amount = parseInt(delta || 0, 10)
  if (!amount || !initCloud()) return

  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: amount > 0 ? { action: 'addHint', amount } : { action: 'useHint' },
    success(res) {
      handleProfileResult(res && res.result, 'change-hints-' + source, null)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] change hints fail:', error, 'source:', source)
    },
  })
}

function loadRankListToCloud(source) {
  if (!initCloud()) return

  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'getRankList' },
    success(res) {
      const result = res && res.result
      if (!result || result.ok === false || !Array.isArray(result.list)) {
        console.warn('[WXCloudProgressSync] getRankList failed:', result && result.warning, 'source:', source)
        return
      }
      try {
        if (typeof SendMessage === 'function') {
          SendMessage('WXCloudStorageCallbackObj', 'OnRankListLoaded', JSON.stringify(result.list))
          console.log('[WXCloudProgressSync] notified unity rank list:', source)
        }
      } catch (error) {
        console.warn('[WXCloudProgressSync] notify rank list failed:', error)
      }
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] getRankList fail:', error, 'source:', source)
    },
  })
}

function loadProfileFromCloud(force) {
  if (profileLoading) {
    if (force) {
      setTimeout(function retryForcedProfileRestore() { loadProfileFromCloud(true) }, 800)
    }
    return
  }
  if (profileRestoredOnce && !force) return
  if (!initCloud()) return

  profileRestoredOnce = true
  profileLoading = true
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'getProfile' },
    success(res) {
      const result = res && res.result
      const cloudProfile = parseProfile(result && result.profile)
      const localProfile = getLocalProfile()
      const cloudProgress = cloudProfile ? parseInt(cloudProfile.progress || 0, 10) : 0
      const localProgress = localProfile ? parseInt(localProfile.progress || 0, 10) : 0

      if (localProgress > cloudProgress && result && result.ok !== false) {
        saveProfileToCloud(localProfile, 'local-ahead')
        return
      }

      if (!handleProfileResult(result, 'profile-restore', localProfile) && localProfile) {
        notifyUnityProfile(localProfile, 'profile-local-fallback')
      }
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] getProfile fail:', error)
      const localProfile = getLocalProfile()
      if (localProfile) notifyUnityProfile(localProfile, 'profile-local-fallback')
    },
    complete() {
      profileLoading = false
    },
  })
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
    if (key === PROFILE_KEY && !suppressProfileSync && !syncingFromCloud) {
      saveProfileToCloud(value, 'setStorageSync')
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

  const localProfile = getLocalProfile()
  if (localProfile) {
    notifyUnityProfile(localProfile, 'startup-local-' + source)
  }

  restoreProgressFromCloud(true)
  restoreCloudIntValueFromCloud(true)
  loadProfileFromCloud(source === '3s')
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
  GameGlobal.__HYFSaveProfileToCloud = saveProfileToCloud
  GameGlobal.__HYFLoadProfileFromCloud = function () { loadProfileFromCloud(false) }
  GameGlobal.__HYFReportLevelClear = reportLevelClearToCloud
  GameGlobal.__HYFDailySignIn = dailySignInToCloud
  GameGlobal.__HYFUseHint = function () { changeHintsToCloud(-1, 'wasm') }
  GameGlobal.__HYFAddHint = function (amount) { changeHintsToCloud(amount, 'wasm') }
  GameGlobal.__HYFLoadRankList = function () { loadRankListToCloud('wasm') }
  console.log('[WXCloudProgressSync] bridge ready')
} else {
  console.warn('[WXCloudProgressSync] GameGlobal not available')
}
