using System;
using FairyGUI;
using UnityEngine;

namespace LevelFlowPKG
{
    /// <summary>
    /// 结算页展示的数据。UnlockedLevel 是上报后云端推进到的下一关。
    /// </summary>
    public class LevelClearResultData
    {
        public int Level;
        public int Stars;
        public long ElapsedMs;
        public int HintsUsed;
        public int UnlockedLevel;
    }

    /// <summary>
    /// LevelFlowPKG.ResultView 的业务逻辑部分。
    /// </summary>
    public partial class ResultView : GComponent
    {
        private LevelClearResultData _data;
        private GButton mNextBtn;
        private GButton mReplayBtn;
        private GButton mBackBtn;
        private GTextField mDetailText;
        private GTextField mHintText;

        public override void OnInit()
        {
            base.OnInit();

            mNextBtn = GetChild("nextBtn").asButton;
            mReplayBtn = GetChild("replayBtn").asButton;
            mBackBtn = GetChild("backBtn").asButton;
            mDetailText = GetChild("detailText").asTextField;
            mHintText = GetChild("hintText").asTextField;

            mNextBtn.onClick.Set(OnClickNext);
            mReplayBtn.onClick.Set(OnClickReplay);
            mBackBtn.onClick.Set(OnClickBackToSelect);
        }

        public void SetData(LevelClearResultData data)
        {
            _data = data ?? new LevelClearResultData();
            mDetailText.text = $"第 {_data.Level} 关   {StarsText(_data.Stars)}\n用时：{FormatTime(_data.ElapsedMs)}    提示：{_data.HintsUsed} 次";
            mHintText.text = _data.UnlockedLevel > _data.Level
                ? $"已解锁第 {_data.UnlockedLevel} 关"
                : "已通关当前关卡";

            int maxLevel = GetMaxLevel();
            mNextBtn.enabled = !(maxLevel > 0 && _data.UnlockedLevel > maxLevel);
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

        private static int GetMaxLevel()
        {
            var tables = CfgLubanMgr.Instance.globalTab;
            return tables == null || tables.TbPuzzleMapConfig == null
                ? 0
                : tables.TbPuzzleMapConfig.DataList.Count;
        }

        private static void CloseSelfAndPuzzle()
        {
            ProxyPuzzlePKGModule.Instance.CloseResultView();
            ProxyPuzzlePKGModule.Instance.ClosePuzzleMainView();
        }

        private void OnClickNext()
        {
            int nextLevel = Mathf.Max(1, _data == null ? 1 : _data.UnlockedLevel);
            int maxLevel = GetMaxLevel();

            if (maxLevel > 0 && nextLevel > maxLevel)
            {
                ProxyCommonPKGModule.Instance.AddToastStr("已经全部通关啦");
                CloseSelfAndPuzzle();
                ProxyPuzzlePKGModule.Instance.OpenLevelSelectView();
                return;
            }

            CloseSelfAndPuzzle();
            ProxyPuzzlePKGModule.Instance.OpenPuzzleMainView(nextLevel);
        }

        private void OnClickReplay()
        {
            int level = Mathf.Max(1, _data == null ? 1 : _data.Level);
            CloseSelfAndPuzzle();
            ProxyPuzzlePKGModule.Instance.OpenPuzzleMainView(level);
        }

        private void OnClickBackToSelect()
        {
            CloseSelfAndPuzzle();
            ProxyPuzzlePKGModule.Instance.OpenLevelSelectView();
        }
    }
}
