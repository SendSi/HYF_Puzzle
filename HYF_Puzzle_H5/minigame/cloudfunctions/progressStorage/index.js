const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION_NAME = 'user_game_progress'
const PROGRESS_KEY = 'game_progress'

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const appid = wxContext.APPID || ''
  const unionid = wxContext.UNIONID || ''
  const env = wxContext.ENV || ''
  const userId = getUserId(event, openid)

  if (!userId) {
    return { ok: false, progress: 0, env, appid, error: 'missing user id' }
  }

  try {
    if (event.action === 'get') {
      return await getProgress(userId, env, { openid, appid, unionid })
    }

    if (event.action === 'set') {
      const incomingProgress = parseInt(event.progress || 0, 10)
      return await setProgress(userId, Number.isNaN(incomingProgress) ? 0 : incomingProgress, env, { openid, appid, unionid })
    }

    return { ok: false, progress: 0, env, error: 'unknown action' }
  } catch (error) {
    return {
      ok: false,
      progress: 0,
      env,
      error: error && (error.errMsg || error.message) ? (error.errMsg || error.message) : String(error),
    }
  }
}

async function getDetectedFileIDPrefix(openid) {
  const detectorPath = `user_game_progress/detector_${getProgressDocId(openid)}.txt`
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

async function getProgress(openid, env, context = {}) {
  const recordId = getProgressDocId(openid)
  const cloudPath = getProgressCloudPath(openid)
  const errors = []
  const detectedPrefix = await getDetectedFileIDPrefix(openid)

  // 只读取当前 OPENID 对应的文件。不要再读 latest/device 兜底文件，避免读到其它测试进度。
  const candidates = [
    ...getDetectedFileIDCandidates(detectedPrefix, cloudPath),
    ...getProgressFileIDCandidates(openid, env),
  ]

  for (const fileID of candidates) {
    try {
      const file = await cloud.downloadFile({ fileID })
      const text = file && file.fileContent ? file.fileContent.toString('utf8') : ''
      const data = text ? JSON.parse(text) : {}
      const progress = getRecordProgress(data)

      return {
        ok: true,
        progress,
        env,
        count: progress > 0 ? 1 : 0,
        recordId,
        cloudPath,
        detectedPrefix,
        fileID,
        mode: 'cloud-file.download',
      }
    } catch (error) {
      errors.push(`${fileID}: ${getErrorMessage(error)}`)
    }
  }

  return {
    ok: true,
    progress: 0,
    env,
    count: 0,
    recordId,
    cloudPath,
    detectedPrefix,
    fileID: candidates[0] || '',
    mode: 'cloud-file-empty',
    error: errors.join(' | '),
  }
}

async function setProgress(openid, incomingProgress, env, context = {}) {
  if (incomingProgress <= 0) {
    return { ok: true, progress: 0, env, saved: false, recordId: getProgressDocId(openid) }
  }

  const recordId = getProgressDocId(openid)
  const cloudPath = getProgressCloudPath(openid)
  const data = {
    key: PROGRESS_KEY,
    userId: openid,
    openid: context.openid || openid,
    appid: context.appid || '',
    unionid: context.unionid || '',
    recordId,
    progress: incomingProgress,
    updatedAt: Date.now(),
  }

  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(JSON.stringify(data), 'utf8'),
  })

  return { ok: true, progress: incomingProgress, env, appid: context.appid || '', saved: true, recordId, cloudPath, fileID: uploadResult.fileID || getProgressFileIDCandidates(openid, env)[0], mode: 'cloud-file.upload' }
}

async function addProgress(recordId, userId, data) {
  return db.collection(COLLECTION_NAME).add({
    data: Object.assign({}, data, {
      userId,
      recordId,
    }),
  })
}

async function writeProgress(recordId, data) {
  return db.collection(COLLECTION_NAME).doc(recordId).set({ data })
}

async function ensureCollection() {
  try {
    await db.createCollection(COLLECTION_NAME)
  } catch (error) {
    if (!isCollectionAlreadyExistsError(error)) {
      throw error
    }
  }
}

function isCollectionNotFoundError(error) {
  const message = getErrorMessage(error)
  return message.indexOf('collection not exists') !== -1 ||
    message.indexOf('collection not exist') !== -1 ||
    message.indexOf('collection does not exist') !== -1 ||
    message.indexOf('cannot find collection') !== -1 ||
    message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1 ||
    message.indexOf('-502005') !== -1
}

function isCollectionAlreadyExistsError(error) {
  const message = getErrorMessage(error)
  return message.indexOf('collection already exists') !== -1 ||
    message.indexOf('collection exists') !== -1 ||
    message.indexOf('already exist') !== -1 ||
    message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1 ||
    message.indexOf('-502002') !== -1 ||
    message.indexOf('-501001') !== -1
}

function getErrorMessage(error) {
  return error && (error.errMsg || error.message) ? String(error.errMsg || error.message) : String(error)
}

function getUserId(event, openid) {
  // 主键必须用云函数拿到的 OPENID；前端本地 userId 卸载后可能变化，不能用于恢复。
  return openid ? String(openid).replace(/[^A-Za-z0-9_-]/g, '_') : ''
}

function getProgressDocId(userId) {
  return `progress_${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

function getProgressCloudPath(userId) {
  return `user_game_progress/${getProgressDocId(userId)}.json`
}

function getLatestProgressCloudPath() {
  return 'user_game_progress/latest.json'
}

function getDeviceProgressCloudPath(appid) {
  const safeAppId = appid ? String(appid).replace(/[^A-Za-z0-9_-]/g, '_') : 'default'
  return `user_game_progress/device_${safeAppId}.json`
}

function getProgressFileIDCandidates(userId, env) {
  const path = getProgressCloudPath(userId)
  if (!env) return [path]

  // 兼容不同云存储 fileID 形态：uploadFile 返回的 fileID 通常包含 env 和资源域。
  return [
    `cloud://${env}/${path}`,
    `cloud://${env}.${path}`,
    path,
  ]
}

function getLatestProgressFileIDCandidates(env) {
  const path = getLatestProgressCloudPath()
  if (!env) return [path]

  return [
    `cloud://${env}/${path}`,
    `cloud://${env}.${path}`,
    path,
  ]
}

function getDeviceProgressFileIDCandidates(appid, env) {
  const path = getDeviceProgressCloudPath(appid)
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

function getMaxProgress(records = []) {
  return records.reduce((max, record) => Math.max(max, getRecordProgress(record)), 0)
}
