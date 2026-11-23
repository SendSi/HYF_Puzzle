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
// 提示增减串行队列：避免连续用提示时云函数并发 read-modify-write 互相覆盖
let hintQueue = Promise.resolve()

// SendMessage 在微信小游戏里不是全局变量，需要从 Unity 模块/管理器上取。
// 直接 typeof SendMessage 判断会永远为 false，导致所有回调静默丢失。
function getUnitySendMessage() {
  try {
    if (typeof SendMessage === 'function') return SendMessage
    if (typeof GameGlobal !== 'undefined') {
      if (GameGlobal.Module && typeof GameGlobal.Module.SendMessage === 'function') return GameGlobal.Module.SendMessage
      if (GameGlobal.manager && typeof GameGlobal.manager.SendMessage === 'function') return GameGlobal.manager.SendMessage
      if (GameGlobal.unityInstance && typeof GameGlobal.unityInstance.SendMessage === 'function') return GameGlobal.unityInstance.SendMessage
    }
  } catch (error) {
    console.warn('[WXCloudProgressSync] resolve SendMessage failed:', error)
  }
  return null
}

function sendToUnity(gameObject, method, param) {
  const send = getUnitySendMessage()
  if (!send) {
    console.warn('[WXCloudProgressSync] SendMessage unavailable for ' + method)
    return false
  }
  try {
    if (param === undefined) send(gameObject, method)
    else send(gameObject, method, param)
    return true
  } catch (error) {
    console.warn('[WXCloudProgressSync] sendToUnity ' + method + ' failed:', error)
    return false
  }
}

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
    if (sendToUnity('WXCloudStorageCallbackObj', 'OnLocalLoaded', String(progress))) {
      console.log('[WXCloudProgressSync] notified unity:', progress, 'source:', source)
    }
  }

  notify()
  setTimeout(notify, 1000)
  setTimeout(notify, 3000)
}

function notifyUnityCloudIntValue(value, source) {
  value = parseCloudIntValue(value)

  const notify = function () {
    if (sendToUnity('WXCloudStorageCallbackObj', 'OnCloudIntValueLocalLoaded', String(value))) {
      console.log('[WXCloudProgressSync] notified unity cloud int:', value, 'source:', source)
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
    if (sendToUnity('WXCloudStorageCallbackObj', 'OnProfileLoaded', json)) {
      console.log('[WXCloudProgressSync] notified unity profile:', source)
    } else {
      console.warn('[WXCloudProgressSync] notify unity profile SKIPPED, source:', source)
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
  console.log('[WXCloudProgressSync] profile loaded:', JSON.stringify({ source: source, hints: profile.hints, hintReward: result.hintReward }))
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

// 兼容历史云函数版本返回的字段：signIn -> signed，code:0 -> ok:true
function normalizeSignInResult(result) {
  if (!result || typeof result !== 'object') return result
  const normalized = Object.assign({}, result)
  const profile = parseProfile(normalized.profile)
  if (profile) {
    const daily = profile.daily && typeof profile.daily === 'object'
      ? Object.assign({}, profile.daily)
      : {}
    if (typeof daily.signed !== 'boolean' && typeof daily.signIn === 'boolean') {
      daily.signed = daily.signIn
    }
    profile.daily = daily
    normalized.profile = profile
  }
  if (normalized.ok === undefined && normalized.code === 0) normalized.ok = true
  if (normalized.hintReward === undefined && profile && profile.daily) {
    normalized.hintReward = parseInt(profile.daily.hintReward || 0, 10)
  }
  return normalized
}

function showSignInToast(hintReward, source) {
  const amount = parseInt(hintReward || 0, 10)
  if (amount <= 0) return
  try {
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({
        title: '签到成功 +' + amount + ' 提示',
        icon: 'none',
        duration: 2500,
      })
      console.log('[WXCloudProgressSync] sign-in toast shown:', amount, 'source:', source)
    }
  } catch (error) {
    console.warn('[WXCloudProgressSync] sign-in toast failed:', error)
  }
}

function dailySignInToCloud(source) {
  if (!initCloud()) return

  console.log('[WXCloudProgressSync] dailySignIn request: ' + source)
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'dailySignIn' },
    success(res) {
      const raw = res && res.result
      console.log('[WXCloudProgressSync] dailySignIn raw:', JSON.stringify(raw))
      const result = normalizeSignInResult(raw)
      handleProfileResult(result, 'daily-sign-in-' + source, null)

      const hintReward = result ? parseInt(result.hintReward || 0, 10) : 0
      const signedToday = result ? result.signedToday === true : false
      let toastDate = ''
      try { toastDate = wx.getStorageSync('hyf_sign_toast_date') || '' } catch (error) { toastDate = '' }
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
      if (!signedToday && hintReward > 0 && toastDate !== today) {
        showSignInToast(hintReward, source)
        try { wx.setStorageSync('hyf_sign_toast_date', today) } catch (error) { /* ignore */ }
      }
      // 再拉一次档案，确保 C# 侧提示数量刷新
      setTimeout(function refreshProfileAfterSignIn() {
        loadProfileFromCloud(true)
      }, 400)
    },
    fail(error) {
      console.warn('[WXCloudProgressSync] dailySignIn fail:', error, 'source:', source)
    },
  })
}

function changeHintsToCloud(delta, source) {
  const amount = parseInt(delta || 0, 10)
  if (!amount || !initCloud()) return

  console.log('[WXCloudProgressSync] changeHints request:', amount, 'source:', source)

  // 乐观更新：先本地扣/加并立即通知 Unity，UI 不用等云函数回包
  const localProfile = getLocalProfile()
  if (localProfile) {
    const beforeHints = parseInt(localProfile.hints || 0, 10)
    localProfile.hints = Math.max(0, beforeHints + amount)
    writeLocalProfile(localProfile)
    notifyUnityProfile(localProfile, 'hint-optimistic-' + source)
    console.log('[WXCloudProgressSync] hint optimistic:', beforeHints, '->', localProfile.hints)
  }

  // 串行执行云端扣减，保证连续用提示不会并发覆盖
  hintQueue = hintQueue.then(function () {
    return new Promise(function (resolve) {
      wx.cloud.callFunction({
        name: CLOUD_FUNCTION_NAME,
        data: amount > 0 ? { action: 'addHint', amount } : { action: 'useHint' },
        success(res) {
          const result = res && res.result
          console.log('[WXCloudProgressSync] changeHints result:', JSON.stringify(result), 'delta:', amount)
          // 用云端权威结果覆盖；失败则用本地乐观值兜底，不让 UI 回跳
          if (!handleProfileResult(result, 'change-hints-' + source, null) && localProfile) {
            notifyUnityProfile(localProfile, 'hint-fallback-' + source)
          }
        },
        fail(error) {
          console.warn('[WXCloudProgressSync] change hints fail:', error, 'source:', source)
          if (localProfile) notifyUnityProfile(localProfile, 'hint-fail-fallback-' + source)
        },
        complete() {
          resolve()
        },
      })
    })
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
      if (sendToUnity('WXCloudStorageCallbackObj', 'OnRankListLoaded', JSON.stringify(result.list))) {
        console.log('[WXCloudProgressSync] notified unity rank list:', source)
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
