using System;
using System.Collections.Generic;
using FairyGUI;
using SocialPKG;
using UnityEngine;

public class ProxySocialPKGModule : Singleton<ProxySocialPKGModule>, IProxy
{
    private const string pkgName = "SocialPKG";

    public void CheckLoad(Action finishCB)
    {
        FGUILoader.Instance.AddPackage(pkgName, finishCB);
    }

    public void OpenRankView()
    {
        CheckLoad(() =>
        {
            var view = UIMgr.Instance.OpenUIViewCom<RankView>(pkgName);
            view.SetData();
        });
    }

    public void CloseRankView()
    {
        UIMgr.Instance.CloseUIViewCom<RankView>();
    }

    public void OpenAchieveView()
    {
        CheckLoad(() =>
        {
            var view = UIMgr.Instance.OpenUIViewCom<AchieveView>(pkgName);
            view.SetData();
        });
    }

    public void CloseAchieveView()
    {
        UIMgr.Instance.CloseUIViewCom<AchieveView>();
    }

    public void OpenProfileView()
    {
        CheckLoad(() =>
        {
            var view = UIMgr.Instance.OpenUIViewCom<ProfileView>(pkgName);
            view.SetData();
        });
    }

    public void CloseProfileView()
    {
        UIMgr.Instance.CloseUIViewCom<ProfileView>();
    }
}

namespace SocialPKG
{
    public partial class RankView : GComponent
    {
        private GButton mCloseBtn;
        private GTextField mTipText;
        private GComponent mRankList;

        public override void OnInit()
        {
            base.OnInit();
            mCloseBtn = GetChild("closeBtn").asButton;
            mTipText = GetChild("tipText").asTextField;
            mRankList = GetChild("rankList").asCom;
            mCloseBtn.onClick.Set(OnClickClose);
            WXCloudStorageManager.Instance.OnRankListLoaded += OnRankListLoaded;
        }

        public void SetData()
        {
            if (mTipText != null)
                mTipText.SetXY((width - mTipText.width) * 0.5f, mTipText.y);
            if (mRankList != null)
                mRankList.SetXY((width - mRankList.width) * 0.5f, mRankList.y);

            mTipText.text = "排行榜加载中...";
            mRankList.RemoveChildren();
            WXCloudStorageManager.Instance.LoadRankList();
        }

        private void OnRankListLoaded(List<WXRankEntry> list)
        {
            mRankList.RemoveChildren();

            if (list == null || list.Count <= 0)
            {
                mTipText.text = "暂无排行榜数据，完成几关再来吧";
                return;
            }

            mTipText.text = "按解锁进度与总星数排名";
            for (int i = 0; i < list.Count; i++)
            {
                var entry = list[i];
                var row = UIPackage.CreateObject("SocialPKG", "RankRow").asCom;
                row.SetXY(0, i * 62);
                row.GetChild("rankText").asTextField.text = entry.rank.ToString();
                row.GetChild("nameText").asTextField.text = entry.isSelf ? $"{entry.name}（我）" : entry.name;
                row.GetChild("progressText").asTextField.text = $"进度 {entry.progress}";
                row.GetChild("starText").asTextField.text = $"★ {entry.totalStars}";
                if (entry.isSelf)
                {
                    row.GetChild("bg").asGraph.color = new Color(0.20f, 0.50f, 0.36f, 1f);
                }
                mRankList.AddChild(row);
            }
        }

        private void OnClickClose()
        {
            ProxySocialPKGModule.Instance.CloseRankView();
        }

        public override void Dispose()
        {
            WXCloudStorageManager.Instance.OnRankListLoaded -= OnRankListLoaded;
            base.Dispose();
        }
    }

    public partial class AchieveView : GComponent
    {
        private class AchievementItem
        {
            public string Name;
            public string Desc;
            public bool Unlocked;
        }

        private GButton mCloseBtn;
        private GComponent mAchieveList;

        public override void OnInit()
        {
            base.OnInit();
            mCloseBtn = GetChild("closeBtn").asButton;
            mAchieveList = GetChild("achieveList").asCom;
            mCloseBtn.onClick.Set(OnClickClose);
            WXCloudStorageManager.Instance.OnProfileUpdated += OnProfileUpdated;
        }

        public void SetData()
        {
            if (mAchieveList != null)
                mAchieveList.SetXY((width - mAchieveList.width) * 0.5f, mAchieveList.y);

            Refresh();
        }

