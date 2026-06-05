mergeInto(LibraryManager.library, {
    // 保存数据到微信用户云存储
    // jsonKVData: 格式为 [{"key":"game_progress","value":"2"}]
    WXSetUserCloudStorage: function(jsonKVData) {
        var dataStr = UTF8ToString(jsonKVData);
        var kvDataList = JSON.parse(dataStr);

        if (typeof wx !== 'undefined' && wx.setUserCloudStorage) {
            wx.setUserCloudStorage({
                KVDataList: kvDataList,
                success: function(res) {
                    console.log('[WXCloudStorage.jslib] setUserCloudStorage success');
                    // 通过 SendMessage 回调 C#
                    SendMessage('WXCloudStorageCallbackObj', 'OnCloudSaved', 'success');
                },
                fail: function(err) {
                    console.error('[WXCloudStorage.jslib] setUserCloudStorage fail:', err);
                    SendMessage('WXCloudStorageCallbackObj', 'OnCloudError', JSON.stringify(err));
                }
            });
        } else {
            console.warn('[WXCloudStorage.jslib] wx.setUserCloudStorage not available');
        }
    },

    // 从微信用户云存储读取数据
    WXGetUserCloudStorage: function(key) {
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
        }
    }
});
