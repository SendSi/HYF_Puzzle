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
let lastProfileLoadAt = 0
let profileLoadRetry = 0
let profileSaving = false
let pendingProfile = null
let suppressProfileSync = false
// 提示增减串行队列：避免连续用提示时云函数并发 read-modify-write 互相覆盖
let hintQueue = Promise.resolve()

// SendMessage 在微信小游戏里不是全局变量，需要从 Unity 模块/管理器上取。
// 直接 typeof SendMessage 判断会永远为 false，导致所有回调静默丢失。
let resolvedSendChannel = ''

// Unity 是否已经"活过来"：SendMessage 在 GameObject 还没创建时不会报错，
// 所以只能靠 Unity 主动调用桥接函数来判定。启动阶段（0~6s）推送的消息
// 在真机上经常全丢，就是这个原因。
let unityAlive = false

function markUnityAlive(reason) {
  if (unityAlive) return
  unityAlive = true
  console.log('[WXCloudProgressSync] unity bridge alive:', reason, '| channel:', resolvedSendChannel || 'none')
}

function getUnitySendMessage() {
  try {
    const g = typeof GameGlobal !== 'undefined' ? GameGlobal : null
    const ns = g && g.unityNamespace ? g.unityNamespace : null

    // 新版 Unity WebGL(微信) SDK：Unity 模块挂在 unityNamespace.UnityModule 上
    // （导出产物 webgl.wasm.framework.unityweb.js 里只有
    //   GameGlobal.unityNamespace.UnityModule = unityFramework，
    //   并没有 GameGlobal.Module，找错位置会导致所有回调静默丢弃）
    if (ns && ns.UnityModule && typeof ns.UnityModule.SendMessage === 'function') {
      if (resolvedSendChannel !== 'unityNamespace.UnityModule') {
        resolvedSendChannel = 'unityNamespace.UnityModule'
        console.log('[WXCloudProgressSync] SendMessage channel:', resolvedSendChannel)
      }
      return ns.UnityModule.SendMessage
    }

    if (g) {
      // 老版 SDK 的挂载方式，保留兼容
      if (g.Module && typeof g.Module.SendMessage === 'function') {
        if (resolvedSendChannel !== 'GameGlobal.Module') {
          resolvedSendChannel = 'GameGlobal.Module'
          console.log('[WXCloudProgressSync] SendMessage channel:', resolvedSendChannel)
        }
        return g.Module.SendMessage
      }
      if (ns && ns.Module && typeof ns.Module.SendMessage === 'function') {
        if (resolvedSendChannel !== 'unityNamespace.Module') {
          resolvedSendChannel = 'unityNamespace.Module'
          console.log('[WXCloudProgressSync] SendMessage channel:', resolvedSendChannel)
        }
        return ns.Module.SendMessage
      }
      if (g.manager && typeof g.manager.SendMessage === 'function') {
        resolvedSendChannel = 'GameGlobal.manager'
        return g.manager.SendMessage
      }
      if (g.unityInstance && typeof g.unityInstance.SendMessage === 'function') {
        resolvedSendChannel = 'GameGlobal.unityInstance'
        return g.unityInstance.SendMessage
      }
    }

    if (typeof SendMessage === 'function') {
      resolvedSendChannel = 'global.SendMessage'
      return SendMessage
    }
  } catch (error) {
    console.warn('[WXCloudProgressSync] resolve SendMessage failed:', error)
  }
  return null
}

let reportedChannelMissing = false
let cloudFailReported = false