        private void Refresh()
        {
            mAchieveList.RemoveChildren();

            var profile = WXCloudStorageManager.Instance.GetProfile();
            int unlockedLevels = 0;
            int totalStars = 0;
            int threeStarLevels = 0;

            foreach (var pair in profile.levels)
            {
                if (pair.Value == null)
                    continue;

                unlockedLevels++;
                totalStars += Mathf.Clamp(pair.Value.stars, 0, 3);
                if (pair.Value.stars >= 3)
                    threeStarLevels++;
            }

            var items = new List<AchievementItem>
            {
                new AchievementItem { Name = "初次拼合", Desc = "完成第 1 关", Unlocked = profile.levels.ContainsKey("1") },
                new AchievementItem { Name = "拼图达人", Desc = "完成 10 个关卡", Unlocked = unlockedLevels >= 10 },
                new AchievementItem { Name = "完美主义", Desc = "10 个关卡拿到 3 星", Unlocked = threeStarLevels >= 10 },
                new AchievementItem { Name = "签到达人", Desc = "连续签到 3 天", Unlocked = profile.dailyStreak >= 3 },
                new AchievementItem { Name = "星星收藏家", Desc = "累计获得 30 颗星", Unlocked = totalStars >= 30 },
                new AchievementItem { Name = "小富翁", Desc = "拥有 100 金币", Unlocked = profile.coins >= 100 },
            };

            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                var row = UIPackage.CreateObject("SocialPKG", "AchieveRow").asCom;
                row.SetXY(0, i * 72);
                row.GetChild("nameText").asTextField.text = item.Name;
                row.GetChild("descText").asTextField.text = item.Desc;
                row.GetChild("stateText").asTextField.text = item.Unlocked ? "已完成" : "未完成";
                row.GetChild("stateText").asTextField.color = item.Unlocked
                    ? new Color(0.45f, 1f, 0.55f, 1f)
                    : new Color(0.62f, 0.66f, 0.74f, 1f);
                mAchieveList.AddChild(row);
            }
        }

        private void OnProfileUpdated(WXUserProfile profile)
        {
            Refresh();
        }

        private void OnClickClose()
        {
            ProxySocialPKGModule.Instance.CloseAchieveView();
        }

        public override void Dispose()
        {
            WXCloudStorageManager.Instance.OnProfileUpdated -= OnProfileUpdated;
            base.Dispose();
        }
    }

    public partial class ProfileView : GComponent
    {
        private GGraph mPanel;
        private GTextField mStatsText;
        private GButton mRankBtn;
        private GButton mAchieveBtn;
        private GButton mSignBtn;
        private GButton mCloseBtn;

        public override void OnInit()
        {
            base.OnInit();
            mPanel = GetChild("panel").asGraph;
            mStatsText = GetChild("statsText").asTextField;
            mRankBtn = GetChild("rankBtn").asButton;
            mAchieveBtn = GetChild("achieveBtn").asButton;
            mSignBtn = GetChild("signBtn").asButton;
            mCloseBtn = GetChild("closeBtn").asButton;

            mRankBtn.onClick.Set(OnClickRank);
            mAchieveBtn.onClick.Set(OnClickAchieve);
            mSignBtn.onClick.Set(OnClickSignIn);
            mCloseBtn.onClick.Set(OnClickClose);

            WXCloudStorageManager.Instance.OnProfileUpdated += OnProfileUpdated;
        }

        public void SetData()
        {
            if (mPanel != null)
            {
                float dx = (mPanel.x + mPanel.width * 0.5f) - 667f;
                mRankBtn.x += dx;
                mAchieveBtn.x += dx;
                mSignBtn.x += dx;
                mCloseBtn.x += dx;
            }

            Refresh();
        }

        private void Refresh()
        {
            var profile = WXCloudStorageManager.Instance.GetProfile();
            int unlockedLevels = 0;
            int totalStars = 0;

            foreach (var pair in profile.levels)
            {
                if (pair.Value == null)
                    continue;

                unlockedLevels++;
                totalStars += Mathf.Clamp(pair.Value.stars, 0, 3);
            }

            mStatsText.text =
                $"当前进度：第 {Mathf.Max(1, profile.progress)} 关\n" +
                $"已通关：{unlockedLevels} 关\n" +
                $"累计星星：{totalStars}\n" +
                $"金币：{profile.coins}    提示：{profile.hints}\n" +
                $"连续签到：{profile.dailyStreak} 天";

            mSignBtn.title = profile.dailySigned ? "今日已签到" : "每日签到";
        }

        private void OnProfileUpdated(WXUserProfile profile)
        {
            Refresh();
        }

        private void OnClickRank()
        {
            ProxySocialPKGModule.Instance.CloseProfileView();
            ProxySocialPKGModule.Instance.OpenRankView();
        }

        private void OnClickAchieve()
        {
            ProxySocialPKGModule.Instance.CloseProfileView();
            ProxySocialPKGModule.Instance.OpenAchieveView();
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

        private void OnClickClose()
        {
            ProxySocialPKGModule.Instance.CloseProfileView();
        }

        public override void Dispose()
        {
            WXCloudStorageManager.Instance.OnProfileUpdated -= OnProfileUpdated;
            base.Dispose();
        }
    }
}
