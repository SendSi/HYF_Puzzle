using UnityEngine;

/// <summary>
/// 微信云存储 JS 回调桥接
/// 挂载到场景中的 GameObject 上，通过 SendMessage 接收 JS 回调
/// </summary>
public class WXCloudStorageCallback : MonoBehaviour
{
    private static WXCloudStorageCallback _instance;

    public static void EnsureCreated()
    {
        if (_instance == null)
        {
            var go = new GameObject("WXCloudStorageCallbackObj");
            Object.DontDestroyOnLoad(go);
            _instance = go.AddComponent<WXCloudStorageCallback>();
        }
    }

    void Awake()
    {
        if (_instance != null && _instance != this)
        {
            Destroy(gameObject);
            return;
        }
        _instance = this;
        Object.DontDestroyOnLoad(gameObject);
    }

    /// <summary>
    /// JS 调用: SendMessage('WXCloudStorageCallbackObj', 'OnCloudSaved', 'success')
    /// </summary>
    public void OnCloudSaved(string msg)
    {
        Debug.Log($"[WXCloudStorageCallback] 保存成功: {msg}");
        WXCloudStorageManager.Instance.OnCloudDataSaved(msg);
    }

    /// <summary>
    /// JS 调用: SendMessage('WXCloudStorageCallbackObj', 'OnCloudLoaded', '5')
    /// </summary>
    public void OnCloudLoaded(string value)
    {
        Debug.Log($"[WXCloudStorageCallback] 加载成功: {value}");
        WXCloudStorageManager.Instance.OnCloudDataLoaded(value);
    }

    /// <summary>
    /// JS 调用: SendMessage('WXCloudStorageCallbackObj', 'OnCloudError', 'xxx')
    /// </summary>
    public void OnCloudError(string error)
    {
        Debug.LogError($"[WXCloudStorageCallback] 操作失败: {error}");
        WXCloudStorageManager.Instance.OnCloudDataError(error);
    }

    public void OnLocalLoaded(string value)
    {
        Debug.Log($"[WXCloudStorageCallback] 本地加载成功: {value}");
        WXCloudStorageManager.Instance.OnLocalDataLoaded(value);
    }

    public void OnCloudDbLoaded(string value)
    {
        Debug.Log($"[WXCloudStorageCallback] 云数据库加载成功: {value}");
        WXCloudStorageManager.Instance.OnCloudDbDataLoaded(value);
    }

    public void OnCloudDbSaved(string msg)
    {
        Debug.Log($"[WXCloudStorageCallback] 云数据库保存成功: {msg}");
        WXCloudStorageManager.Instance.OnCloudDbDataSaved(msg);
    }

    public void OnCloudDbError(string error)
    {
        Debug.LogError($"[WXCloudStorageCallback] 云数据库操作失败: {error}");
        WXCloudStorageManager.Instance.OnCloudDbDataError(error);
    }
}