function sendToUnity(gameObject, method, param) {
  const send = getUnitySendMessage()
  if (!send) {
    if (!reportedChannelMissing) {
      reportedChannelMissing = true
      let keys = ''
      try {
        const g = typeof GameGlobal !== 'undefined' ? GameGlobal : null
        const ns = g && g.unityNamespace ? g.unityNamespace : null
        keys = 'GameGlobal=' + !!g + ' unityNamespace=' + !!ns +
          ' nsKeys=' + (ns ? Object.keys(ns).join(',') : '-') +
          ' hasModule=' + !!(g && g.Module)
      } catch (error) { keys = 'inspect failed: ' + error }
      console.warn('[WXCloudProgressSync] SendMessage unavailable for ' + method + ' | ' + keys)
    }
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

// 把本地缓存的档案投递给 Unity（带进度对齐 + 自愈补关）。
function deliverCachedProfile(tag) {
  const localProfile = getLocalProfile()
  if (!localProfile) return false
  const localProgress = getLocalProgress()
  const profileProgress = parseInt(localProfile.progress || 0, 10)
  if (localProgress > profileProgress) localProfile.progress = localProgress
  notifyUnityProfile(localProfile, tag)
  return true
}

// 延迟兜底投递：真机上 Unity 场景 + HybridCLR 热更加载经常要 8s 以上，
// 启动早期的 push 全部丢失；这里在更晚的时间点重投缓存档案。
// 一旦 Unity 主动请求过档案（unityAlive），就停手，交给云端强制刷新，
// 避免旧缓存把新数据盖回去。
const PROFILE_REDELIVERY_MS = [8000, 12000, 18000, 25000, 35000, 50000, 70000]
PROFILE_REDELIVERY_MS.forEach(function (delay) {
  setTimeout(function redeliverProfile() {
    if (unityAlive) return
    if (deliverCachedProfile('late-delivery-' + delay)) {
      console.log('[WXCloudProgressSync] late profile delivery at', delay, 'ms')
    }
  }, delay)
})

// 必须显式指定环境：不传 env 时会用"默认环境"，
// 一旦后台没把该环境设为默认，所有 wx.cloud 调用都会报
// "当前环境 undefined"，表现为 callFunction 直接 fail。
const CLOUD_ENV = 'cloud1-4g6ek89l1ec65c3f'

let cloudInitError = ''

function getCloudErrorInfo(error) {
  if (!error) return { code: '', msg: '' }
  const code = error.errCode !== undefined && error.errCode !== null
    ? String(error.errCode)
    : (error.code !== undefined && error.code !== null ? String(error.code) : '')
  const msg = String(error.errMsg || error.message || error || '')
  return { code: code, msg: msg }
}

function initCloud() {
  if (cloudReady) return true
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.init || !wx.cloud.callFunction) {
    cloudInitError = 'wx.cloud not available'
    console.warn('[WXCloudProgressSync] wx.cloud not available')
    return false
  }

  try {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
    cloudReady = true
    cloudInitError = ''
    console.log('[WXCloudProgressSync] cloud initialized, env:', CLOUD_ENV)
    return true
  } catch (error) {
    const info = getCloudErrorInfo(error)
    cloudInitError = 'init fail code=' + info.code + ' ' + info.msg
    console.warn('[WXCloudProgressSync] cloud init failed:', info.code, info.msg)
    return false
  }
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

// 数据自愈：progress 表示"下一个可玩关卡"，1..progress-1 都应视为已通关。
// 历史版本 progress 走文件通道、levels 走数据库通道，会出现"解锁 N 关但 levels 全空"，
// 表现就是关卡列表第 1~N 关全显示"需完成"。这里在推给 Unity 前统一补齐。
function healProfileByProgress(profile) {
  if (!profile || typeof profile !== 'object') return profile
  const progress = parseInt(profile.progress || 0, 10)
  if (!(progress > 1)) return profile

  const source = profile.levels && typeof profile.levels === 'object' && !Array.isArray(profile.levels)
    ? profile.levels
    : {}
  const levels = Object.assign({}, source)
  let changed = false
  for (let level = 1; level < progress; level++) {
    const key = String(level)
    const rec = levels[key]
    if (rec && typeof rec === 'object' && parseInt(rec.stars || 0, 10) > 0) continue
    levels[key] = {
      stars: 1,
      bestTimeMs: (rec && parseInt(rec.bestTimeMs || 0, 10)) || 0,
      hintsUsed: (rec && parseInt(rec.hintsUsed || 0, 10)) || 0,
      firstClearAt: (rec && parseInt(rec.firstClearAt || 0, 10)) || Date.now(),
      lastClearAt: Date.now(),
    }
    changed = true
  }
  if (changed) profile.levels = levels
  return profile
}

function notifyUnityProfile(rawProfile, source) {
  const profile = healProfileByProgress(rawProfile)
  if (!profile) return
  const json = JSON.stringify(profile)
  const levelCount = profile.levels && typeof profile.levels === 'object' ? Object.keys(profile.levels).length : 0
  const notify = function (tag) {
    if (sendToUnity('WXCloudStorageCallbackObj', 'OnProfileLoaded', json)) {
      console.log('[WXCloudProgressSync] notified unity profile:', source, tag, 'levels:', levelCount)
    } else {
      console.warn('[WXCloudProgressSync] notify unity profile SKIPPED, source:', source, tag)
    }
  }

  notify('immediate')
  // Unity 侧 GameObject 可能还没创建，早期几次会被静默丢弃，所以补投几次；
  // 一旦 Unity 主动调用过桥接函数（unityAlive），说明消息已能送达，
  // 就不再重复投递，避免选关页被重复刷新/重建。
  ;[800, 2000, 4000].forEach(function (delay) {
    setTimeout(function retryNotify() {
      if (unityAlive) return
      notify('retry-' + delay)
    }, delay)
  })
}

function handleProfileResult(result, source, fallbackProfile) {
  if (!result || result.ok === false) {
    console.warn('[WXCloudProgressSync] profile cloud call failed:', result && result.error, 'source:', source)
    return false
  }

  const profile = parseProfile(result.profile) || fallbackProfile
  if (!profile) return false

  // 关键兜底：真机的"已解锁 N 关"来自本地 game_progress_local（文件通道），
  // 而云端档案的 progress 可能仍是 0，导致云函数自愈按 progress=0 不补 levels。
  // 这里用本地进度/localProfile 提升 profile.progress，再由 notifyUnityProfile 补齐 levels。
  const localProgressCache = getLocalProgress()
  const fallbackProgress = fallbackProfile ? parseInt(fallbackProfile.progress || 0, 10) : 0
  const effectiveProgress = Math.max(
    parseInt(profile.progress || 0, 10) || 0,
    localProgressCache > 0 ? localProgressCache : 0,
    fallbackProgress > 0 ? fallbackProgress : 0
  )
  if (effectiveProgress > 0 && effectiveProgress !== parseInt(profile.progress || 0, 10)) {
    profile.progress = effectiveProgress
  }

  healProfileByProgress(profile)
  console.log('[WXCloudProgressSync] profile loaded:', JSON.stringify({
    source: source,
    progress: profile.progress,
    levelCount: profile.levels && typeof profile.levels === 'object' ? Object.keys(profile.levels).length : 0,
    hints: profile.hints,
    coins: profile.coins,
    hintReward: result.hintReward,
  }))
  writeLocalProfile(profile)
  notifyUnityProfile(profile, source)

  // 离线签到过的记录：云端恢复后立即补同步，避免线上档案缺这一天
  try {
    const pendingSign = wx.getStorageSync('hyf_pending_sign_sync')
    if (pendingSign) {
      wx.removeStorageSync('hyf_pending_sign_sync')
      setTimeout(function flushPendingSign() { saveProfileToCloud(profile, 'pending-sign-sync') }, 500)
    }
  } catch (error) { /* ignore */ }

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

function showToastSafe(title) {
  try {
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: title, icon: 'none', duration: 2500 })
    }
  } catch (error) {
    console.warn('[WXCloudProgressSync] showToast failed:', error)
  }
}

function beijingToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 云端不可用时的离线兜底：本地发放签到奖励，恢复联网后再合并上云，
// 避免"云挂了 → 按钮完全没反应 → 玩家以为坏了"。
function localSignInFallback(source, reason) {
  let profile = getLocalProfile()
  if (!profile) {
    profile = { progress: getLocalProgress(), levels: {}, hints: 0, coins: 0, daily: {} }
  }
  const today = beijingToday()
  const daily = profile.daily && typeof profile.daily === 'object' ? profile.daily : {}
  const signedToday = daily.date === today && (daily.signed === true || daily.signIn === true)

  if (signedToday) {
    notifyUnityProfile(profile, 'local-sign-already-' + source)
    showToastSafe('今日已签到，明天再来')
    return
  }

  const beforeHints = parseInt(profile.hints || 0, 10)
  profile.hints = beforeHints + 5
  profile.coins = parseInt(profile.coins || 0, 10) + 10
  profile.daily = {
    date: today,
    signed: true,
    signIn: true,
    streak: parseInt(daily.streak || 0, 10) + 1,
    reward: 10,
    hintReward: 5,
  }
  if (!profile.progress) profile.progress = getLocalProgress()
  healProfileByProgress(profile)
  writeLocalProfile(profile)
  notifyUnityProfile(profile, 'local-sign-' + source)
  try { wx.setStorageSync('hyf_pending_sign_sync', today) } catch (error) { /* ignore */ }
  console.warn('[WXCloudProgressSync] offline sign-in applied:', beforeHints, '->', profile.hints, 'reason:', reason)
  showToastSafe('签到成功 +5 提示')
}

