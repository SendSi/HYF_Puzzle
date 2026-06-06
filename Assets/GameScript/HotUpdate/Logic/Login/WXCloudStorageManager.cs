using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 微信小游戏云存储管理器
/// 使用微信开放数据域/云存储能力，确保数据卸载后不丢失
/// </summary>
public class WXCloudStorageManager : Singleton<WXCloudStorageManager>
{
    // 本地缓存（作为微信云存储的备份/快速读取）
    private const string LOCAL_PROGRESS_KEY = "GameProgress";
    private const string CLOUD_SYNC_TIME_KEY = "CloudSyncTime";
    private const string WX_LOCAL_PROGRESS_KEY = "game_progress_local";
    private const string WX_CLOUD_ENV_ID = "";
    private const string WX_CLOUD_COLLECTION = "user_game_progress";

    // 当前进度
    private int _currentProgress = 0;
    public int CurrentProgress => _currentProgress;

    // 云端数据是否已加载完毕
    private bool _cloudDataLoaded = false;
    public bool CloudDataLoaded => _cloudDataLoaded;

    // 云端进度变更事件（UI 监听刷新）
    public event Action<int> OnProgressChanged;

    protected override void OnInit()
    {
        base.OnInit();
        // 创建 JS 回调接收对象（GameObject，挂载 WXCloudStorageCallback 脚本）
        WXCloudStorageCallback.EnsureCreated();
        // 启动时先读微信本地缓存；云端恢复由小游戏原生 JS 兜底脚本处理
        LoadProgressFromCloud();
    }

    #region 公共接口

    /// <summary>
    /// 设置并保存进度到微信云端
    /// </summary>
    public void SaveProgress(int level)
    {
        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        int maxProgress = Mathf.Max(level, _currentProgress, localProgress);

        SaveMergedProgress(maxProgress, true);
    }

    /// <summary>
    /// 获取当前进度
    /// </summary>
    public int GetProgress()
    {
        // 如果内存中有值，直接返回
        if (_currentProgress > 0)
            return _currentProgress;

        // 尝试从本地读取
        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        _currentProgress = localProgress;

        return _currentProgress;
    }

    /// <summary>
    /// 从微信云端加载进度（启动时调用）
    /// </summary>
    public void LoadProgressFromCloud()
    {
        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        if (localProgress > _currentProgress)
        {
            _currentProgress = localProgress;
        }

        GetFromWXLocal();

        Debuger.Log($"[WXCloudStorage] 当前本地进度: {_currentProgress}");
    }

    #endregion

    #region 微信云存储 JS 交互

    /// <summary>
    /// 保存数据到微信用户云存储
    /// 使用 wx.setUserCloudStorage
    /// </summary>
    private void SaveToWXCloud(int level)
    {
        // 构建要存储的 KV 数据
        string jsonData = $"[{{\"key\":\"game_progress\",\"value\":\"{level}\"}}]";

        // 调用 AOT 中的 P/Invoke 方法保存到微信云端
        WXCloudStorageNative.SetUserCloudStorage(jsonData);

        Debuger.Log($"[WXCloudStorage] 正在同步到微信云端: 第{level}关");
    }

    private void SaveToWXLocal(int level)
    {
        WXCloudStorageNative.SetStorageSync(WX_LOCAL_PROGRESS_KEY, level.ToString());
        Debuger.Log($"[WXCloudStorage] 正在保存到微信本地: 第{level}关");
    }

    private void InitWXCloudDatabase()
    {
        WXCloudStorageNative.InitCloudDatabase(WX_CLOUD_ENV_ID, WX_CLOUD_COLLECTION);
        string envName = string.IsNullOrEmpty(WX_CLOUD_ENV_ID) ? "默认云环境" : WX_CLOUD_ENV_ID;
        Debuger.Log($"[WXCloudStorage] 正在初始化微信云开发数据库: {envName}");
    }

    private void SaveToWXCloudDatabase(int level)
    {
        WXCloudStorageNative.SetCloudDatabaseProgress(level);
        Debuger.Log($"[WXCloudStorage] 正在同步到微信云开发数据库: 第{level}关");
    }

    private void GetFromWXCloudDatabase()
    {
        WXCloudStorageNative.GetCloudDatabaseProgress();
    }

    /// <summary>
    /// 从微信用户云存储读取数据
    /// 使用 wx.getUserCloudStorage
    /// </summary>
    private void GetFromWXCloud()
    {
        // 调用 AOT 中的 P/Invoke 方法从微信云端读取
        WXCloudStorageNative.GetUserCloudStorage("game_progress");
    }

