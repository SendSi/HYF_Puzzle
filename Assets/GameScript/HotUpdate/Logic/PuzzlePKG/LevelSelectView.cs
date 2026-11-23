using System;
using System.Collections.Generic;
using System.Linq;
using cfg;
using FairyGUI;
using UnityEngine;

namespace LevelFlowPKG
{
    /// <summary>
    /// LevelFlowPKG.LevelSelectView 的业务逻辑部分。
    /// 页面骨架在 FairyGUI 编辑器里，关卡卡片和缩略图在运行时动态填充。
    /// </summary>
    public partial class LevelSelectView : GComponent
    {
        private const int CardWidth = 180;
        private const int CardHeight = 88;
        private const int GapX = 20;
        private const int GapY = 12;
        private const int Columns = 6;
        private const int MaxConcurrentThumbnailLoads = 3;

        private struct ThumbnailTask
        {
            public GLoader ThumbLoader;
            public string PackageName;
            public string Url;
            public int Version;
        }

        private GButton mBackBtn;
        private GButton mSignBtn;
        private GTextField mTitleText;
        private GComponent mLevelGrid;
        private readonly List<GComponent> _cards = new List<GComponent>();
        private readonly Queue<ThumbnailTask> _thumbnailQueue = new Queue<ThumbnailTask>();
        private readonly HashSet<string> _loadedThumbnailPackages = new HashSet<string>();
        private int _activeThumbnailLoads;
        private int _refreshVersion;

        public override void OnInit()
        {
            base.OnInit();

            mBackBtn = GetChild("backBtn").asButton;
            mSignBtn = GetChild("signBtn").asButton;
            mTitleText = GetChild("titleText").asTextField;
            mLevelGrid = GetChild("levelGrid").asCom;

            mBackBtn.onClick.Set(OnClickBack);
            mSignBtn.onClick.Set(OnClickSignIn);

            WXCloudStorageManager.Instance.OnProfileUpdated += OnProfileUpdated;
            WXCloudStorageManager.Instance.OnDailySigned += OnDailySigned;
        }

        public void SetData()
        {
            // MatchHeight 下宽屏手机逻辑宽度会大于 1334，按实际宽度居中内容。
            if (mTitleText != null)
                mTitleText.SetXY((width - mTitleText.width) * 0.5f, mTitleText.y);
            if (mLevelGrid != null)
                mLevelGrid.SetXY((width - mLevelGrid.width) * 0.5f, mLevelGrid.y);

            Refresh();
        }

        private void Refresh()
        {
            _refreshVersion++;
            _thumbnailQueue.Clear();
            _activeThumbnailLoads = 0;

            foreach (var card in _cards)
            {
                card.Dispose();
            }
            _cards.Clear();
            mLevelGrid.RemoveChildren();

            var tables = CfgLubanMgr.Instance.globalTab;
            if (tables == null || tables.TbPuzzleMapConfig == null)
            {
                mTitleText.text = "选择关卡（配置未加载）";
                return;
            }

            var levels = tables.TbPuzzleMapConfig.DataList
                .Where(c => c != null && c.Task > 0)
                .OrderBy(c => c.Task)
                .ToList();

            var profile = WXCloudStorageManager.Instance.GetProfile();
            int unlocked = Mathf.Max(1, profile.progress);
            // 缩略图比可点范围多看一关：N 可点，N+1 只看图，N+2 起遮住。
            int thumbnailVisibleMax = unlocked + 1;
            int unlockedCount = levels.Count(c => c.Task <= unlocked);

            mTitleText.text = $"选择关卡    已解锁 {unlockedCount}/{levels.Count}    金币 {profile.coins}";
            mSignBtn.title = profile.dailySigned ? "今日已签到" : "每日签到";

            for (int i = 0; i < levels.Count; i++)
            {
                var cfg = levels[i];
                bool isUnlocked = cfg.Task <= unlocked;
                profile.levels.TryGetValue(cfg.Task.ToString(), out var record);

                bool showThumbnail = cfg.Task <= thumbnailVisibleMax;
                var card = CreateLevelCard(cfg.Task, isUnlocked, showThumbnail, record, out var thumbLoader);
                card.SetXY((i % Columns) * (CardWidth + GapX), (i / Columns) * (CardHeight + GapY));
                mLevelGrid.AddChild(card);
                _cards.Add(card);

                if (showThumbnail && !string.IsNullOrEmpty(cfg.UrlIcon))
                {
                    string packageName = PuzzleManager.Instance.GetPkgNameFromUrl(cfg.UrlIcon);
                    if (!string.IsNullOrEmpty(packageName))
                    {
                        _thumbnailQueue.Enqueue(new ThumbnailTask
                        {
                            ThumbLoader = thumbLoader,
                            PackageName = packageName,
                            Url = cfg.UrlIcon,
                            Version = _refreshVersion,
                        });
                    }
                }
            }

            PumpThumbnailQueue();
        }

