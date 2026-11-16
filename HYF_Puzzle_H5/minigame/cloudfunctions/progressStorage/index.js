const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const PROGRESS_KEY = 'game_progress'
const CLOUD_INT_KEY = 'cloud_int_value'
const PROFILE_COLLECTION = process.env.PROFILE_COLLECTION || 'user_profiles'
const MAX_LEVEL = 999

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const appid = wxContext.APPID || ''
  const unionid = wxContext.UNIONID || ''
  const env = wxContext.ENV || ''
  const userId = getUserId(openid)
  const context = { openid, appid, unionid }

  if (!userId) {
    return fail(env, 'missing user id', context)
  }

  try {
    if (event.action === 'getProfile') {
      return await getProfile(userId, env, context)
    }

    if (event.action === 'saveProfile') {
      return await saveProfile(userId, env, context, event.profile)
    }

    if (event.action === 'reportLevelClear') {
      return await reportLevelClear(userId, env, context, event)
    }

    if (event.action === 'dailySignIn') {
      return await dailySignIn(userId, env, context)
    }

    if (event.action === 'addHint') {
      return await changeHints(userId, env, context, clampInt(event.amount, 1, 10))
    }

    if (event.action === 'useHint') {
      return await changeHints(userId, env, context, -1)
    }

    if (event.action === 'getRankList') {
      return await getRankList(userId, env, context)
    }

    if (event.action === 'get') {
      return await getProgress(userId, env)
    }

    if (event.action === 'set') {
      const incomingProgress = parseInt(event.progress || 0, 10)
      return await setProgress(userId, Number.isNaN(incomingProgress) ? 0 : incomingProgress, env, context)
    }

    if (event.action === 'getCloudIntValue') {
      return await getCloudIntValue(userId, env)
    }

    if (event.action === 'setCloudIntValue') {
      const incomingValue = parseInt(event.cloudIntValue || 0, 10)
      return await setCloudIntValue(userId, Number.isNaN(incomingValue) ? 0 : incomingValue, env, context)
    }

    return fail(env, 'unknown action', context)
  } catch (error) {
    return fail(env, getErrorMessage(error), context)
  }
}

function fail(env, error, context = {}) {
  return {
    ok: false,
    progress: 0,
    cloudIntValue: 0,
    hints: 0,
    profile: null,
    env,
    appid: context.appid || '',
    error,
  }
}

// ---------------- 结构化用户档案（数据库） ----------------

