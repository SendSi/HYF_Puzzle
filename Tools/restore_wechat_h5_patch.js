#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const MINIGAME_DIR = path.join(ROOT, 'HYF_Puzzle_H5', 'minigame')
const CLOUD_FUNCTION_DIR = path.join(MINIGAME_DIR, 'cloudfunctions', 'progressStorage')

const paths = {
  gameJs: path.join(MINIGAME_DIR, 'game.js'),
  gameJson: path.join(MINIGAME_DIR, 'game.json'),
  projectConfig: path.join(MINIGAME_DIR, 'project.config.json'),
  syncJs: path.join(MINIGAME_DIR, 'wx-cloud-progress-sync.js'),
  frameworkJs: path.join(MINIGAME_DIR, 'webgl.wasm.framework.unityweb.js'),
  cloudIndex: path.join(CLOUD_FUNCTION_DIR, 'index.js'),
  cloudPackage: path.join(CLOUD_FUNCTION_DIR, 'package.json'),
  openDataTarget: path.join(MINIGAME_DIR, 'open-data'),
  openDataSource: path.join(ROOT, 'Library', 'PackageCache', 'com.qq.weixin.minigame@1a76503507', 'Runtime', 'wechat-default', 'open-data'),
}

const WX_CLOUD_PROGRESS_SYNC = "const PROGRESS_KEY = 'game_progress_local'\nconst CLOUD_INT_KEY = 'cloud_int_value_local'\nconst CLOUD_FUNCTION_NAME = 'progressStorage'\n\nlet cloudReady = false\nlet syncingFromCloud = false\nlet loading = false\nlet cloudIntLoading = false\nlet saving = false\nlet cloudIntSaving = false\nlet pendingProgress = 0\nlet pendingCloudIntValue = null\nlet lastSyncedProgress = 0\nlet lastSyncedCloudIntValue = null\nlet restoredOnce = false\nlet cloudIntRestoredOnce = false\n\nfunction initCloud() {\n  if (cloudReady) return true\n  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.init || !wx.cloud.callFunction) {\n    console.warn('[WXCloudProgressSync] wx.cloud not available')\n    return false\n  }\n\n  wx.cloud.init({ traceUser: true })\n  cloudReady = true\n  console.log('[WXCloudProgressSync] cloud initialized')\n  return true\n}\n\nfunction parseProgress(value) {\n  const progress = parseInt(value || '0', 10)\n  return Number.isNaN(progress) || progress <= 0 ? 0 : progress\n}\n\nfunction parseCloudIntValue(value) {\n  const intValue = parseInt(value || '0', 10)\n  return Number.isNaN(intValue) || intValue < 0 ? 0 : intValue\n}\n\nfunction getLocalProgress() {\n  try {\n    return parseProgress(wx.getStorageSync(PROGRESS_KEY))\n  } catch (error) {\n    return 0\n  }\n}\n\nfunction getLocalCloudIntValue() {\n  try {\n    return parseCloudIntValue(wx.getStorageSync(CLOUD_INT_KEY))\n  } catch (error) {\n    return 0\n  }\n}\n\nfunction buildCloudData(action, progress) {\n  const data = { action }\n  if (progress !== undefined) data.progress = progress\n  return data\n}\n\nfunction buildCloudIntData(action, value) {\n  const data = { action }\n  if (value !== undefined) data.cloudIntValue = value\n  return data\n}\n\nfunction notifyUnityProgress(progress, source) {\n  progress = parseProgress(progress)\n  if (progress <= 0) return\n\n  const notify = function () {\n    try {\n      if (typeof SendMessage === 'function') {\n        SendMessage('WXCloudStorageCallbackObj', 'OnLocalLoaded', String(progress))\n        console.log('[WXCloudProgressSync] notified unity:', progress, 'source:', source)\n      }\n    } catch (error) {\n      console.warn('[WXCloudProgressSync] notify unity failed:', error, 'source:', source)\n    }\n  }\n\n  notify()\n  setTimeout(notify, 1000)\n  setTimeout(notify, 3000)\n}\n\nfunction notifyUnityCloudIntValue(value, source) {\n  value = parseCloudIntValue(value)\n\n  const notify = function () {\n    try {\n      if (typeof SendMessage === 'function') {\n        SendMessage('WXCloudStorageCallbackObj', 'OnCloudIntValueLocalLoaded', String(value))\n        console.log('[WXCloudProgressSync] notified unity cloud int:', value, 'source:', source)\n      }\n    } catch (error) {\n      console.warn('[WXCloudProgressSync] notify unity cloud int failed:', error, 'source:', source)\n    }\n  }\n\n  notify()\n  setTimeout(notify, 1000)\n  setTimeout(notify, 3000)\n}\n\nfunction syncProgressToCloud(progress, source) {\n  progress = parseProgress(progress)\n  if (progress <= 0 || syncingFromCloud) return\n  if (!initCloud()) {\n    console.warn('[WXCloudProgressSync] cloud unavailable, skip cloud save:', progress, 'source:', source)\n    return\n  }\n\n  pendingProgress = Math.max(pendingProgress, progress)\n  if (progress <= lastSyncedProgress && pendingProgress <= lastSyncedProgress) return\n  if (saving) return\n\n  saving = true\n  const progressToSave = pendingProgress\n  pendingProgress = 0\n\n  wx.cloud.callFunction({\n    name: CLOUD_FUNCTION_NAME,\n    data: buildCloudData('set', progressToSave),\n    success(res) {\n      const result = res && res.result ? res.result : {}\n      if (result.ok === false) {\n        console.warn('[WXCloudProgressSync] cloud file save failed:', result.error || result, 'source:', source)\n        pendingProgress = Math.max(pendingProgress, progressToSave)\n        return\n      }\n\n      lastSyncedProgress = Math.max(lastSyncedProgress, parseProgress(result.progress || progressToSave))\n      console.log('[WXCloudProgressSync] cloud file saved:', lastSyncedProgress, 'cloudIntValue:', result.cloudIntValue || 0, 'recordId:', result.recordId || '', 'fileID:', result.fileID || '', 'mode:', result.mode || '', 'source:', source)\n      notifyUnityProgress(lastSyncedProgress, 'cloud-file-save-' + source)\n    },\n    fail(error) {\n      console.warn('[WXCloudProgressSync] callFunction set fail:', error, 'source:', source)\n      pendingProgress = Math.max(pendingProgress, progressToSave)\n    },\n    complete() {\n      saving = false\n      if (pendingProgress > lastSyncedProgress) {\n        setTimeout(function retryPendingProgress() {\n          syncProgressToCloud(pendingProgress, 'pending')\n        }, 3000)\n      }\n    },\n  })\n}\n\nfunction syncCloudIntValueToCloud(value, source) {\n  value = parseCloudIntValue(value)\n  if (syncingFromCloud) return\n  if (!initCloud()) {\n    console.warn('[WXCloudProgressSync] cloud unavailable, skip cloud int save:', value, 'source:', source)\n    return\n  }\n\n  pendingCloudIntValue = value\n  if (lastSyncedCloudIntValue !== null && pendingCloudIntValue === lastSyncedCloudIntValue) return\n  if (cloudIntSaving) return\n\n  cloudIntSaving = true\n  const valueToSave = pendingCloudIntValue\n  pendingCloudIntValue = null\n\n  wx.cloud.callFunction({\n    name: CLOUD_FUNCTION_NAME,\n    data: buildCloudIntData('setCloudIntValue', valueToSave),\n    success(res) {\n      const result = res && res.result ? res.result : {}\n      if (result.ok === false) {\n        console.warn('[WXCloudProgressSync] cloud int save failed:', result.error || result, 'source:', source)\n        pendingCloudIntValue = valueToSave\n        return\n      }\n\n      lastSyncedCloudIntValue = parseCloudIntValue(result.cloudIntValue)\n      console.log('[WXCloudProgressSync] cloud int saved:', lastSyncedCloudIntValue, 'progress:', result.progress || 0, 'recordId:', result.recordId || '', 'fileID:', result.fileID || '', 'mode:', result.mode || '', 'source:', source)\n      notifyUnityCloudIntValue(lastSyncedCloudIntValue, 'cloud-int-save-' + source)\n    },\n    fail(error) {\n      console.warn('[WXCloudProgressSync] callFunction setCloudIntValue fail:', error, 'source:', source)\n      pendingCloudIntValue = valueToSave\n    },\n    complete() {\n      cloudIntSaving = false\n      if (pendingCloudIntValue !== null && pendingCloudIntValue !== lastSyncedCloudIntValue) {\n        setTimeout(function retryPendingCloudIntValue() {\n          syncCloudIntValueToCloud(pendingCloudIntValue, 'pending')\n        }, 3000)\n      }\n    },\n  })\n}\n\nfunction restoreProgressFromCloud(force) {\n  if (loading) {\n    if (force) {\n      setTimeout(function retryForcedRestore() { restoreProgressFromCloud(true) }, 800)\n    }\n    return\n  }\n  if (restoredOnce && !force) return\n  if (!initCloud()) return\n\n  restoredOnce = true\n  loading = true\n  wx.cloud.callFunction({\n    name: CLOUD_FUNCTION_NAME,\n    data: buildCloudData('get'),\n    success(res) {\n      const result = res && res.result ? res.result : {}\n      if (result.ok === false) {\n        console.warn('[WXCloudProgressSync] load failed:', result.error || result)\n        return\n      }\n\n      const cloudProgress = parseProgress(result.progress)\n      const localProgress = getLocalProgress()\n      const progress = Math.max(cloudProgress, localProgress)\n      lastSyncedProgress = Math.max(lastSyncedProgress, cloudProgress)\n\n      if (progress > 0 && progress > localProgress) {\n        syncingFromCloud = true\n        wx.setStorageSync(PROGRESS_KEY, String(progress))\n        syncingFromCloud = false\n        console.log('[WXCloudProgressSync] cloud file restored local progress:', progress, 'mode:', result.mode || '')\n        notifyUnityProgress(progress, 'cloud-file-restore')\n      } else {\n        console.log('[WXCloudProgressSync] cloud file loaded:', cloudProgress, 'local:', localProgress, 'mode:', result.mode || '', 'error:', result.error || '')\n        if (progress > 0) notifyUnityProgress(progress, 'cloud-file-loaded')\n      }\n    },\n    fail(error) {\n      console.warn('[WXCloudProgressSync] callFunction get fail:', error)\n    },\n    complete() {\n      loading = false\n    },\n  })\n}\n\nfunction restoreCloudIntValueFromCloud(force) {\n  if (cloudIntLoading) {\n    if (force) {\n      setTimeout(function retryForcedCloudIntRestore() { restoreCloudIntValueFromCloud(true) }, 800)\n    }\n    return\n  }\n  if (cloudIntRestoredOnce && !force) return\n  if (!initCloud()) return\n\n  cloudIntRestoredOnce = true\n  cloudIntLoading = true\n  wx.cloud.callFunction({\n    name: CLOUD_FUNCTION_NAME,\n    data: buildCloudIntData('getCloudIntValue'),\n    success(res) {\n      const result = res && res.result ? res.result : {}\n      if (result.ok === false) {\n        console.warn('[WXCloudProgressSync] cloud int load failed:', result.error || result)\n        return\n      }\n\n      const cloudValue = parseCloudIntValue(result.cloudIntValue)\n      const localValue = getLocalCloudIntValue()\n      const hasCloudValue = !!result.hasCloudIntValue\n      const value = hasCloudValue ? cloudValue : localValue\n      lastSyncedCloudIntValue = cloudValue\n\n      if (hasCloudValue && value !== localValue) {\n        syncingFromCloud = true\n        wx.setStorageSync(CLOUD_INT_KEY, String(value))\n        syncingFromCloud = false\n        console.log('[WXCloudProgressSync] cloud int restored local value:', value, 'mode:', result.mode || '')\n      } else {\n        console.log('[WXCloudProgressSync] cloud int loaded:', cloudValue, 'local:', localValue, 'hasCloudValue:', hasCloudValue, 'mode:', result.mode || '', 'error:', result.error || '')\n      }\n      notifyUnityCloudIntValue(value, hasCloudValue ? 'cloud-int-restore' : 'cloud-int-local-loaded')\n    },\n    fail(error) {\n      console.warn('[WXCloudProgressSync] callFunction getCloudIntValue fail:', error)\n    },\n    complete() {\n      cloudIntLoading = false\n    },\n  })\n}\n\nfunction patchStorageSync() {\n  if (typeof wx === 'undefined' || !wx.setStorageSync || wx.__HYFCloudProgressPatched) return\n\n  const originalSetStorageSync = wx.setStorageSync.bind(wx)\n  wx.setStorageSync = function patchedSetStorageSync(key, value) {\n    const result = originalSetStorageSync(key, value)\n    if (key === PROGRESS_KEY) {\n      syncProgressToCloud(value, 'setStorageSync')\n    }\n    if (key === CLOUD_INT_KEY) {\n      syncCloudIntValueToCloud(value, 'setStorageSync')\n    }\n    return result\n  }\n\n  wx.__HYFCloudProgressPatched = true\n  console.log('[WXCloudProgressSync] wx.setStorageSync patched')\n}\n\nfunction startupRestore(source) {\n  const localProgress = getLocalProgress()\n  if (localProgress > 0) {\n    console.log('[WXCloudProgressSync] startup local progress:', localProgress, 'source:', source)\n    notifyUnityProgress(localProgress, 'startup-local-' + source)\n    syncProgressToCloud(localProgress, 'startup-local-' + source)\n  }\n\n  const localCloudIntValue = getLocalCloudIntValue()\n  console.log('[WXCloudProgressSync] startup local cloud int:', localCloudIntValue, 'source:', source)\n  notifyUnityCloudIntValue(localCloudIntValue, 'startup-local-cloud-int-' + source)\n\n  restoreProgressFromCloud(true)\n  restoreCloudIntValueFromCloud(true)\n}\n\npatchStorageSync()\nstartupRestore('immediate')\nsetTimeout(function restoreAtOneSecond() { startupRestore('1s') }, 1000)\nsetTimeout(function restoreAtThreeSeconds() { startupRestore('3s') }, 3000)\nsetTimeout(function restoreAtSixSeconds() { startupRestore('6s') }, 6000)\n\nif (typeof GameGlobal !== 'undefined') {\n  GameGlobal.__HYFSaveProgressToCloud = syncProgressToCloud\n  GameGlobal.__HYFRestoreProgressFromCloud = function () { restoreProgressFromCloud(false) }\n  GameGlobal.__HYFSaveCloudIntValueToCloud = syncCloudIntValueToCloud\n  GameGlobal.__HYFRestoreCloudIntValueFromCloud = function () { restoreCloudIntValueFromCloud(false) }\n  console.log('[WXCloudProgressSync] bridge ready')\n} else {\n  console.warn('[WXCloudProgressSync] GameGlobal not available')\n}\n"
const CLOUD_INDEX = "const cloud = require('wx-server-sdk')\n\ncloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })\n\nconst PROGRESS_KEY = 'game_progress'\nconst CLOUD_INT_KEY = 'cloud_int_value'\n\nexports.main = async (event = {}) => {\n  const wxContext = cloud.getWXContext()\n  const openid = wxContext.OPENID || ''\n  const appid = wxContext.APPID || ''\n  const unionid = wxContext.UNIONID || ''\n  const env = wxContext.ENV || ''\n  const userId = getUserId(openid)\n\n  if (!userId) {\n    return { ok: false, progress: 0, cloudIntValue: 0, env, appid, error: 'missing user id' }\n  }\n\n  try {\n    if (event.action === 'get') {\n      return await getProgress(userId, env)\n    }\n\n    if (event.action === 'set') {\n      const incomingProgress = parseInt(event.progress || 0, 10)\n      return await setProgress(userId, Number.isNaN(incomingProgress) ? 0 : incomingProgress, env, { openid, appid, unionid })\n    }\n\n    if (event.action === 'getCloudIntValue') {\n      return await getCloudIntValue(userId, env)\n    }\n\n    if (event.action === 'setCloudIntValue') {\n      const incomingValue = parseInt(event.cloudIntValue || 0, 10)\n      return await setCloudIntValue(userId, Number.isNaN(incomingValue) ? 0 : incomingValue, env, { openid, appid, unionid })\n    }\n\n    return { ok: false, progress: 0, cloudIntValue: 0, env, error: 'unknown action' }\n  } catch (error) {\n    return {\n      ok: false,\n      progress: 0,\n      cloudIntValue: 0,\n      env,\n      error: getErrorMessage(error),\n    }\n  }\n}\n\nasync function getDetectedFileIDPrefix(userId) {\n  const detectorPath = `user_game_progress/detector_${getProgressDocId(userId)}.txt`\n  try {\n    const uploadResult = await cloud.uploadFile({\n      cloudPath: detectorPath,\n      fileContent: Buffer.from('1', 'utf8'),\n    })\n    const fileID = uploadResult && uploadResult.fileID ? String(uploadResult.fileID) : ''\n    if (!fileID) return ''\n    return fileID.slice(0, fileID.length - detectorPath.length)\n  } catch (error) {\n    return ''\n  }\n}\n\nfunction getDetectedFileIDCandidates(prefix, cloudPath) {\n  return prefix ? [prefix + cloudPath] : []\n}\n\nasync function readProgressRecord(userId, env) {\n  const cloudPath = getProgressCloudPath(userId)\n  const errors = []\n  const detectedPrefix = await getDetectedFileIDPrefix(userId)\n\n  const candidates = dedupe([\n    ...getDetectedFileIDCandidates(detectedPrefix, cloudPath),\n    ...getProgressFileIDCandidates(userId, env),\n  ])\n\n  for (const fileID of candidates) {\n    try {\n      const file = await cloud.downloadFile({ fileID })\n      const text = file && file.fileContent ? file.fileContent.toString('utf8') : ''\n      const data = text ? JSON.parse(text) : {}\n      return { data, detectedPrefix, fileID, errors, found: true }\n    } catch (error) {\n      errors.push(`${fileID}: ${getErrorMessage(error)}`)\n    }\n  }\n\n  return { data: {}, detectedPrefix, fileID: candidates[0] || '', errors, found: false }\n}\n\nasync function getProgress(userId, env) {\n  const recordId = getProgressDocId(userId)\n  const cloudPath = getProgressCloudPath(userId)\n  const record = await readProgressRecord(userId, env)\n  const progress = getRecordProgress(record.data)\n  const cloudIntValue = getRecordCloudIntValue(record.data)\n\n  if (record.found) {\n    return {\n      ok: true,\n      progress,\n      cloudIntValue,\n      hasCloudIntValue: hasRecordCloudIntValue(record.data),\n      env,\n      count: progress > 0 ? 1 : 0,\n      recordId,\n      cloudPath,\n      detectedPrefix: record.detectedPrefix,\n      fileID: record.fileID,\n      mode: 'cloud-file.download',\n    }\n  }\n\n  return {\n    ok: true,\n    progress: 0,\n    cloudIntValue: 0,\n    hasCloudIntValue: false,\n    env,\n    count: 0,\n    recordId,\n    cloudPath,\n    detectedPrefix: record.detectedPrefix,\n    fileID: record.fileID,\n    mode: 'cloud-file-empty',\n    error: record.errors.join(' | '),\n  }\n}\n\nasync function getCloudIntValue(userId, env) {\n  const result = await getProgress(userId, env)\n  return {\n    ...result,\n    count: result.hasCloudIntValue ? 1 : 0,\n    mode: result.mode === 'cloud-file.download' ? 'cloud-file.cloud-int-download' : result.mode,\n  }\n}\n\nasync function setProgress(userId, incomingProgress, env, context = {}) {\n  if (incomingProgress <= 0) {\n    return { ok: true, progress: 0, cloudIntValue: 0, env, saved: false, recordId: getProgressDocId(userId) }\n  }\n\n  return await writeMergedRecord(userId, env, context, { progress: incomingProgress })\n}\n\nasync function setCloudIntValue(userId, incomingValue, env, context = {}) {\n  const cloudIntValue = Math.max(0, incomingValue)\n  return await writeMergedRecord(userId, env, context, { cloudIntValue })\n}\n\nasync function writeMergedRecord(userId, env, context, patch) {\n  const recordId = getProgressDocId(userId)\n  const cloudPath = getProgressCloudPath(userId)\n  const existing = await readProgressRecord(userId, env)\n  const data = {\n    ...existing.data,\n    key: PROGRESS_KEY,\n    cloudIntKey: CLOUD_INT_KEY,\n    userId,\n    openid: context.openid || userId,\n    appid: context.appid || '',\n    unionid: context.unionid || '',\n    recordId,\n    updatedAt: Date.now(),\n    ...patch,\n  }\n\n  const uploadResult = await cloud.uploadFile({\n    cloudPath,\n    fileContent: Buffer.from(JSON.stringify(data), 'utf8'),\n  })\n\n  return {\n    ok: true,\n    progress: getRecordProgress(data),\n    cloudIntValue: getRecordCloudIntValue(data),\n    hasCloudIntValue: hasRecordCloudIntValue(data),\n    env,\n    appid: context.appid || '',\n    saved: true,\n    recordId,\n    cloudPath,\n    fileID: uploadResult.fileID || getProgressFileIDCandidates(userId, env)[0],\n    mode: 'cloud-file.upload',\n  }\n}\n\nfunction getErrorMessage(error) {\n  return error && (error.errMsg || error.message) ? String(error.errMsg || error.message) : String(error)\n}\n\nfunction getUserId(openid) {\n  return openid ? String(openid).replace(/[^A-Za-z0-9_-]/g, '_') : ''\n}\n\nfunction getProgressDocId(userId) {\n  return `progress_${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`\n}\n\nfunction getProgressCloudPath(userId) {\n  return `user_game_progress/${getProgressDocId(userId)}.json`\n}\n\nfunction getProgressFileIDCandidates(userId, env) {\n  const path = getProgressCloudPath(userId)\n  if (!env) return [path]\n\n  return [\n    `cloud://${env}/${path}`,\n    `cloud://${env}.${path}`,\n    path,\n  ]\n}\n\nfunction getRecordProgress(record) {\n  if (!record) return 0\n  const progress = parseInt(record.progress || 0, 10)\n  return Number.isNaN(progress) ? 0 : progress\n}\n\nfunction hasRecordCloudIntValue(record) {\n  return !!record && Object.prototype.hasOwnProperty.call(record, 'cloudIntValue')\n}\n\nfunction getRecordCloudIntValue(record) {\n  if (!record || !hasRecordCloudIntValue(record)) return 0\n  const cloudIntValue = parseInt(record.cloudIntValue || 0, 10)\n  return Number.isNaN(cloudIntValue) || cloudIntValue < 0 ? 0 : cloudIntValue\n}\n\nfunction dedupe(list) {\n  const seen = {}\n  return list.filter((item) => {\n    if (!item || seen[item]) return false\n    seen[item] = true\n    return true\n  })\n}\n"
const CLOUD_PACKAGE = "{\n  \"name\": \"progressStorage\",\n  \"version\": \"1.0.0\",\n  \"main\": \"index.js\",\n  \"dependencies\": {\n    \"wx-server-sdk\": \"latest\"\n  }\n}\n"

