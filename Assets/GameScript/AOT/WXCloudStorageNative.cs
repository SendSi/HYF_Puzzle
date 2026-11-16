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

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXInitCloudDatabase(string envId, string collectionName);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXGetCloudDatabaseProgress();

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXSetCloudDatabaseProgress(int progress);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXShowRewardedVideoAd(string adUnitId);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXSaveProfile(string jsonProfile);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXLoadProfile();

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXReportLevelClear(string jsonReport);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXDailySignIn();

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXUseHint();

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXAddHint(int amount);

    [System.Runtime.InteropServices.DllImport("__Internal")]
    private static extern void WXLoadRankList();

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

    public static void InitCloudDatabase(string envId, string collectionName)
    {
        WXInitCloudDatabase(envId, collectionName);
    }

    public static void GetCloudDatabaseProgress()
    {
        WXGetCloudDatabaseProgress();
    }

    public static void SetCloudDatabaseProgress(int progress)
    {
        WXSetCloudDatabaseProgress(progress);
    }

    public static void ShowRewardedVideoAd(string adUnitId)
    {
        WXShowRewardedVideoAd(adUnitId);
    }

    public static void SaveProfile(string jsonProfile)
    {
        WXSaveProfile(jsonProfile);
    }

    public static void LoadProfile()
    {
        WXLoadProfile();
    }

    public static void ReportLevelClear(string jsonReport)
    {
        WXReportLevelClear(jsonReport);
    }

    public static void DailySignIn()
    {
        WXDailySignIn();
    }

    public static void UseHint()
    {
        WXUseHint();
    }

    public static void AddHint(int amount)
    {
        WXAddHint(amount);
    }

    public static void LoadRankList()
    {
        WXLoadRankList();
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

    public static void InitCloudDatabase(string envId, string collectionName)
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip cloud database init.");
    }

    public static void GetCloudDatabaseProgress()
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip cloud database load.");
    }

    public static void SetCloudDatabaseProgress(int progress)
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip cloud database save.");
    }

    public static void ShowRewardedVideoAd(string adUnitId)
    {
        Debug.Log($"[WXCloudStorageNative] Editor/Standalone mode, skip rewarded video ad: {adUnitId}");
    }

    public static void SaveProfile(string jsonProfile)
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip profile save.");
    }

    public static void LoadProfile()
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip profile load.");
    }

    public static void ReportLevelClear(string jsonReport)
    {
        Debug.Log($"[WXCloudStorageNative] Editor/Standalone mode, skip level clear report: {jsonReport}");
    }

    public static void DailySignIn()
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip daily sign in.");
    }

    public static void UseHint()
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip use hint.");
    }

    public static void AddHint(int amount)
    {
        Debug.Log($"[WXCloudStorageNative] Editor/Standalone mode, skip add hint: {amount}");
    }

    public static void LoadRankList()
    {
        Debug.Log("[WXCloudStorageNative] Editor/Standalone mode, skip rank list.");
    }
#endif
}
