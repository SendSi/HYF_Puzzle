using UnityEngine;

/// <summary>
/// 微信云存储的 WebGL JS 插件 P/Invoke 声明
/// 必须放在 AOT 程序集中，HybridCLR 才能正确生成 MethodBridge
/// </summary>
public static class WXCloudStorageNative
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXSetUserCloudStorage(string jsonKVData);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXGetUserCloudStorage(string key);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXSetStorageSync(string key, string value);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXGetStorageSync(string key);

    public static void SetUserCloudStorage(string jsonKVData)
    {
        WXSetUserCloudStorage(jsonKVData);
    }

    public static void GetUserCloudStorage(string key)
    {
        WXGetUserCloudStorage(key);
    }

    public static void SetStorageSync(string key, string value)
    {
        WXSetStorageSync(key, value);
    }

    public static void GetStorageSync(string key)
    {
        WXGetStorageSync(key);
    }
#else
    public static void SetUserCloudStorage(string jsonKVData)
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip cloud storage.");
    }

    public static void GetUserCloudStorage(string key)
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip cloud storage.");
    }

    public static void SetStorageSync(string key, string value)
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip local storage.");
    }

    public static void GetStorageSync(string key)
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip local storage.");
    }
#endif
}
