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
    await ensureCollection()

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

async function ensureCollection() {
  try {
    await db.createCollection(COLLECTION_NAME)
  } catch (error) {
    const message = error && (error.errMsg || error.message) ? (error.errMsg || error.message) : String(error)
    if (!message.includes('already exists') && !message.includes('collection exist')) {
      throw error
    }
  }
}

async function getProgress(openid, env) {
  const collection = db.collection(COLLECTION_NAME)
  const result = await collection.where({ _openid: openid, key: PROGRESS_KEY }).get()
  return { ok: true, progress: getMaxProgress(result.data), env, count: (result.data || []).length }
}

async function setProgress(openid, incomingProgress, env) {
  if (incomingProgress <= 0) {
    return getProgress(openid, env)
  }

  const collection = db.collection(COLLECTION_NAME)
  const result = await collection.where({ _openid: openid, key: PROGRESS_KEY }).get()
  const records = result.data || []
  const progress = Math.max(getMaxProgress(records), incomingProgress)
  let recordId = ''

  if (records.length > 0) {
    recordId = records[0]._id
    await collection.doc(recordId).update({
      data: {
        progress,
        updatedAt: db.serverDate(),
      },
    })
  } else {
    const addResult = await collection.add({
      data: {
        key: PROGRESS_KEY,
        progress,
        updatedAt: db.serverDate(),
      },
    })
    recordId = addResult._id || ''
  }

  return { ok: true, progress, env, saved: true, recordId }
}

function getMaxProgress(records = []) {
  return records.reduce((max, record) => {
    const progress = parseInt(record.progress || 0, 10)
    return Number.isNaN(progress) ? max : Math.max(max, progress)
  }, 0)
}
