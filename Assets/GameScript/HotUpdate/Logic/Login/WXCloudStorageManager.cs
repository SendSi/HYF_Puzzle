using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

/// <summary>
/// 单关最佳成绩（对应云端 profile.levels 里的每一条）。
/// </summary>
[Serializable]
public class WXLevelRecord
{
    public int stars;
    public long bestTimeMs;
    public int hintsUsed;
    public long firstClearAt;
    public long lastClearAt;
}

/// <summary>
/// 每日签到状态（对应云端 profile.daily）。
/// </summary>
[Serializable]
public class WXDailyData
{
    public string date;
    public bool signed;
    public int streak;
    public int reward;
    public int hintReward;
}

[Serializable]
public class WXRankEntry
{
    public int rank;
    public string openid;
    public string name;
    public int progress;
    public int totalStars;
    public int coins;
    public bool isSelf;
}

/// <summary>
/// 云端结构化档案在客户端的可用字段。
/// JsonUtility 不支持字典，levels/daily 由 OnProfileDataLoaded 单独用 Newtonsoft 解析。
/// </summary>
[Serializable]
public class WXUserProfile
{
    public int progress;
    public int cloudIntValue;
    public int coins;
    public int hints;
    public long updatedAt;
    public Dictionary<string, WXLevelRecord> levels = new Dictionary<string, WXLevelRecord>();
    public string dailyDate;
    public bool dailySigned;
    public int dailyStreak;
    public int dailyReward;
    public int dailyHintReward;
}

/// <summary>
/// 微信小游戏云存储管理器
/// 使用微信开放数据域/云存储能力，确保数据卸载后不丢失
/// </summary>
public class WXCloudStorageManager : Singleton<WXCloudStorageManager>
{
    // 本地缓存（作为微信云存储的备份/快速读取）
    private const string LOCAL_PROGRESS_KEY = "GameProgress";
    private const string LOCAL_CLOUD_INT_KEY = "CloudIntValue";
    private const string CLOUD_SYNC_TIME_KEY = "CloudSyncTime";
    private const string CLOUD_INT_SYNC_TIME_KEY = "CloudIntValueSyncTime";
    private const string WX_LOCAL_PROGRESS_KEY = "game_progress_local";
    private const string WX_LOCAL_CLOUD_INT_KEY = "cloud_int_value_local";
    private const string LOCAL_PROFILE_CACHE_KEY = "WXProfileCache";
    private const string WX_CLOUD_ENV_ID = "";
    private const string WX_CLOUD_COLLECTION = "user_game_progress";

    // 当前进度
    private int _currentProgress = 0;
    public int CurrentProgress => _currentProgress;

    // 可加减的云端 int 值
    private int _currentCloudIntValue = 0;
    public int CurrentCloudIntValue => _currentCloudIntValue;

    // 云端数据是否已加载完毕
    private bool _cloudDataLoaded = false;
    public bool CloudDataLoaded => _cloudDataLoaded;

    // 云端进度变更事件（UI 监听刷新）
    public event Action<int> OnProgressChanged;

    // 可加减 int 值变更事件（UI 或测试按钮可监听刷新）
    public event Action<int> OnCloudIntValueChanged;

    // 结构化档案变更事件（本地上报或云端恢复后触发）
    public event Action<WXUserProfile> OnProfileUpdated;

    // 今日首次签到成功时触发（重复签到不触发）
    public event Action<WXUserProfile> OnDailySigned;

    // 排行榜数据到达时触发
    public event Action<List<WXRankEntry>> OnRankListLoaded;

    private readonly WXUserProfile _profile = new WXUserProfile();

    [Serializable]
    private class LevelClearReport
    {
        public int level;
        public int stars;
        public long timeMs;
        public int hintsUsed;
    }

    // 激励视频广告回调
    private Action _rewardedVideoSuccessCallback;
    private Action<string> _rewardedVideoFailCallback;

    // 最近一次向云端请求档案的时间（秒），用于节流
    private float _lastProfileRefreshAt = -9999f;

    // 档案内容指纹：同一份档案被 JS 重复投递时不必重复刷新 UI
    private string _profileSignature = "";

