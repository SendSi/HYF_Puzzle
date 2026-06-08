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
        } catch (err) {
            console.error('[WXCloudStorage.jslib] cloud database init exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnCloudDbError', err.message || String(err));
        }
    },

    WXGetCloudDatabaseProgress: function() {
        if (typeof GameGlobal !== 'undefined' && GameGlobal.__HYFRestoreProgressFromCloud) {
            GameGlobal.__HYFRestoreProgressFromCloud();
        }
    },

    WXSetCloudDatabaseProgress: function(progress) {
        if (typeof GameGlobal !== 'undefined' && GameGlobal.__HYFSaveProgressToCloud) {
            GameGlobal.__HYFSaveProgressToCloud(progress, 'wasm');
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

            if (keyStr === 'cloud_int_value_local') {
                var cloudIntValue = parseInt(valueStr || '0', 10);
                if (!isNaN(cloudIntValue) && cloudIntValue >= 0 && typeof GameGlobal !== 'undefined' && GameGlobal.__HYFSaveCloudIntValueToCloud) {
                    GameGlobal.__HYFSaveCloudIntValueToCloud(cloudIntValue, 'wasm-storage');
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

            var callbackName = keyStr === 'cloud_int_value_local' ? 'OnCloudIntValueLocalLoaded' : 'OnLocalLoaded';
            SendMessage('WXCloudStorageCallbackObj', callbackName, String(value));
        } catch (err) {
            console.error('[WXCloudStorage.jslib] getStorageSync exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnLocalLoaded', '');
        }
    },

    WXShowRewardedVideoAd: function(adUnitId) {
        try {
            var adUnitIdStr = UTF8ToString(adUnitId || '');
            if (!adUnitIdStr) {
                SendMessage('WXCloudStorageCallbackObj', 'OnRewardedVideoAdFailed', 'missing adUnitId');
                return;
            }
            if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) {
                SendMessage('WXCloudStorageCallbackObj', 'OnRewardedVideoAdFailed', 'wx.createRewardedVideoAd not available');
                return;
            }

            var videoAd = wx.createRewardedVideoAd({ adUnitId: adUnitIdStr });
            var finished = false;
            var closed = false;

            var cleanup = function() {
                if (videoAd.offClose) videoAd.offClose(onClose);
                if (videoAd.offError) videoAd.offError(onError);
            };
            var onClose = function(res) {
                closed = true;
                cleanup();
                if (!res || res.isEnded) {
                    finished = true;
                    SendMessage('WXCloudStorageCallbackObj', 'OnRewardedVideoAdFinished', 'success');
                } else {
                    SendMessage('WXCloudStorageCallbackObj', 'OnRewardedVideoAdFailed', 'not finished');
                }
            };
            var onError = function(err) {
                cleanup();
                var msg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : JSON.stringify(err || {});
                msg = msg || 'rewarded video error';
                var lowerMsg = String(msg).toLowerCase();
                if (lowerMsg.indexOf('no advertisement') >= 0 || lowerMsg.indexOf('no ad') >= 0 || lowerMsg.indexOf('no_ads') >= 0) {
                    console.warn('[WXCloudStorage.jslib] rewarded video no advertisement, fallback success:', msg);
                    SendMessage('WXCloudStorageCallbackObj', 'OnRewardedVideoAdFinished', 'no advertisement fallback');
                    return;
                }
                SendMessage('WXCloudStorageCallbackObj', 'OnRewardedVideoAdFailed', msg);
            };

            videoAd.onClose(onClose);
            videoAd.onError(onError);
            videoAd.show().catch(function() {
                return videoAd.load().then(function() { return videoAd.show(); });
            }).catch(onError);
        } catch (err) {
            console.error('[WXCloudStorage.jslib] rewarded video exception:', err);
            SendMessage('WXCloudStorageCallbackObj', 'OnRewardedVideoAdFailed', err.message || String(err));
        }
    }
});
