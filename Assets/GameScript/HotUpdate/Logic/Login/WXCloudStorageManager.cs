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
        // 启动时尝试从微信云端拉取数据
        LoadProgressFromCloud();
    }

    #region 公共接口

    /// <summary>
    /// 设置并保存进度到微信云端
    /// </summary>
    public void SaveProgress(int level)
    {
        _currentProgress = level;

        // 1. 先保存到本地（快速响应）
        PlayerPrefsHelper.SetInteger(LOCAL_PROGRESS_KEY, level);
        PlayerPrefsHelper.SetDateTime(CLOUD_SYNC_TIME_KEY, DateTime.Now);

        // 2. 保存到微信云端（卸载后不丢失）
        SaveToWXCloud(level);

        Debuger.Log($"[WXCloudStorage] 进度已保存: 第{level}关");
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
        // 尝试从微信云端拉取（非 WebGL 环境下 WXCloudStorageNative 会跳过）
        GetFromWXCloud();
        // 同时从本地读取作为后备
        int localProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        if (_currentProgress <= 0)
        {
            _currentProgress = localProgress;
        }
        Debuger.Log($"[WXCloudStorage] 当前进度: {_currentProgress}");
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

    /// <summary>
    /// 从微信用户云存储读取数据
    /// 使用 wx.getUserCloudStorage
    /// </summary>
    private void GetFromWXCloud()
    {
        // 调用 AOT 中的 P/Invoke 方法从微信云端读取
        WXCloudStorageNative.GetUserCloudStorage("game_progress");
    }

    #endregion

    #region JS 回调方法（由 WebGL 的 jslib 调用）

    /// <summary>
    /// 微信云端读取成功的回调
    /// </summary>
    public void OnCloudDataLoaded(string value)
    {
        _cloudDataLoaded = true;

        if (!string.IsNullOrEmpty(value) && int.TryParse(value, out int level) && level > 0)
        {
            _currentProgress = level;
            PlayerPrefsHelper.SetInteger(LOCAL_PROGRESS_KEY, level);
            Debuger.Log($"[WXCloudStorage] 从微信云端加载进度成功: 第{level}关");
        }
        else
        {
            // 云端没有数据，使用本地数据
            _currentProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
            Debuger.Log($"[WXCloudStorage] 云端无数据，使用本地进度: {_currentProgress}");
        }

        // 通知 UI 刷新
        OnProgressChanged?.Invoke(_currentProgress);
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

        // 失败时回退到本地数据
        _currentProgress = PlayerPrefsHelper.GetInteger(LOCAL_PROGRESS_KEY, 0);
        OnProgressChanged?.Invoke(_currentProgress);
    }

    #endregion

}