    private void GetFromWXLocal()
    {
        WXCloudStorageNative.GetStorageSync(WX_LOCAL_PROGRESS_KEY);
    }

    private void SaveMergedProgress(int progress, bool syncWX)
    {
        if (progress <= 0)
            return;

        bool changed = _currentProgress != progress;
        _currentProgress = progress;

        PlayerPrefsHelper.SetInteger(LOCAL_PROGRESS_KEY, progress);
        PlayerPrefsHelper.SetDateTime(CLOUD_SYNC_TIME_KEY, DateTime.Now);

        SaveToWXLocal(progress);

        Debuger.Log($"[WXCloudStorage] 当前最大进度: 第{progress}关");

        if (changed)
        {
            OnProgressChanged?.Invoke(_currentProgress);
        }
    }

    #endregion

    #region JS 回调方法（由 WebGL 的 jslib 调用）

    /// <summary>
    /// 微信云端读取成功的回调
    /// </summary>
    public void OnCloudDataLoaded(string value)
    {
        _cloudDataLoaded = true;

        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        int cloudProgress = 0;
        if (!string.IsNullOrEmpty(value) && int.TryParse(value, out int level) && level > 0)
        {
            cloudProgress = level;
        }

        int maxProgress = Mathf.Max(cloudProgress, localProgress, _currentProgress);
        if (maxProgress > 0)
        {
            SaveMergedProgress(maxProgress, cloudProgress != maxProgress);
            Debuger.Log($"[WXCloudStorage] 加载进度成功，本地:{localProgress} 云端:{cloudProgress} 当前:{maxProgress}");
        }
        else
        {
            Debuger.Log("[WXCloudStorage] 本地和云端都没有进度");
        }
    }

    public void OnLocalDataLoaded(string value)
    {
        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        int wxLocalProgress = 0;
        if (!string.IsNullOrEmpty(value) && int.TryParse(value, out int level) && level > 0)
        {
            wxLocalProgress = level;
        }

        int maxProgress = Mathf.Max(_currentProgress, localProgress, wxLocalProgress);
        if (maxProgress > 0)
        {
            SaveMergedProgress(maxProgress, true);
            Debuger.Log($"[WXCloudStorage] 微信本地进度，本地:{localProgress} 微信:{wxLocalProgress} 当前:{maxProgress}");
        }
    }

    public void OnCloudDbDataLoaded(string value)
    {
        _cloudDataLoaded = true;

        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        int cloudProgress = 0;
        if (!string.IsNullOrEmpty(value) && int.TryParse(value, out int level) && level > 0)
        {
            cloudProgress = level;
        }

        int maxProgress = Mathf.Max(cloudProgress, localProgress, _currentProgress);
        if (maxProgress > 0)
        {
            SaveMergedProgress(maxProgress, cloudProgress != maxProgress);
            Debuger.Log($"[WXCloudStorage] 云开发数据库进度，本地:{localProgress} 云端:{cloudProgress} 当前:{maxProgress}");
        }
        else
        {
            Debuger.Log("[WXCloudStorage] 云开发数据库和本地都没有进度");
        }
    }

    public void OnCloudDbDataSaved(string msg)
    {
        Debuger.Log($"[WXCloudStorage] 微信云开发数据库保存成功: {msg}");
    }

    public void OnCloudDbDataError(string error)
    {
        _cloudDataLoaded = true;
        Debuger.LogError($"[WXCloudStorage] 微信云开发数据库操作失败: {error}；已回退本地缓存，卸载后恢复需要云开发数据库可用");

        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        int maxProgress = Mathf.Max(_currentProgress, localProgress);
        if (maxProgress > 0)
        {
            SaveMergedProgress(maxProgress, false);
        }
    }

    /// <summary>
    /// 微信云端保存成功的回调
    /// </summary>
    public void OnCloudDataSaved(string msg)
    {
        Debuger.Log($"[WXCloudStorage] 微信云端保存成功: {msg}");
    }

    /// <summary>
    /// 微信云端操作失败的回调
    /// </summary>
    public void OnCloudDataError(string error)
    {
        _cloudDataLoaded = true;
        Debuger.LogError($"[WXCloudStorage] 微信云端操作失败: {error}");

        // 失败时保留已知最大进度，避免卸载重装后的空本地值覆盖当前进度
        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        int maxProgress = Mathf.Max(_currentProgress, localProgress);
        if (maxProgress > 0)
        {
            SaveMergedProgress(maxProgress, false);
        }
    }

    #endregion

}