function dailySignInToCloud(source) {
  if (!initCloud()) {
    // 云服务不可用时也要有反馈，避免"点了像没反应"
    showToastSafe('云服务未连接，请稍后重试')
    try {
      if (typeof wx !== 'undefined' && typeof wx.showModal === 'function' && cloudInitError) {
        wx.showModal({
          title: '云开发未就绪',
          content: String(cloudInitError).slice(0, 200),
          showCancel: false,
          confirmText: '知道了',
        })
      }
    } catch (modalError) {
      /* ignore */
    }
    return
  }

  console.log('[WXCloudProgressSync] dailySignIn request: ' + source)
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'dailySignIn' },
    success(res) {
      const raw = res && res.result
      console.log('[WXCloudProgressSync] dailySignIn raw:', JSON.stringify(raw))
      const result = normalizeSignInResult(raw)
      handleProfileResult(result, 'daily-sign-in-' + source, null)

      const ok = result ? result.ok !== false : false
      const signedBefore = !!(result && result.signedToday === true)
      const hintReward = result ? parseInt(result.hintReward || 0, 10) : 0
      console.log('[WXCloudProgressSync] dailySignIn decided:', JSON.stringify({
        ok: ok,
        signedToday: signedBefore,
        hintReward: hintReward,
      }))

      if (signedBefore) {
        // 云端判定今天已经签过：必须给提示，否则用户以为按钮坏了
        showToastSafe('今日已签到，明天再来')
      } else if (ok && hintReward > 0) {
        let toastDate = ''
        try { toastDate = wx.getStorageSync('hyf_sign_toast_date') || '' } catch (error) { toastDate = '' }
        const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
        if (toastDate !== today) {
          showSignInToast(hintReward, source)
          try { wx.setStorageSync('hyf_sign_toast_date', today) } catch (error) { /* ignore */ }
        }
      } else if (ok) {
        showToastSafe('签到成功')
      } else {
        showToastSafe('签到失败，请稍后重试')
        console.warn('[WXCloudProgressSync] dailySignIn error:', result && result.error)
      }

      // 再拉一次档案，确保 C# 侧提示数量刷新
      setTimeout(function refreshProfileAfterSignIn() {
        loadProfileFromCloud(true)
      }, 400)
    },
    fail(error) {
      const info = getCloudErrorInfo(error)
      console.warn('[WXCloudProgressSync] dailySignIn fail:', JSON.stringify(info), 'source:', source)
      // 调试期把真实错误码露出来，便于定位（网络/环境/配额/超时）
      try {
        if (typeof wx !== 'undefined' && typeof wx.showModal === 'function') {
          wx.showModal({
            title: '云函数调用失败',
            content: 'code=' + (info.code || '?') + '\n' + String(info.msg || '').slice(0, 200),
            showCancel: false,
            confirmText: '知道了',
          })
        }
      } catch (modalError) {
        /* ignore */
      }
      // 云端失败也要能签到，先本地发放，联网后自动补同步
      localSignInFallback(source, 'cloud-fail-' + (info.code || info.msg))
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

// 排行榜兜底：云端不可用时用本地档案拼一条自己的记录。
// 关键点：必须保证有一个结果回传给 Unity，否则界面会永远停在"排行榜加载中..."。
function buildLocalRankFallback(reason) {
  const profile = getLocalProfile() || {}
  const cachedProgress = parseInt(profile.progress || 0, 10) || 0
  const localProgress = getLocalProgress()
  const progress = Math.max(cachedProgress, localProgress, 0)

  const levels = profile.levels && typeof profile.levels === 'object' && !Array.isArray(profile.levels)
    ? profile.levels
    : {}
  let totalStars = 0
  Object.keys(levels).forEach(function (key) {
    if (/^\d+$/.test(key)) {
      totalStars += parseInt((levels[key] || {}).stars || 0, 10) || 0
    }
  })

  console.warn('[WXCloudProgressSync] rank list fallback:', reason, 'progress:', progress, 'stars:', totalStars)
  return [{
    rank: 1,
    openid: '',
    name: '玩家',
    progress: progress,
    totalStars: totalStars,
    coins: parseInt(profile.coins || 0, 10) || 0,
    isSelf: true,
  }]
}

function notifyRankListToUnity(list, source) {
  const rows = Array.isArray(list) ? list : []
  const json = JSON.stringify(rows)
  const sent = sendToUnity('WXCloudStorageCallbackObj', 'OnRankListLoaded', json)
  console.log('[WXCloudProgressSync] rank list -> unity:', rows.length, 'rows, sent:', sent, 'source:', source)
  return sent
}

function ensureSelfRankRow(rows) {
  const list = Array.isArray(rows) ? rows.slice() : []
  let hasSelf = false
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].isSelf) { hasSelf = true; break }
  }
  if (hasSelf) return list

  const self = buildLocalRankFallback('append-self')[0]
  self.rank = list.length + 1
  list.push(self)
  return list
}