function createDefaultProfile(userId, context = {}) {
  const now = Date.now()
  return {
    _id: userId,
    userId,
    openid: context.openid || userId,
    appid: context.appid || '',
    progress: 0,
    levels: {},
    cloudIntValue: 0,
    coins: 0,
    hints: 5,
    daily: {},
    settings: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeProfile(raw, userId, context = {}) {
  const base = createDefaultProfile(userId, context)
  if (!raw || typeof raw !== 'object') return base

  return {
    ...base,
    ...raw,
    _id: userId,
    userId,
    openid: context.openid || raw.openid || base.openid,
    progress: clampInt(raw.progress, 0, MAX_LEVEL),
    levels: raw.levels && typeof raw.levels === 'object' && !Array.isArray(raw.levels) ? raw.levels : {},
    cloudIntValue: clampInt(raw.cloudIntValue, 0, 1000000000),
    coins: clampInt(raw.coins, 0, 1000000000),
    hints: hasOwn(raw, 'hints') ? clampInt(raw.hints, 0, 999) : base.hints,
    daily: raw.daily && typeof raw.daily === 'object' && !Array.isArray(raw.daily) ? raw.daily : {},
    settings: raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings) ? raw.settings : {},
    version: clampInt(raw.version, 1, 1000000) || 1,
  }
}

async function readProfileDoc(userId) {
  const db = cloud.database()
  const res = await db.collection(PROFILE_COLLECTION).where({ _id: userId }).limit(1).get()
  return res && res.data && res.data.length > 0 ? res.data[0] : null
}

async function writeProfileDoc(userId, profile, context = {}) {
  const db = cloud.database()
  const clean = normalizeProfile(profile, userId, context)
  const stored = { ...clean, updatedAt: Date.now() }
  const existing = await readProfileDoc(userId)

  if (existing) {
    const data = { ...stored }
    delete data._id
    delete data._openid
    await db.collection(PROFILE_COLLECTION).doc(userId).update({ data })
  } else {
    await db.collection(PROFILE_COLLECTION).add({ data: stored })
  }

  return stored
}

function profileFromLegacyRecord(record, userId, context = {}) {
  const profile = createDefaultProfile(userId, context)
  profile.progress = getRecordProgress(record)
  profile.cloudIntValue = getRecordCloudIntValue(record)
  profile.coins = clampInt(record.coins, 0, 1000000000)
  if (hasOwn(record, 'hints')) {
    profile.hints = clampInt(record.hints, 0, 999)
  }
  profile.daily = record.daily && typeof record.daily === 'object' && !Array.isArray(record.daily) ? record.daily : {}
  return profile
}

async function loadProfile(userId, env, context) {
  let dbError = ''
  let profile = null
  let mode = 'database'

  try {
    const doc = await readProfileDoc(userId)
    if (doc) {
      profile = normalizeProfile(doc, userId, context)
    }
  } catch (error) {
    dbError = getErrorMessage(error)
    mode = 'legacy-file'
  }

  if (!profile) {
    const legacy = await readProgressRecord(userId, env)
    profile = profileFromLegacyRecord(legacy.data, userId, context)
    if (legacy.found) {
      mode = 'legacy-file-migrated'
      try {
        await writeProfileDoc(userId, profile, context)
        mode = 'database-migrated'
      } catch (error) {
        dbError = getErrorMessage(error)
        mode = 'legacy-file'
      }
    }
  }

  return { profile, mode, dbError }
}

async function getProfile(userId, env, context) {
  const loaded = await loadProfile(userId, env, context)
  return {
    ok: true,
    profile: loaded.profile,
    progress: loaded.profile.progress,
    cloudIntValue: loaded.profile.cloudIntValue,
    env,
    appid: context.appid || '',
    mode: loaded.mode,
    error: loaded.dbError || '',
    count: loaded.profile.progress > 0 ? 1 : 0,
  }
}

async function saveProfile(userId, env, context, incoming) {
  const loaded = await loadProfile(userId, env, context)
  const merged = mergeProfile(loaded.profile, incoming, userId, context)

  try {
    const written = await writeProfileDoc(userId, merged, context)
    return {
      ok: true,
      profile: written,
      progress: written.progress,
      cloudIntValue: written.cloudIntValue,
      env,
      mode: 'database',
      saved: true,
    }
  } catch (error) {
    await saveLegacyFallback(userId, env, context, merged)
    return {
      ok: false,
      profile: merged,
      progress: merged.progress,
      cloudIntValue: merged.cloudIntValue,
      env,
      mode: 'legacy-file-fallback',
      saved: false,
      error: getErrorMessage(error),
    }
  }
}

async function reportLevelClear(userId, env, context, event) {
  const level = clampInt(event.level, 0, MAX_LEVEL)
  if (level <= 0) {
    return fail(env, 'invalid level', context)
  }

  const loaded = await loadProfile(userId, env, context)
  const profile = loaded.profile
  const unlocked = Math.max(1, profile.progress)

  if (level > unlocked) {
    return {
      ok: false,
      profile,
      progress: profile.progress,
      cloudIntValue: profile.cloudIntValue,
      env,
      mode: loaded.mode,
      error: 'level locked',
    }
  }

  profile.progress = Math.max(profile.progress, Math.min(MAX_LEVEL, level + 1))
  profile.levels[String(level)] = mergeLevelRecord(
    profile.levels[String(level)],
    {
      stars: clampInt(event.stars, 0, 3) || 1,
      bestTimeMs: clampInt(event.timeMs, 0, 86400000),
      hintsUsed: clampInt(event.hintsUsed, 0, 9999),
      clearedAt: Date.now(),
    },
    event
  )

  try {
    const written = await writeProfileDoc(userId, profile, context)
    return {
      ok: true,
      profile: written,
      progress: written.progress,
      cloudIntValue: written.cloudIntValue,
      env,
      mode: 'database',
      saved: true,
    }
  } catch (error) {
    await saveLegacyFallback(userId, env, context, profile)
    return {
      ok: false,
      profile,
      progress: profile.progress,
      cloudIntValue: profile.cloudIntValue,
      env,
      mode: 'legacy-file-fallback',
      saved: false,
      error: getErrorMessage(error),
    }
  }
}

async function dailySignIn(userId, env, context) {
  const loaded = await loadProfile(userId, env, context)
  const profile = loaded.profile
  const today = getChinaDate()
  const daily = profile.daily && typeof profile.daily === 'object' ? { ...profile.daily } : {}
  const signedToday = daily.date === today && daily.signed === true
  let reward = 0
  let hintReward = 0

  if (!signedToday) {
    const yesterday = getChinaDate(Date.now() - 86400000)
    const streak = daily.date === yesterday ? clampInt(daily.streak, 0, 365) + 1 : 1
    reward = 10 + Math.min(20, streak - 1)
    hintReward = 5
    profile.coins = clampInt(profile.coins, 0, 1000000000) + reward
    profile.hints = clampInt(profile.hints, 0, 999) + hintReward
    profile.daily = {
      date: today,
      signed: true,
      streak,
      lastSignDate: today,
      reward,
      hintReward,
    }
  }

  try {
    const written = await writeProfileDoc(userId, profile, context)
    return {
      ok: true,
      profile: written,
      progress: written.progress,
      cloudIntValue: written.cloudIntValue,
      hints: written.hints,
      env,
      mode: 'database',
      saved: true,
      signedToday,
      reward,
      hintReward,
      date: today,
    }
  } catch (error) {
    await saveLegacyFallback(userId, env, context, profile)
    return {
      ok: false,
      profile,
      progress: profile.progress,
      cloudIntValue: profile.cloudIntValue,
      hints: profile.hints,
      env,
      mode: 'legacy-file-fallback',
      saved: false,
      signedToday,
      reward,
      hintReward,
      date: today,
      error: getErrorMessage(error),
    }
  }
}

async function getRankList(userId, env, context) {
  try {
    const db = cloud.database()
    const res = await db.collection(PROFILE_COLLECTION)
      .field({ openid: true, progress: true, levels: true, coins: true, updatedAt: true })
      .orderBy('progress', 'desc')
      .limit(100)
      .get()

    const rows = (res && res.data ? res.data : []).map((doc, index) => {
      const levels = doc.levels && typeof doc.levels === 'object' ? doc.levels : {}
      let totalStars = 0
      Object.keys(levels).forEach((key) => {
        if (/^\d+$/.test(key)) {
          totalStars += clampInt(levels[key] && levels[key].stars, 0, 3)
        }
      })

      const openid = String(doc.openid || doc._id || '')
      return {
        rank: index + 1,
        openid,
        name: `玩家${openid.length > 4 ? openid.slice(-4) : '****'}`,
        progress: clampInt(doc.progress, 0, MAX_LEVEL),
        totalStars,
        coins: clampInt(doc.coins, 0, 1000000000),
        isSelf: doc._id === userId,
      }
    })

    rows.sort((a, b) => b.progress - a.progress || b.totalStars - a.totalStars || a.rank - b.rank)
    rows.forEach((row, index) => { row.rank = index + 1 })

    const selfEntry = rows.find((row) => row.isSelf) || null
    return {
      ok: true,
      list: rows.slice(0, 20),
      selfRank: selfEntry ? selfEntry.rank : 0,
      total: rows.length,
      env,
      appid: context.appid || '',
    }
  } catch (error) {
    return {
      ok: true,
      list: [],
      selfRank: 0,
      total: 0,
      env,
      appid: context.appid || '',
      warning: getErrorMessage(error),
    }
  }
}

async function changeHints(userId, env, context, delta) {
  if (!delta || delta < -1 || delta > 10) {
    return fail(env, 'invalid hint delta', context)
  }

  const loaded = await loadProfile(userId, env, context)
  const profile = loaded.profile
  const before = clampInt(profile.hints, 0, 999)

  if (delta < 0 && before <= 0) {
    return {
      ok: false,
      profile,
      progress: profile.progress,
      cloudIntValue: profile.cloudIntValue,
      env,
      hints: 0,
      error: 'no hint',
    }
  }

  profile.hints = clampInt(before + delta, 0, 999)

  try {
    const written = await writeProfileDoc(userId, profile, context)
    return {
      ok: true,
      profile: written,
      progress: written.progress,
      cloudIntValue: written.cloudIntValue,
      env,
      mode: 'database',
      saved: true,
      hints: written.hints,
      delta,
    }
  } catch (error) {
    await saveLegacyFallback(userId, env, context, profile)
    return {
      ok: false,
      profile,
      progress: profile.progress,
      cloudIntValue: profile.cloudIntValue,
      env,
      mode: 'legacy-file-fallback',
      saved: false,
      hints: profile.hints,
      delta,
      error: getErrorMessage(error),
    }
  }
}

function getChinaDate(timestamp = Date.now()) {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function mergeProfile(base, incoming, userId, context) {
  const profile = normalizeProfile(base, userId, context)
  if (!incoming || typeof incoming !== 'object') return profile

  profile.progress = Math.max(profile.progress, clampInt(incoming.progress, 0, MAX_LEVEL))
  profile.cloudIntValue = Math.max(profile.cloudIntValue, clampInt(incoming.cloudIntValue, 0, 1000000000))
  profile.coins = Math.max(profile.coins, clampInt(incoming.coins, 0, 1000000000))
  profile.hints = Math.max(profile.hints, clampInt(incoming.hints, 0, 999))

  if (incoming.levels && typeof incoming.levels === 'object' && !Array.isArray(incoming.levels)) {
    Object.keys(incoming.levels).forEach((levelId) => {
      if (!/^\d+$/.test(levelId)) return
      const level = parseInt(levelId, 10)
      if (level <= 0 || level > MAX_LEVEL) return
      profile.levels[levelId] = mergeLevelRecord(profile.levels[levelId], incoming.levels[levelId], incoming.levels[levelId] || {})
    })
  }

  if (incoming.daily && typeof incoming.daily === 'object' && !Array.isArray(incoming.daily)) {
    profile.daily = { ...profile.daily, ...incoming.daily }
  }

  if (incoming.settings && typeof incoming.settings === 'object' && !Array.isArray(incoming.settings)) {
    profile.settings = { ...profile.settings, ...incoming.settings }
  }

  return profile
}

function mergeLevelRecord(oldRecord, incomingRecord) {
  const hasOld = !!oldRecord && typeof oldRecord === 'object'
  const old = hasOld ? oldRecord : {}
  const incoming = incomingRecord && typeof incomingRecord === 'object' ? incomingRecord : {}
  const now = Date.now()

  const bestTimeOld = hasOld ? clampInt(old.bestTimeMs, 0, 86400000) : 0
  const bestTimeIn = clampInt(incoming.bestTimeMs, 0, 86400000)
  const hasBestTimeIn = hasOwn(incoming, 'bestTimeMs') && bestTimeIn > 0
  const bestTimeMs = hasBestTimeIn
    ? (bestTimeOld > 0 ? Math.min(bestTimeOld, bestTimeIn) : bestTimeIn)
    : bestTimeOld

  const hintsOld = hasOld ? clampInt(old.hintsUsed, 0, 9999) : 0
  const hintsIn = clampInt(incoming.hintsUsed, 0, 9999)
  const hintsUsed = hasOwn(incoming, 'hintsUsed')
    ? (hasOld ? Math.min(hintsOld, hintsIn) : hintsIn)
    : hintsOld

  return {
    stars: Math.max(clampInt(old.stars, 0, 3), clampInt(incoming.stars, 0, 3)),
    bestTimeMs,
    hintsUsed,
    attempts: clampInt(old.attempts, 0, 999999) + 1,
    firstClearAt: clampInt(old.firstClearAt, 0, 9999999999999) || clampInt(incoming.clearedAt, 0, 9999999999999) || now,
    lastClearAt: clampInt(incoming.clearedAt, 0, 9999999999999) || now,
  }
}

async function saveLegacyFallback(userId, env, context, profile) {
  try {
    await writeMergedRecord(userId, env, context, {
      progress: profile.progress,
      cloudIntValue: profile.cloudIntValue,
      coins: profile.coins,
      hints: profile.hints,
      daily: profile.daily,
    })
  } catch (error) {
    console.error('legacy fallback failed:', error)
  }
}

// ---------------- 旧版文件存档接口（保留兼容） ----------------

async function getDetectedFileIDPrefix(userId) {
  const detectorPath = `user_game_progress/detector_${getProgressDocId(userId)}.txt`
  try {
    const uploadResult = await cloud.uploadFile({
      cloudPath: detectorPath,
      fileContent: Buffer.from('1', 'utf8'),
    })
    const fileID = uploadResult && uploadResult.fileID ? String(uploadResult.fileID) : ''
    if (!fileID) return ''
    return fileID.slice(0, fileID.length - detectorPath.length)
  } catch (error) {
    return ''
  }
}

function getDetectedFileIDCandidates(prefix, cloudPath) {
  return prefix ? [prefix + cloudPath] : []
}

async function readProgressRecord(userId, env) {
  const cloudPath = getProgressCloudPath(userId)
  const errors = []
  const detectedPrefix = await getDetectedFileIDPrefix(userId)

  const candidates = dedupe([
    ...getDetectedFileIDCandidates(detectedPrefix, cloudPath),
    ...getProgressFileIDCandidates(userId, env),
  ])

  for (const fileID of candidates) {
    try {
      const file = await cloud.downloadFile({ fileID })
      const text = file && file.fileContent ? file.fileContent.toString('utf8') : ''
      const data = text ? JSON.parse(text) : {}
      return { data, detectedPrefix, fileID, errors, found: true }
    } catch (error) {
      errors.push(`${fileID}: ${getErrorMessage(error)}`)
    }
  }

  return { data: {}, detectedPrefix, fileID: candidates[0] || '', errors, found: false }
}

async function getProgress(userId, env) {
  const recordId = getProgressDocId(userId)
  const cloudPath = getProgressCloudPath(userId)
  const record = await readProgressRecord(userId, env)
  const progress = getRecordProgress(record.data)
  const cloudIntValue = getRecordCloudIntValue(record.data)

  if (record.found) {
    return {
      ok: true,
      progress,
      cloudIntValue,
      hasCloudIntValue: hasRecordCloudIntValue(record.data),
      env,
      count: progress > 0 ? 1 : 0,
      recordId,
      cloudPath,
      detectedPrefix: record.detectedPrefix,
      fileID: record.fileID,
      mode: 'cloud-file.download',
    }
  }

  return {
    ok: true,
    progress: 0,
    cloudIntValue: 0,
    hasCloudIntValue: false,
    env,
    count: 0,
    recordId,
    cloudPath,
    detectedPrefix: record.detectedPrefix,
    fileID: record.fileID,
    mode: 'cloud-file-empty',
    error: record.errors.join(' | '),
  }
}

async function getCloudIntValue(userId, env) {
  const result = await getProgress(userId, env)
  return {
    ...result,
    count: result.hasCloudIntValue ? 1 : 0,
    mode: result.mode === 'cloud-file.download' ? 'cloud-file.cloud-int-download' : result.mode,
  }
}

async function setProgress(userId, incomingProgress, env, context = {}) {
  if (incomingProgress <= 0) {
    return { ok: true, progress: 0, cloudIntValue: 0, env, saved: false, recordId: getProgressDocId(userId) }
  }

  return await writeMergedRecord(userId, env, context, { progress: incomingProgress })
}

async function setCloudIntValue(userId, incomingValue, env, context = {}) {
  const cloudIntValue = Math.max(0, incomingValue)
  return await writeMergedRecord(userId, env, context, { cloudIntValue })
}

async function writeMergedRecord(userId, env, context, patch) {
  const recordId = getProgressDocId(userId)
  const cloudPath = getProgressCloudPath(userId)
  const existing = await readProgressRecord(userId, env)
  const data = {
    ...existing.data,
    key: PROGRESS_KEY,
    cloudIntKey: CLOUD_INT_KEY,
    userId,
    openid: context.openid || userId,
    appid: context.appid || '',
    unionid: context.unionid || '',
    recordId,
    updatedAt: Date.now(),
    ...patch,
  }

  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(JSON.stringify(data), 'utf8'),
  })

  return {
    ok: true,
    progress: getRecordProgress(data),
    cloudIntValue: getRecordCloudIntValue(data),
    hasCloudIntValue: hasRecordCloudIntValue(data),
    env,
    appid: context.appid || '',
    saved: true,
    recordId,
    cloudPath,
    fileID: uploadResult.fileID || getProgressFileIDCandidates(userId, env)[0],
    mode: 'cloud-file.upload',
  }
}

