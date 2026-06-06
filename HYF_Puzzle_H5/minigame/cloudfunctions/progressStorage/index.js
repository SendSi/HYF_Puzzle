const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION_NAME = 'user_game_progress'
const PROGRESS_KEY = 'game_progress'

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const env = wxContext.ENV || ''

  if (!openid) {
    return { ok: false, progress: 0, env, error: 'missing openid' }
  }

  try {
    if (event.action === 'get') {
      return await getProgress(openid, env)
    }

    if (event.action === 'set') {
      const incomingProgress = parseInt(event.progress || 0, 10)
      return await setProgress(openid, Number.isNaN(incomingProgress) ? 0 : incomingProgress, env)
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

async function getProgress(openid, env) {
  const collection = db.collection(COLLECTION_NAME)
  const result = await collection.where({ key: PROGRESS_KEY }).limit(20).get()
  const records = result.data || []
  const progress = getMaxProgress(records)

  return {
    ok: true,
    progress,
    env,
    count: records.length,
    recordId: getProgressDocId(openid),
  }
}

async function setProgress(openid, incomingProgress, env) {
  if (incomingProgress <= 0) {
    return { ok: true, progress: 0, env, saved: false, recordId: getProgressDocId(openid) }
  }

  const collection = db.collection(COLLECTION_NAME)
  const recordId = getProgressDocId(openid)
  await collection.doc(recordId).set({
    data: {
      key: PROGRESS_KEY,
      progress: incomingProgress,
      updatedAt: db.serverDate(),
    },
  })

  return { ok: true, progress: incomingProgress, env, saved: true, recordId }
}

function getProgressDocId(openid) {
  return `progress_${openid.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

function getRecordProgress(record) {
  if (!record) return 0
  const progress = parseInt(record.progress || 0, 10)
  return Number.isNaN(progress) ? 0 : progress
}

function getMaxProgress(records = []) {
  return records.reduce((max, record) => Math.max(max, getRecordProgress(record)), 0)
}