function loadRankListToCloud(source) {
  let settled = false
  const timer = setTimeout(function rankListTimeout() {
    finish(buildLocalRankFallback('timeout'), 'timeout')
  }, 8000)

  function finish(list, tag) {
    if (settled) return
    settled = true
    clearTimeout(timer)
    notifyRankListToUnity(list, source + '#' + tag)
  }

  if (!initCloud()) {
    finish(buildLocalRankFallback('cloud-unavailable'), 'cloud-unavailable')
    return
  }

  try {
    wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: { action: 'getRankList' },
      success(res) {
        const result = res && res.result
        const rows = result && Array.isArray(result.list) ? result.list : null
        console.log('[WXCloudProgressSync] getRankList result:', JSON.stringify({
          ok: result && result.ok,
          count: rows ? rows.length : -1,
          selfRank: result && result.selfRank,
          warning: result && result.warning,
          error: result && result.error,
        }), 'source:', source)

        if (!rows) {
          finish(buildLocalRankFallback('invalid-result'), 'invalid-result')
          return
        }
        if (rows.length === 0) {
          finish(buildLocalRankFallback('empty-list'), 'empty-list')
          return
        }
        finish(ensureSelfRankRow(rows), 'cloud')
      },
      fail(error) {
        console.warn('[WXCloudProgressSync] getRankList fail:', error, 'source:', source)
        finish(buildLocalRankFallback('call-fail'), 'call-fail')
      },
    })
  } catch (error) {
    console.warn('[WXCloudProgressSync] getRankList exception:', error, 'source:', source)
    finish(buildLocalRankFallback('exception'), 'exception')
  }
}