        private void PumpThumbnailQueue()
        {
            while (_activeThumbnailLoads < MaxConcurrentThumbnailLoads && _thumbnailQueue.Count > 0)
            {
                var task = _thumbnailQueue.Dequeue();
                _activeThumbnailLoads++;
                _loadedThumbnailPackages.Add(task.PackageName);

                FGUILoader.Instance.AddPackage(task.PackageName, () =>
                {
                    try
                    {
                        if (task.Version == _refreshVersion && task.ThumbLoader != null
                            && !task.ThumbLoader.isDisposed && !string.IsNullOrEmpty(task.Url))
                        {
                            task.ThumbLoader.url = task.Url;
                            task.ThumbLoader.visible = true;
                        }
                    }
                    finally
                    {
                        if (task.ThumbLoader != null && task.ThumbLoader.isDisposed)
                        {
                            FGUILoader.Instance.RemoveUIPackage(task.PackageName);
                        }
                        _activeThumbnailLoads--;
                        PumpThumbnailQueue();
                    }
                });
            }
        }

        private static GComponent CreateLevelCard(int level, bool isUnlocked, bool showThumbnail, WXLevelRecord record, out GLoader thumbLoader)
        {
            var card = UIPackage.CreateObject("LevelFlowPKG", "LevelCard").asCom;
            card.SetSize(CardWidth, CardHeight);
            card.touchable = isUnlocked;
            card.opaque = isUnlocked;

            var bg = card.GetChild("bg").asGraph;
            bg.color = isUnlocked
                ? new Color(0.16f, 0.42f, 0.62f, 1f)
                : showThumbnail
                    ? new Color(0.28f, 0.32f, 0.40f, 1f)
                    : new Color(0.20f, 0.22f, 0.28f, 1f);

            var levelText = card.GetChild("levelText").asTextField;
            var detailText = card.GetChild("detailText").asTextField;
            thumbLoader = card.GetChild("thumbLoader").asLoader;
            thumbLoader.visible = false;

            levelText.text = isUnlocked
                ? $"第 {level} 关"
                : showThumbnail ? $"第 {level} 关  下一关" : $"第 {level} 关  未解锁";
            levelText.color = isUnlocked
                ? Color.white
                : showThumbnail ? new Color(0.82f, 0.86f, 0.92f, 1f) : new Color(0.60f, 0.62f, 0.68f, 1f);

            detailText.text = isUnlocked
                ? (record == null ? "需完成" : $"{StarsText(record.stars)}  {FormatTime(record.bestTimeMs)}")
                : showThumbnail ? "完成上一关" : "完成上一关解锁";

            if (isUnlocked)
            {
                int targetLevel = level;
                card.onClick.Set(() => OnClickLevel(targetLevel));
            }

            return card;
        }

        private static string StarsText(int stars)
        {
            int value = Mathf.Clamp(stars, 0, 3);
            return new string('★', value) + new string('☆', 3 - value);
        }

        private static string FormatTime(long milliseconds)
        {
            if (milliseconds <= 0)
                return "--:--";

            var span = TimeSpan.FromMilliseconds(milliseconds);
            if (span.TotalMinutes >= 1)
                return $"{(int)span.TotalMinutes}:{span.Seconds:00}";

            return $"{span.Seconds}.{span.Milliseconds / 100}s";
        }

        private static void OnClickLevel(int level)
        {
            ProxyPuzzlePKGModule.Instance.CloseLevelSelectView();
            ProxyPuzzlePKGModule.Instance.OpenPuzzleMainView(level);
        }

        private void OnClickBack()
        {
            ProxyPuzzlePKGModule.Instance.CloseLevelSelectView();
        }

        private void OnClickSignIn()
        {
            var profile = WXCloudStorageManager.Instance.GetProfile();
            if (profile.dailySigned)
            {
                ProxyCommonPKGModule.Instance.AddToastStr("今日已签到，明天再来");
                return;
            }

            WXCloudStorageManager.Instance.DailySignIn();
        }

        private void OnDailySigned(WXUserProfile profile)
        {
            ProxyCommonPKGModule.Instance.AddToastStr($"签到成功，+{profile.dailyReward} 金币，+{profile.dailyHintReward} 提示");
            Refresh();
        }

        private void OnProfileUpdated(WXUserProfile profile)
        {
            Refresh();
        }

        public override void Dispose()
        {
            WXCloudStorageManager.Instance.OnProfileUpdated -= OnProfileUpdated;
            WXCloudStorageManager.Instance.OnDailySigned -= OnDailySigned;

            _refreshVersion++;
            _thumbnailQueue.Clear();
            foreach (var packageName in _loadedThumbnailPackages)
            {
                FGUILoader.Instance.RemoveUIPackage(packageName);
            }
            _loadedThumbnailPackages.Clear();

            base.Dispose();
        }
    }
}