// ---------------- 工具 ----------------

function getErrorMessage(error) {
  return error && (error.errMsg || error.message) ? String(error.errMsg || error.message) : String(error)
}

function getUserId(openid) {
  return openid ? String(openid).replace(/[^A-Za-z0-9_-]/g, '_') : ''
}

function getProgressDocId(userId) {
  return `progress_${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

function getProgressCloudPath(userId) {
  return `user_game_progress/${getProgressDocId(userId)}.json`
}

function getProgressFileIDCandidates(userId, env) {
  const path = getProgressCloudPath(userId)
  if (!env) return [path]

  return [
    `cloud://${env}/${path}`,
    `cloud://${env}.${path}`,
    path,
  ]
}

function getRecordProgress(record) {
  if (!record) return 0
  const progress = parseInt(record.progress || 0, 10)
  return Number.isNaN(progress) ? 0 : progress
}

function hasRecordCloudIntValue(record) {
  return !!record && Object.prototype.hasOwnProperty.call(record, 'cloudIntValue')
}

function getRecordCloudIntValue(record) {
  if (!record || !hasRecordCloudIntValue(record)) return 0
  const cloudIntValue = parseInt(record.cloudIntValue || 0, 10)
  return Number.isNaN(cloudIntValue) || cloudIntValue < 0 ? 0 : cloudIntValue
}

function clampInt(value, min, max) {
  const parsed = parseInt(value || 0, 10)
  if (Number.isNaN(parsed)) return min
  return Math.max(min, Math.min(max, parsed))
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key)
}

function dedupe(list) {
  const seen = {}
  return list.filter((item) => {
    if (!item || seen[item]) return false
    seen[item] = true
    return true
  })
}