function loadProfileFromCloud(force) {
  if (profileLoading) {
    if (force) {
      setTimeout(function retryForcedProfileRestore() { loadProfileFromCloud(true) }, 800)
    }
    return
  }  // 以前这里用 profileRestoredOnce 永久拦截，导致 Unity 启动晚于 6s 时
  // 主动请求档案被忽略，选关页只有进度、没有 levels（全显示"需完成"）。
  // 改成节流：非强制请求 1.5s 内只放行一次。
  if (!force && profileRestoredOnce && Date.now() - lastProfileLoadAt < 1500) return
  if (!initCloud()) return

  profileRestoredOnce = true
  profileLoading = true
  lastProfileLoadAt = Date.now()
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action: 'getProfile' },
    success(res) {
      const result = res && res.result
      const cloudProfile = parseProfile(result && result.profile)
      const localProfile = getLocalProfile()
      const cloudProgress = cloudProfile ? parseInt(cloudProfile.progress || 0, 10) : 0
      const progressCache = getLocalProgress()
      const profileProgress = localProfile ? parseInt(localProfile.progress || 0, 10) : 0
      const localProgress = Math.max(progressCache, profileProgress)

      if (localProgress > cloudProgress && result && result.ok !== false && localProfile) {
        // 本地领先：先把本地进度写进 profile 并补齐 levels，再上报，
        // 否则空的 levels 会被原样写回云端，形成"越同步越空"的死循环。
        localProfile.progress = localProgress
        healProfileByProgress(localProfile)
        writeLocalProfile(localProfile)
        notifyUnityProfile(localProfile, 'local-ahead-optimistic')
        saveProfileToCloud(localProfile, 'local-ahead')
        return
      }

      if (!handleProfileResult(result, 'profile-restore', localProfile) && localProfile) {
        notifyUnityProfile(localProfile, 'profile-local-fallback')
      }
    },
    fail(error) {
      const info = getCloudErrorInfo(error)
      console.warn('[WXCloudProgressSync] getProfile fail:', JSON.stringify(info))
      const localProfile = getLocalProfile()
      if (localProfile) notifyUnityProfile(localProfile, 'profile-local-fallback')
      // 网络抖动时自动重试，避免这一次失败就再也拿不到星级
      if (profileLoadRetry < 2) {
        profileLoadRetry++
        setTimeout(function retryProfileLoad() { loadProfileFromCloud(true) }, 1500 * profileLoadRetry)
      }
      if (!cloudFailReported) {
        cloudFailReported = true
        showToastSafe('云存档连接失败(' + (info.code || '?') + ')')
      }
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
    // 本地 profile 的 progress 可能落后于 game_progress_local（进度走文件通道），
    // 取两者较大值再推，确保自愈能补全到真实解锁关卡。
    const profileProgress = parseInt(localProfile.progress || 0, 10)
    if (localProgress > profileProgress) localProfile.progress = localProgress
    notifyUnityProfile(localProfile, 'startup-local-' + source)
  } else if (localProgress > 0) {
    // 完全没有 profile 缓存时，用进度构造一份最小档案，避免 levels 全空。
    notifyUnityProfile({ progress: localProgress, levels: {} }, 'startup-local-progress-' + source)
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

// 自检：6 秒后仍拿不到 Unity 通道，说明 SDK 挂载方式又变了，给一次可见提示便于定位
setTimeout(function checkUnityChannel() {
  if (getUnitySendMessage()) {
    console.log('[WXCloudProgressSync] unity channel ok:', resolvedSendChannel)
    return
  }
  console.warn('[WXCloudProgressSync] unity channel still unavailable after 6s')
  showToastSafe('云同步通道未就绪')
}, 6000)

if (typeof GameGlobal !== 'undefined') {
  // 这些函数只可能被 Unity 调用，所以调用发生即代表 Unity 已经能收消息。
  GameGlobal.__HYFSaveProgressToCloud = function (progress, source) {
    markUnityAlive('save-progress')
    return syncProgressToCloud(progress, source)
  }
  GameGlobal.__HYFRestoreProgressFromCloud = function () {
    markUnityAlive('restore-progress')
    restoreProgressFromCloud(false)
  }
  GameGlobal.__HYFSaveCloudIntValueToCloud = syncCloudIntValueToCloud
  GameGlobal.__HYFRestoreCloudIntValueFromCloud = function () {
    markUnityAlive('restore-cloud-int')
    restoreCloudIntValueFromCloud(false)
  }
  GameGlobal.__HYFSaveProfileToCloud = function (json, source) {
    markUnityAlive('save-profile')
    return saveProfileToCloud(json, source)
  }
  // Unity 主动请求档案时必须真的去云端拉一次（force），
  // 否则启动早于 Unity 就绪的那次推送丢了以后，选关页永远等不到星级。
  // 先用本地缓存立刻铺一版（打开列表就能看到星级），再用云端结果覆盖。
  GameGlobal.__HYFLoadProfileFromCloud = function () {
    markUnityAlive('load-profile')
    deliverCachedProfile('on-demand-cache')
    loadProfileFromCloud(true)
  }
  GameGlobal.__HYFReportLevelClear = function (json, source) {
    markUnityAlive('report-level-clear')
    return reportLevelClearToCloud(json, source)
  }
  GameGlobal.__HYFDailySignIn = function (source) {
    markUnityAlive('daily-sign-in')
    return dailySignInToCloud(source)
  }
  GameGlobal.__HYFUseHint = function () {
    markUnityAlive('use-hint')
    return changeHintsToCloud(-1, 'wasm')
  }
  GameGlobal.__HYFAddHint = function (amount) {
    markUnityAlive('add-hint')
    return changeHintsToCloud(amount, 'wasm')
  }
  GameGlobal.__HYFLoadRankList = function () {
    markUnityAlive('load-rank-list')
    return loadRankListToCloud('wasm')
  }
  console.log('[WXCloudProgressSync] bridge ready')
} else {
  console.warn('[WXCloudProgressSync] GameGlobal not available')
}