function log(message) { console.log('[restore-wechat-h5] ' + message) }
function ensureFile(file) { if (!fs.existsSync(file)) throw new Error('文件不存在: ' + file) }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }
function read(file) { ensureFile(file); return fs.readFileSync(file, 'utf8') }
function write(file, content) { ensureDir(path.dirname(file)); fs.writeFileSync(file, content, 'utf8') }
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) throw new Error('目录不存在: ' + src)
  ensureDir(dest)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.endsWith('.meta')) continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDirRecursive(from, to)
    else fs.copyFileSync(from, to)
  }
}

function patchGameJs() {
  let content = read(paths.gameJs)
  const importLine = "import './wx-cloud-progress-sync';"
  if (!content.includes(importLine)) {
    const marker = "import './webgl.wasm.framework.unityweb';"
    if (!content.includes(marker)) throw new Error('game.js 中找不到 webgl.wasm.framework.unityweb import')
    content = content.replace(marker, marker + '\n' + importLine)
    write(paths.gameJs, content)
    log('已恢复 game.js 的 wx-cloud-progress-sync 引用')
  } else log('game.js 引用已存在')
}

function patchProjectConfig() {
  const json = JSON.parse(read(paths.projectConfig))
  if (json.cloudfunctionRoot !== 'cloudfunctions/') {
    const next = { description: json.description || '项目配置文件', cloudfunctionRoot: 'cloudfunctions/' }
    for (const key of Object.keys(json)) if (key !== 'description' && key !== 'cloudfunctionRoot') next[key] = json[key]
    write(paths.projectConfig, JSON.stringify(next, null, 2) + '\n')
    log('已恢复 project.config.json 的 cloudfunctionRoot')
  } else log('project.config.json cloudfunctionRoot 已存在')
}

