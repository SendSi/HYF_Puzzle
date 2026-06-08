const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const PROGRESS_KEY = 'game_progress'
const CLOUD_INT_KEY = 'cloud_int_value'

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const appid = wxContext.APPID || ''
  const unionid = wxContext.UNIONID || ''
  const env = wxContext.ENV || ''
  const userId = getUserId(openid)

  if (!userId) {
    return { ok: false, progress: 0, cloudIntValue: 0, env, appid, error: 'missing user id' }
  }

  try {
    if (event.action === 'get') {
      return await getProgress(userId, env)
    }

    if (event.action === 'set') {
      const incomingProgress = parseInt(event.progress || 0, 10)
      return await setProgress(userId, Number.isNaN(incomingProgress) ? 0 : incomingProgress, env, { openid, appid, unionid })
    }

    if (event.action === 'getCloudIntValue') {
      return await getCloudIntValue(userId, env)
    }

    if (event.action === 'setCloudIntValue') {
      const incomingValue = parseInt(event.cloudIntValue || 0, 10)
      return await setCloudIntValue(userId, Number.isNaN(incomingValue) ? 0 : incomingValue, env, { openid, appid, unionid })
    }

    return { ok: false, progress: 0, cloudIntValue: 0, env, error: 'unknown action' }
  } catch (error) {
    return {
      ok: false,
      progress: 0,
      cloudIntValue: 0,
      env,
      error: getErrorMessage(error),
    }
  }
}

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

function dedupe(list) {
  const seen = {}
  return list.filter((item) => {
    if (!item || seen[item]) return false
    seen[item] = true
    return true
  })
}