    protected override void OnInit()
    {
        base.OnInit();
        // 创建 JS 回调接收对象（GameObject，挂载 WXCloudStorageCallback 脚本）
        WXCloudStorageCallback.EnsureCreated();
        // 启动时先读微信本地缓存；云端恢复由小游戏原生 JS 兜底脚本处理
        LoadProgressFromCloud();

        // 先用本地缓存的档案铺底：选关页/结算页第一帧就有星级，
        // 不再依赖"云端档案什么时候回来"（真机上 Unity 就绪往往晚于 JS 的启动推送）。
        LoadCachedProfile();

        // 拉取云端结构化档案（选关/结算页的星级、最佳用时等后续从它取）
        RefreshProfileFromCloud(true);
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
    /// 获取可加减的云端 int 值
    /// </summary>
    public int GetCloudIntValue()
    {
        int localValue = PlayerPrefsHelper.GetInteger(LOCAL_CLOUD_INT_KEY, 0);
        _currentCloudIntValue = localValue;
        return _currentCloudIntValue;
    }

    /// <summary>
    /// 设置并保存可加减的云端 int 值
    /// </summary>
    public void SetCloudIntValue(int value)
    {
        SaveMergedCloudIntValue(Mathf.Max(0, value), true);
    }

    /// <summary>
    /// 增加可加减的云端 int 值
    /// </summary>
    public int AddCloudIntValue(int delta = 1)
    {
        int nextValue = GetCloudIntValue() + delta;
        SetCloudIntValue(nextValue);
        return _currentCloudIntValue;
    }

    /// <summary>
    /// 减少可加减的云端 int 值，默认不低于 0
    /// </summary>
    public int ReduceCloudIntValue(int delta = 1)
    {
        int nextValue = Mathf.Max(0, GetCloudIntValue() - delta);
        SetCloudIntValue(nextValue);
        return _currentCloudIntValue;
    }

    /// <summary>
    /// 播放微信激励视频广告，完整看完后执行 successCallback
    /// </summary>
    public void ShowRewardedVideoAd(string adUnitId, Action successCallback, Action<string> failCallback = null)
    {
        _rewardedVideoSuccessCallback = successCallback;
        _rewardedVideoFailCallback = failCallback;

        WXCloudStorageCallback.EnsureCreated();
        WXCloudStorageNative.ShowRewardedVideoAd(adUnitId);
        Debuger.Log($"[WXCloudStorage] 请求播放激励视频广告: {adUnitId}");
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

        int localCloudIntValue = PlayerPrefsHelper.GetInteger(LOCAL_CLOUD_INT_KEY, 0);
        _currentCloudIntValue = localCloudIntValue;

        GetFromWXLocal();
        GetFromWXLocalCloudIntValue();

        Debuger.Log($"[WXCloudStorage] 当前本地进度: {_currentProgress}，CloudIntValue: {_currentCloudIntValue}");
    }

    /// <summary>
    /// 获取当前结构化档案（只读语义，修改请走专用接口）
    /// </summary>
    public WXUserProfile GetProfile()
    {
        _profile.progress = _currentProgress;
        _profile.cloudIntValue = _currentCloudIntValue;
        return _profile;
    }

    /// <summary>
    /// 上报关卡完成。level 是刚拼完的关卡号，解锁进度由服务端推进并校验。
    /// </summary>
    public void ReportLevelClear(int clearedLevel, int stars = 1, long timeMs = 0, int hintsUsed = 0)
    {
        if (clearedLevel <= 0)
            return;

        int nextLevel = Mathf.Max(_currentProgress, clearedLevel + 1);
        // syncWX=false：本路径由 reportLevelClear 直接写云端档案，不再重复走旧文件存档通道。
        SaveMergedProgress(nextLevel, false);

        _profile.progress = _currentProgress;
        _profile.cloudIntValue = _currentCloudIntValue;
        OnProfileUpdated?.Invoke(_profile);

        var report = new LevelClearReport
        {
            level = clearedLevel,
            stars = Mathf.Clamp(stars, 1, 3),
            timeMs = Math.Max(0L, timeMs),
            hintsUsed = Mathf.Max(0, hintsUsed),
        };

        MergeLocalLevelRecord(clearedLevel, report.stars, report.timeMs, report.hintsUsed);

        WXCloudStorageNative.ReportLevelClear(JsonUtility.ToJson(report));
        Debuger.Log($"[WXCloudStorage] 上报关卡完成: level={clearedLevel}, stars={report.stars}, timeMs={report.timeMs}, hints={report.hintsUsed}");
    }

    /// <summary>
    /// 请求每日签到。日期、重复判断和奖励都由云函数决定。
    /// </summary>
    public void DailySignIn()
    {
        WXCloudStorageNative.DailySignIn();
        Debuger.Log("[WXCloudStorage] 已请求每日签到");
    }

    /// <summary>
    /// 消耗一个提示道具，数量由云函数权威扣减。
    /// </summary>
    public void UseHint()
    {
        if (_profile.hints <= 0)
            return;

        WXCloudStorageNative.UseHint();
    }

    /// <summary>
    /// 发放提示道具（看广告等场景）。
    /// </summary>
    public void AddHint(int amount)
    {
        if (amount <= 0)
            return;

        WXCloudStorageNative.AddHint(amount);
    }

    /// <summary>
    /// 请求全服排行榜（Top20），服务端按进度和总星数排序。
    /// </summary>
    public void LoadRankList()
    {
        WXCloudStorageNative.LoadRankList();
    }

    public void OnRankListDataLoaded(string json)
    {
        if (string.IsNullOrEmpty(json))
            return;

        try
        {
            var list = JArray.Parse(json).ToObject<List<WXRankEntry>>();
            OnRankListLoaded?.Invoke(list ?? new List<WXRankEntry>());
        }
        catch (Exception e)
        {
            Debuger.LogWarning($"[WXCloudStorage] 排行榜解析失败: {e.Message}");
        }
    }

    /// <summary>
    /// 请求刷新云端结构化档案（星级/最佳用时）。
    /// 打开选关页时调用，保证星级不是"上一次启动时的旧数据"。
    /// </summary>
    public void RefreshProfileFromCloud(bool force = false)
    {
        if (!force && Time.realtimeSinceStartup - _lastProfileRefreshAt < 3f)
            return;

        _lastProfileRefreshAt = Time.realtimeSinceStartup;
        WXCloudStorageNative.LoadProfile();
        Debuger.Log("[WXCloudStorage] 请求刷新云端档案");
    }

    /// <summary>
    /// 用本地缓存的档案 JSON 铺底（不做云端请求）。
    /// </summary>
    private void LoadCachedProfile()
    {
        string json;
        try
        {
            json = PlayerPrefsHelper.GetString(LOCAL_PROFILE_CACHE_KEY, "");
        }
        catch (Exception e)
        {
            Debuger.LogWarning($"[WXCloudStorage] 档案缓存读取失败，忽略: {e.Message}");
            return;
        }

        if (string.IsNullOrEmpty(json))
            return;

        // 缓存只是首帧铺底，不触发"签到成功"事件
        ApplyProfileJson(json, false, "local-cache");
    }

    private void SaveCachedProfile(string json)
    {
        if (string.IsNullOrEmpty(json) || json.Length > 512 * 1024)
            return;

        try
        {
            PlayerPrefsHelper.SetString(LOCAL_PROFILE_CACHE_KEY, json);
        }
        catch (Exception e)
        {
            Debuger.LogWarning($"[WXCloudStorage] 档案缓存写入失败: {e.Message}");
        }
    }

    /// <summary>
    /// JS 回调：云端档案已加载。只合并到本地缓存，不再反向写云，避免回环。
    /// </summary>
    public void OnProfileDataLoaded(string json)
    {
        ApplyProfileJson(json, true, "cloud");
    }

    private void ApplyProfileJson(string json, bool allowDailySignedEvent, string source)
    {
        if (string.IsNullOrEmpty(json))
            return;

        WXUserProfile loaded;
        try
        {
            loaded = JsonUtility.FromJson<WXUserProfile>(json);
        }
        catch (Exception e)
        {
            Debuger.LogError($"[WXCloudStorage] 档案解析失败({source}): {e.Message}");
            return;
        }

        if (loaded == null)
            return;

        string previousDailyDate = _profile.dailyDate;

        try
        {
            var root = JObject.Parse(json);
            var dailyToken = root["daily"];
            if (dailyToken != null)
            {
                var daily = dailyToken.ToObject<WXDailyData>();
                if (daily != null)
                {
                    _profile.dailyDate = daily.date;
                    _profile.dailySigned = daily.signed;
                    _profile.dailyStreak = Mathf.Max(0, daily.streak);
                    _profile.dailyReward = Mathf.Max(0, daily.reward);
                    _profile.dailyHintReward = Mathf.Max(0, daily.hintReward);
                }
            }

            var hintsToken = root["hints"];
            if (hintsToken != null && int.TryParse(hintsToken.ToString(), out int hints))
            {
                _profile.hints = Mathf.Max(0, hints);
            }

            var levelsToken = root["levels"];
            if (levelsToken != null)
            {
                var levelRecords = levelsToken.ToObject<Dictionary<string, WXLevelRecord>>();
                if (levelRecords != null)
                {
                    foreach (var pair in levelRecords)
                    {
                        if (int.TryParse(pair.Key, out int levelId) && levelId > 0)
                        {
                            MergeLocalLevelRecord(levelId, pair.Value);
                        }
                    }
                }
            }
        }
        catch (Exception e)
        {
            Debuger.LogWarning($"[WXCloudStorage] 档案扩展字段解析失败，忽略: {e.Message}");
        }

        int mergedProgress = Mathf.Max(_currentProgress, Mathf.Max(loaded.progress, _profile.progress));
        if (mergedProgress > 0 && mergedProgress != _currentProgress)
        {
            _currentProgress = mergedProgress;
            PlayerPrefsHelper.SetInteger(LOCAL_PROGRESS_KEY, _currentProgress);
            OnProgressChanged?.Invoke(_currentProgress);
        }

        _profile.progress = Mathf.Max(_currentProgress, mergedProgress);
        _profile.cloudIntValue = Mathf.Max(_currentCloudIntValue, Mathf.Max(loaded.cloudIntValue, _profile.cloudIntValue));
        _profile.coins = Mathf.Max(_profile.coins, loaded.coins);
        _profile.updatedAt = Math.Max(_profile.updatedAt, loaded.updatedAt);

        if (_profile.cloudIntValue != _currentCloudIntValue)
        {
            _currentCloudIntValue = _profile.cloudIntValue;
            PlayerPrefsHelper.SetInteger(LOCAL_CLOUD_INT_KEY, _currentCloudIntValue);
            OnCloudIntValueChanged?.Invoke(_currentCloudIntValue);
        }

        if (allowDailySignedEvent && _profile.dailySigned && !string.IsNullOrEmpty(_profile.dailyDate) && _profile.dailyDate != previousDailyDate)
        {
            OnDailySigned?.Invoke(_profile);
            Debuger.Log($"[WXCloudStorage] 签到成功: +{_profile.dailyReward} 金币，+{_profile.dailyHintReward} 提示，连续 {_profile.dailyStreak} 天");
        }

        string signature = BuildProfileSignature();
        if (signature == _profileSignature)
        {
            Debuger.Log($"[WXCloudStorage] 档案无变化({source})，跳过 UI 刷新");
            return;
        }
        _profileSignature = signature;

        // 只有内容真的变了才落盘，避免重复投递时反复写本地
        if (source == "cloud")
        {
            SaveCachedProfile(json);
        }

        OnProfileUpdated?.Invoke(_profile);
        Debuger.Log($"[WXCloudStorage] 档案已合并({source}): progress={_profile.progress}, cloudInt={_profile.cloudIntValue}, levels={_profile.levels.Count}");
    }

    private string BuildProfileSignature()
    {
        int totalStars = 0;
        long totalBestTime = 0;
        foreach (var pair in _profile.levels)
        {
            var record = pair.Value;
            if (record == null)
                continue;

            totalStars += Mathf.Clamp(record.stars, 0, 3);
            totalBestTime += Math.Max(0L, record.bestTimeMs);
        }

        return _profile.progress + "|" + _profile.cloudIntValue + "|" + _profile.coins + "|" +
               _profile.hints + "|" + _profile.dailyDate + "|" + _profile.dailySigned + "|" +
               _profile.levels.Count + "|" + totalStars + "|" + totalBestTime;
    }

    private void MergeLocalLevelRecord(int level, int stars, long timeMs, int hintsUsed)
    {
        MergeLocalLevelRecord(level, new WXLevelRecord
        {
            stars = stars,
            bestTimeMs = Math.Max(0L, timeMs),
            hintsUsed = Math.Max(0, hintsUsed),
            firstClearAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            lastClearAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        });
    }

    private void MergeLocalLevelRecord(int level, WXLevelRecord incoming)
    {
        if (incoming == null)
            return;

        string key = level.ToString();
        if (!_profile.levels.TryGetValue(key, out var current) || current == null)
        {
            current = new WXLevelRecord();
            _profile.levels[key] = current;
        }

        current.stars = Mathf.Max(current.stars, incoming.stars);
        current.bestTimeMs = current.bestTimeMs > 0 && incoming.bestTimeMs > 0
            ? Math.Min(current.bestTimeMs, incoming.bestTimeMs)
            : Math.Max(current.bestTimeMs, incoming.bestTimeMs);
        current.hintsUsed = current.hintsUsed > 0 && incoming.hintsUsed > 0
            ? Math.Min(current.hintsUsed, incoming.hintsUsed)
            : Math.Max(current.hintsUsed, incoming.hintsUsed);
        current.firstClearAt = current.firstClearAt > 0 ? current.firstClearAt : incoming.firstClearAt;
        current.lastClearAt = Math.Max(current.lastClearAt, incoming.lastClearAt);
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

    private void SaveToWXLocalCloudIntValue(int value)
    {
        WXCloudStorageNative.SetStorageSync(WX_LOCAL_CLOUD_INT_KEY, value.ToString());
        Debuger.Log($"[WXCloudStorage] 正在保存到微信本地 CloudIntValue: {value}");
    }

    private void GetFromWXLocalCloudIntValue()
    {
        WXCloudStorageNative.GetStorageSync(WX_LOCAL_CLOUD_INT_KEY);
    }

    private void SaveMergedProgress(int progress, bool syncWX)
    {
        if (progress <= 0)
            return;

        bool changed = _currentProgress != progress;
        _currentProgress = progress;

        PlayerPrefsHelper.SetInteger(LOCAL_PROGRESS_KEY, progress);
        PlayerPrefsHelper.SetDateTime(CLOUD_SYNC_TIME_KEY, DateTime.Now);

        if (syncWX)
        {
            SaveToWXLocal(progress);
        }

        Debuger.Log($"[WXCloudStorage] 当前最大进度: 第{progress}关");

        if (changed)
        {
            OnProgressChanged?.Invoke(_currentProgress);
        }
    }

    private void SaveMergedCloudIntValue(int value, bool syncWX)
    {
        value = Mathf.Max(0, value);
        bool changed = _currentCloudIntValue != value;
        _currentCloudIntValue = value;

        PlayerPrefsHelper.SetInteger(LOCAL_CLOUD_INT_KEY, value);
        PlayerPrefsHelper.SetDateTime(CLOUD_INT_SYNC_TIME_KEY, DateTime.Now);

        if (syncWX)
        {
            SaveToWXLocalCloudIntValue(value);
        }

        Debuger.Log($"[WXCloudStorage] 当前 CloudIntValue: {value}");

        if (changed)
        {
            OnCloudIntValueChanged?.Invoke(_currentCloudIntValue);
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

    public void OnCloudIntValueLocalDataLoaded(string value)
    {
        if (string.IsNullOrEmpty(value) || !int.TryParse(value, out int wxLocalValue))
        {
            return;
        }

        SaveMergedCloudIntValue(wxLocalValue, false);
        Debuger.Log($"[WXCloudStorage] 微信本地 CloudIntValue: {wxLocalValue}");
    }

    public void OnRewardedVideoAdFinished(string msg)
    {
        Debuger.Log($"[WXCloudStorage] 激励视频广告完成: {msg}");
        var callback = _rewardedVideoSuccessCallback;
        _rewardedVideoSuccessCallback = null;
        _rewardedVideoFailCallback = null;
        callback?.Invoke();
    }

    public void OnRewardedVideoAdFailed(string error)
    {
        Debuger.LogError($"[WXCloudStorage] 激励视频广告失败/未完整观看: {error}");
        var callback = _rewardedVideoFailCallback;
        _rewardedVideoSuccessCallback = null;
        _rewardedVideoFailCallback = null;
        callback?.Invoke(error);
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