function patchGameJson() {
  const json = JSON.parse(read(paths.gameJson))
  if (json.cloud !== true) {
    const next = {}
    if (Object.prototype.hasOwnProperty.call(json, 'deviceOrientation')) next.deviceOrientation = json.deviceOrientation
    next.cloud = true
    for (const key of Object.keys(json)) if (key !== 'deviceOrientation' && key !== 'cloud') next[key] = json[key]
    write(paths.gameJson, JSON.stringify(next, null, 2) + '\n')
    log('已恢复 game.json 的 cloud=true')
  } else log('game.json cloud=true 已存在')
}

function restoreOpenData() {
  copyDirRecursive(paths.openDataSource, paths.openDataTarget)
  log('已恢复 open-data 开放数据域目录')
}

function writeStaticFiles() {
  write(paths.syncJs, WX_CLOUD_PROGRESS_SYNC)
  write(paths.cloudIndex, CLOUD_INDEX)
  write(paths.cloudPackage, CLOUD_PACKAGE)
  log('已重建 wx-cloud-progress-sync.js 和 progressStorage 云函数')
}

function replaceFunctionBlock(content, startMarker, endMarker, replacement) {
  const start = content.indexOf(startMarker)
  const end = content.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error('webgl.wasm.framework.unityweb.js 中找不到补丁位置: ' + startMarker)
  return content.slice(0, start) + replacement + content.slice(end)
}

