mergeInto(LibraryManager.library, {
    // 保存数据到微信用户云存储
    // jsonKVData: 格式为 [{"key":"game_progress","value":"2"}]
    WXSetUserCloudStorage: function(jsonKVData) {
        try {
            var dataStr = UTF8ToString(jsonKVData);
            var kvDataList = JSON.parse(dataStr);

            if (typeof wx !== 'undefined' && wx.setUserCloudStorage) {
                wx.setUserCloudStorage({
                    KVDataList: kvDataList,
                    success: function(res) {
                        console.log('[WXCloudStorage.jslib] setUserCloudStorage success');
                        SendMessage('WXCloudStorageCallbackObj', 'OnCloudSaved', 'success');
                    },
                    fail: function(err) {
                        console.error('[WXCloudStorage.jslib] setUserCloudStorage fail:', err);
                        SendMessage('WXCloudStorageCallbackObj', 'OnCloudError', JSON.stringify(err));
                    }
                });
            } else {
                console.warn('[WXCloudStorage.jslib] wx.setUserCloudStorage not available');
                SendMessage('WXCloudStorageCallbackObj', 'OnCloudError', 'wx.setUserCloudStorage not available');
            }
        } catch (err) {
            console.error('[WXCloudStorage.jslib] setUserCloudStorage exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnCloudError', err.message || String(err));
        }
    },

    // 从微信用户云存储读取数据
    WXGetUserCloudStorage: function(key) {
        try {
            var keyStr = UTF8ToString(key);

            if (typeof wx !== 'undefined' && wx.getUserCloudStorage) {
                wx.getUserCloudStorage({
                    keyList: [keyStr],
                    success: function(res) {
                        console.log('[WXCloudStorage.jslib] getUserCloudStorage success:', res);
                        var value = '';
                        if (res.KVDataList && res.KVDataList.length > 0) {
                            value = res.KVDataList[0].value || '';
                        }
                        SendMessage('WXCloudStorageCallbackObj', 'OnCloudLoaded', value);
                    },
                    fail: function(err) {
                        console.error('[WXCloudStorage.jslib] getUserCloudStorage fail:', err);
                        SendMessage('WXCloudStorageCallbackObj', 'OnCloudError', JSON.stringify(err));
                    }
                });
            } else {
                console.warn('[WXCloudStorage.jslib] wx.getUserCloudStorage not available');
                SendMessage('WXCloudStorageCallbackObj', 'OnCloudError', 'wx.getUserCloudStorage not available');
            }
        } catch (err) {
            console.error('[WXCloudStorage.jslib] getUserCloudStorage exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnCloudError', err.message || String(err));
        }
    },

    WXInitCloudDatabase: function(envId, collectionName) {
        try {
            var envIdStr = UTF8ToString(envId);
            var collectionNameStr = UTF8ToString(collectionName);

            if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.init || !wx.cloud.callFunction) {
                console.warn('[WXCloudStorage.jslib] wx.cloud callFunction not available');
                SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', 'wx.cloud.callFunction not available');
                return;
            }

            var initOptions = { traceUser: true };
            if (envIdStr) {
                initOptions.env = envIdStr;
            }
            wx.cloud.init(initOptions);

            window.__WXCloudStorageDb = {
                ready: true,
                collectionName: collectionNameStr || 'user_game_progress'
            };

            console.log('[WXCloudStorage.jslib] cloud database initialized:', envIdStr || 'default', window.__WXCloudStorageDb.collectionName);

            if (typeof wx !== 'undefined' && wx.getStorageSync) {
                var cachedProgress = parseInt(wx.getStorageSync('game_progress_local') || '0', 10);
                if (!isNaN(cachedProgress) && cachedProgress > 0) {
                    WXSetCloudDatabaseProgress(cachedProgress);
                }
            }
        } catch (err) {
            console.error('[WXCloudStorage.jslib] cloud database init exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', err.message || String(err));
        }
    },

    WXGetCloudDatabaseProgress: function() {
        try {
            var state = window.__WXCloudStorageDb;
            if (!state || !state.ready) {
                SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', 'cloud database not initialized');
                return;
            }

            if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
                SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', 'wx.cloud.callFunction not available');
                return;
            }

            wx.cloud.callFunction({
                name: 'progressStorage',
                data: { action: 'get' },
                success: function(res) {
                    var result = res && res.result ? res.result : {};
                    if (result.ok === false) {
                        var errorMsg = result.error || 'cloud function get returned ok false';
                        console.warn('[WXCloudStorage.jslib] cloud function progress load error:', errorMsg, 'env:', result.env || '');
                        SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', errorMsg);
                        return;
                    }
                    var progress = parseInt(result.progress || 0, 10);
                    if (isNaN(progress) || progress < 0) {
                        progress = 0;
                    }
                    console.log('[WXCloudStorage.jslib] cloud function progress loaded:', progress, 'env:', result.env || '', 'count:', result.count || 0);
                    SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbLoaded', String(progress));
                },
                fail: function(errorObj) {
                    console.warn('[WXCloudStorage.jslib] cloud function get fail:', errorObj);
                    SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', JSON.stringify(errorObj));
                }
            });
        } catch (err) {
            console.error('[WXCloudStorage.jslib] cloud function get exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', err.message || String(err));
        }
    },

    WXSetCloudDatabaseProgress: function(progress) {
        try {
            var state = window.__WXCloudStorageDb;
            if (!state || !state.ready) {
                SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', 'cloud database not initialized');
                return;
            }

            var progressValue = progress | 0;
            if (progressValue <= 0) {
                return;
            }

            if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
                SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', 'wx.cloud.callFunction not available');
                return;
            }

            wx.cloud.callFunction({
                name: 'progressStorage',
                data: {
                    action: 'set',
                    progress: progressValue
                },
                success: function(res) {
                    var result = res && res.result ? res.result : {};
                    if (result.ok === false) {
                        var errorMsg = result.error || 'cloud function set returned ok false';
                        console.warn('[WXCloudStorage.jslib] cloud function progress save error:', errorMsg, 'env:', result.env || '');
                        SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', errorMsg);
                        return;
                    }
                    var savedProgress = parseInt(result.progress || progressValue, 10);
                    if (isNaN(savedProgress) || savedProgress < progressValue) {
                        savedProgress = progressValue;
                    }
                    console.log('[WXCloudStorage.jslib] cloud function progress saved:', savedProgress, 'env:', result.env || '', 'recordId:', result.recordId || '');
                    SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbSaved', String(savedProgress));
                },
                fail: function(errorObj) {
                    console.warn('[WXCloudStorage.jslib] cloud function set fail:', errorObj);
                    SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', JSON.stringify(errorObj));
                }
            });
        } catch (err) {
            console.error('[WXCloudStorage.jslib] cloud function set exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', err.message || String(err));
        }
    },

    WXSetStorageSync: function(key, value) {
        try {
            var keyStr = UTF8ToString(key);
            var valueStr = UTF8ToString(value);

            if (typeof wx !== 'undefined' && wx.setStorageSync) {
                wx.setStorageSync(keyStr, valueStr);
                console.log('[WXCloudStorage.jslib] setStorageSync success:', keyStr, valueStr);
            } else {
                console.warn('[WXCloudStorage.jslib] wx.setStorageSync not available');
            }

            if (keyStr === 'game_progress_local') {
                var progressValue = parseInt(valueStr || '0', 10);
                if (!isNaN(progressValue) && progressValue > 0) {
                    WXSetCloudDatabaseProgress(progressValue);
                }
            }
        } catch (errorObj) {
            console.warn('[WXCloudStorage.jslib] setStorageSync exception:', errorObj);
        }
    },

    WXGetStorageSync: function(key) {
        try {
            var keyStr = UTF8ToString(key);
            var value = '';

            if (typeof wx !== 'undefined' && wx.getStorageSync) {
                value = wx.getStorageSync(keyStr) || '';
                console.log('[WXCloudStorage.jslib] getStorageSync success:', keyStr, value);
            } else {
                console.warn('[WXCloudStorage.jslib] wx.getStorageSync not available');
            }

            SendMessage('WXCloudStorageCallbackObj', 'OnLocalLoaded', String(value));
        } catch (err) {
            console.error('[WXCloudStorage.jslib] getStorageSync exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnLocalLoaded', '');
        }
    }
});