function patchFrameworkJs() {
  let content = read(paths.frameworkJs)
  content = replaceFunctionBlock(
    content,
    'function _WXGetCloudDatabaseProgress',
    'function _WXGetDynamicMemorySize',
    'function _WXGetCloudDatabaseProgress(){if(typeof GameGlobal!=="undefined"&&GameGlobal.__HYFRestoreProgressFromCloud){GameGlobal.__HYFRestoreProgressFromCloud()}}'
  )
  content = replaceFunctionBlock(
    content,
    'function _WXSetCloudDatabaseProgress',
    'function _WXSetDataCDN',
    'function _WXSetCloudDatabaseProgress(progress){if(typeof GameGlobal!=="undefined"&&GameGlobal.__HYFSaveProgressToCloud){GameGlobal.__HYFSaveProgressToCloud(progress,"wasm")}}'
  )
  const rewardedVideoPatch = 'function _WXShowRewardedVideoAd(adUnitId){try{var adUnitIdStr=UTF8ToString(adUnitId||"");if(!adUnitIdStr){SendMessage("WXCloudStorageCallbackObj","OnRewardedVideoAdFailed","missing adUnitId");return}if(typeof wx==="undefined"||!wx.createRewardedVideoAd){SendMessage("WXCloudStorageCallbackObj","OnRewardedVideoAdFailed","wx.createRewardedVideoAd not available");return}var videoAd=wx.createRewardedVideoAd({adUnitId:adUnitIdStr});var cleanup=function(){if(videoAd.offClose)videoAd.offClose(onClose);if(videoAd.offError)videoAd.offError(onError)};var onClose=function(res){cleanup();if(!res||res.isEnded){SendMessage("WXCloudStorageCallbackObj","OnRewardedVideoAdFinished","success")}else{SendMessage("WXCloudStorageCallbackObj","OnRewardedVideoAdFailed","not finished")}};var onError=function(err){cleanup();var msg=err&&(err.errMsg||err.message)?err.errMsg||err.message:JSON.stringify(err||{});msg=msg||"rewarded video error";var lowerMsg=String(msg).toLowerCase();if(lowerMsg.indexOf("no advertisement")>=0||lowerMsg.indexOf("no ad")>=0||lowerMsg.indexOf("no_ads")>=0){console.warn("[WXCloudStorage.jslib] rewarded video no advertisement, fallback success:",msg);SendMessage("WXCloudStorageCallbackObj","OnRewardedVideoAdFinished","no advertisement fallback");return}SendMessage("WXCloudStorageCallbackObj","OnRewardedVideoAdFailed",msg)};videoAd.onClose(onClose);videoAd.onError(onError);videoAd.show().catch(function(){return videoAd.load().then(function(){return videoAd.show()})}).catch(onError)}catch(errorObj){console.error("[WXCloudStorage.jslib] rewarded video exception:",errorObj);SendMessage("WXCloudStorageCallbackObj","OnRewardedVideoAdFailed",errorObj.message||String(errorObj))}}'
  const rewardedVideoStart = content.indexOf('function _WXShowRewardedVideoAd')
  if (rewardedVideoStart >= 0) {
    content = replaceFunctionBlock(content, 'function _WXShowRewardedVideoAd', 'function _WXStat', rewardedVideoPatch)
  } else {
    const insertBefore = content.indexOf('function _WXGetStorageSync')
    if (insertBefore < 0) throw new Error('webgl.wasm.framework.unityweb.js 中找不到补丁位置: function _WXGetStorageSync')
    content = content.slice(0, insertBefore) + rewardedVideoPatch + content.slice(insertBefore)
  }
  content = replaceFunctionBlock(
    content,
    'function _WXGetStorageSync',
    'function _WXGetTotalMemorySize',
    'function _WXGetStorageSync(key){try{var keyStr=UTF8ToString(key);var value="";if(typeof wx!=="undefined"&&wx.getStorageSync){value=wx.getStorageSync(keyStr)||"";console.log("[WXCloudStorage.jslib] getStorageSync success:",keyStr,value)}else{console.warn("[WXCloudStorage.jslib] wx.getStorageSync not available")}var callbackName=keyStr==="cloud_int_value_local"?"OnCloudIntValueLocalLoaded":"OnLocalLoaded";SendMessage("WXCloudStorageCallbackObj",callbackName,String(value))}catch(errorObj){console.error("[WXCloudStorage.jslib] getStorageSync exception:",errorObj);SendMessage("WXCloudStorageCallbackObj","OnLocalLoaded","")}}'
  )
  content = replaceFunctionBlock(
    content,
    'function _WXSetStorageSync',
    'function _WXSetSyncReadCacheEnabled',
    'function _WXSetStorageSync(key,value){try{var keyStr=UTF8ToString(key);var valueStr=UTF8ToString(value);if(typeof wx!=="undefined"&&wx.setStorageSync){wx.setStorageSync(keyStr,valueStr);console.log("[WXCloudStorage.jslib] setStorageSync success:",keyStr,valueStr)}else{console.warn("[WXCloudStorage.jslib] wx.setStorageSync not available")}if(keyStr==="game_progress_local"){var progressValue=parseInt(valueStr||"0",10);if(!isNaN(progressValue)&&progressValue>0&&typeof GameGlobal!=="undefined"&&GameGlobal.__HYFSaveProgressToCloud){GameGlobal.__HYFSaveProgressToCloud(progressValue,"wasm-storage")}}if(keyStr==="cloud_int_value_local"){var cloudIntValue=parseInt(valueStr||"0",10);if(!isNaN(cloudIntValue)&&cloudIntValue>=0&&typeof GameGlobal!=="undefined"&&GameGlobal.__HYFSaveCloudIntValueToCloud){GameGlobal.__HYFSaveCloudIntValueToCloud(cloudIntValue,"wasm-storage")}}}catch(errorObj){console.warn("[WXCloudStorage.jslib] setStorageSync exception:",errorObj)}}'
  )
  write(paths.frameworkJs, content)
  log('已恢复 webgl.wasm.framework.unityweb.js 桥接补丁')
}

function checkJs(file) { execFileSync('node', ['--check', file], { stdio: 'inherit' }) }
function validate() {
  checkJs(paths.frameworkJs)
  checkJs(paths.syncJs)
  checkJs(paths.cloudIndex)
  JSON.parse(read(paths.projectConfig))
  JSON.parse(read(paths.gameJson))
  log('语法检查通过')
}

function main() {
  ensureFile(paths.gameJs)
  ensureFile(paths.gameJson)
  ensureFile(paths.projectConfig)
  ensureFile(paths.frameworkJs)
  patchGameJs()
  patchProjectConfig()
  patchGameJson()
  writeStaticFiles()
  restoreOpenData()
  patchFrameworkJs()
  validate()
  log('完成。请在微信开发者工具里右键 cloudfunctions/progressStorage，选择“上传并部署：云端安装依赖”。')
}

try { main() } catch (error) { console.error('[restore-wechat-h5] 失败:', error.message); process.exit(1) }
