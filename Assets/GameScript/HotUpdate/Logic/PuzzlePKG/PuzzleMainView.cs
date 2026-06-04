using FairyGUI;
using System.Collections.Generic;
using cfg;
using UnityEngine;

namespace PuzzlePKG
{
    // public enum 
    
    
    public partial class PuzzleMainView : GComponent
    {
        private List<PuzzleConfig> mPuzzleList;
        private int itemCellValue = 170; //每个格子的大小

        public override void OnInit()
        {
            EventCenter.Instance.Fire<int>((int)EventEnumAOT.EE_NumOfCircleToShow,3);

            base.OnInit();
            this._closeButton.onClick.Set(OnClickCloseBtn);
            this._finishBtn.onClick.Set(OnClickFinishBtnGM);
            this._nextBtn.onClick.Set(OnClickNextBtn);
      
            var maxX = _bg.x - itemCellValue;
            var maxY = _bg.y - itemCellValue;

            // 检查配置表是否已初始化（WebGL平台是异步加载）
            if (CfgLubanMgr.Instance.globalTab == null)
            {
                Debug.LogError("配置表未初始化，请确保 CfgLubanMgr.InitAsync() 已完成");
                return;
            }

            mPuzzleList = CfgLubanMgr.Instance.globalTab.TbPuzzleConfig.DataList;
            mPuzzleList = OtherUtils.Instance.GetRandomList(mPuzzleList); //打乱排序
            this._yesTxt.text = $"已完成:0/{mPuzzleList.Count}";
            foreach (var item in mPuzzleList)
            {
                var btnGo = GetChild(item.Id.ToString());
                var btnGo_icon = GetChildByPath($"{item.Id}.icon");
                btnGo_icon.size = new Vector2(1020, 680); //固定尺寸
                btnGo_icon.SetXY(item.IconPos.Xx, item.IconPos.Yy);

                btnGo_icon.data = new Vector2Int(item.CellPos.Xx, item.CellPos.Yy); //结果值在  icon里的data
                btnGo.data = new Vector2Int(-1, -1); //初始值

                //x 1130 maxX             //y95 maxY
                var xyRandom = new Vector2(Random.Range(1130, maxX), Random.Range(20, maxY));
                btnGo.xy = xyRandom;
                if (Random.Range(1, 6) == 3) btnGo.parent.SetChildIndex(btnGo, btnGo.parent.numChildren - 1); //打乱一下

                btnGo.draggable = true;
                btnGo.onDragStart.Add((EventContext context) => { btnGo.parent.SetChildIndex(btnGo, btnGo.parent.numChildren - 1); }); //最外层
                btnGo.onDragEnd.Add((EventContext context) =>
                {
                    int xCell = (int)(btnGo.x / itemCellValue);
                    int yCell = (int)(btnGo.y / itemCellValue);

                    if (btnGo.x < -120) xCell = -1;
                    if (btnGo.y < -110) yCell = -1;

                    btnGo.data = new Vector2Int(xCell, yCell); //拖动结束 设置值
                    if (xCell < 0 || xCell >= 6 || yCell >= 4 || yCell < 0)
                    {
                    }
                    else
                    {
                        //4行  6列
                        btnGo.SetXY(50 + itemCellValue * xCell, 60 + itemCellValue * yCell);
                    }

                    // 每次拖放后都更新进度显示
                    UpdateProgressText();

                    if (btnGo_icon.data.Equals(btnGo.data))
                    {
                        // 放对了，播放正确音效
                        PlayFairyGUISound("com_03");
                        CheckGameIsFinish();
                    }
                    else
                    {
                        // 放错了，播放错误音效并抖动反馈
                        PlayFairyGUISound("com_07");
                        PlayShakeAnimation(btnGo);
                    }
                });
            }
        }

        private void OnClickFinishBtnGM()
        {
            Timers.inst.StartCoroutine(AutoFinishPuzzle());
        }

        private void OnClickNextBtn()
        {
            // 收集所有未正确放置的拼图块
            var notPlacedList = new List<GObject>();
            foreach (var item in mPuzzleList)
            {
                var btnGo = GetChild(item.Id.ToString());
                var btnGo_icon = GetChildByPath($"{item.Id}.icon");
                if (!btnGo.data.Equals(btnGo_icon.data))
                {
                    notPlacedList.Add(btnGo);
                }
            }

            if (notPlacedList.Count == 0)
                return;

            // 优先级1: 目标位置没有被任何拼图块占用的
            var priority1List = new List<GObject>();
            foreach (var btnGo in notPlacedList)
            {
                var iconData = (Vector2Int)GetChildByPath($"{btnGo.name}.icon").data;
                bool occupied = false;
                foreach (var item in mPuzzleList)
                {
                    var other = GetChild(item.Id.ToString());
                    if (other.name != btnGo.name && other.data.Equals(iconData))
                    {
                        occupied = true;
                        break;
                    }
                }
                if (!occupied)
                    priority1List.Add(btnGo);
            }

            GObject selected;
            if (priority1List.Count > 0)
            {
                selected = priority1List[Random.Range(0, priority1List.Count)];
            }
            else
            {
                // 优先级2: 已放在地图格子内但位置不对的
                var onGridWrongList = new List<GObject>();
                foreach (var btnGo in notPlacedList)
                {
                    var data = (Vector2Int)btnGo.data;
                    if (data.x >= 0 && data.x < 6 && data.y >= 0 && data.y < 4)
                        onGridWrongList.Add(btnGo);
                }

                selected = onGridWrongList.Count > 0
                    ? onGridWrongList[Random.Range(0, onGridWrongList.Count)]
                    : notPlacedList[Random.Range(0, notPlacedList.Count)];
            }

            // 移动到正确位置（使用 Tween 动画）
            var selectedIcon = GetChildByPath($"{selected.name}.icon");
            var targetPos = (Vector2Int)selectedIcon.data;
            selected.data = targetPos;
            
            // 使用 GTween 动画移动到正确位置
            float targetX = 50 + itemCellValue * targetPos.x;
            float targetY = 60 + itemCellValue * targetPos.y;
            
            GTween.To(selected.xy, new Vector2(targetX, targetY), 0.3f)
                .SetTarget(selected)
                .OnUpdate((tweener) => { selected.xy = tweener.value.vec2; })
                .OnComplete(() =>
                {
                    // 动画完成后更新进度和检查完成状态
                    UpdateProgressText();
                    CheckGameIsFinish();
                });
        }

        private IEnumerator<object> AutoFinishPuzzle()
        {
            int completedCount = 0;
            this._finishBtn.enabled = false;

            foreach (var item in mPuzzleList)
            {
                var btnGo = GetChild(item.Id.ToString());
                var btnGo_icon = GetChildByPath($"{item.Id}.icon");

                // 获取正确的目标位置
                Vector2Int targetPos = (Vector2Int)btnGo_icon.data;

                if (!btnGo.data.Equals(btnGo_icon.data))
                {
                    // 设置当前数据为目标位置
                    btnGo.data = targetPos;

                    // 移动到正确的位置
                    if (targetPos.x >= 0 && targetPos.x < 6 && targetPos.y >= 0 && targetPos.y < 4)
                    {
                        float targetX = 50 + itemCellValue * targetPos.x;
                        float targetY = 60 + itemCellValue * targetPos.y;

                        // 使用 Tween 动画移动
                        GTween.To(btnGo.xy, new Vector2(targetX, targetY), 0.2f)
                            .SetTarget(btnGo)
                            .OnUpdate((tweener) => { btnGo.xy = tweener.value.vec2; });

                        yield return new WaitForSeconds(0.05f);
                    }
                }

                // 更新完成计数
                completedCount++;
                this._yesTxt.text = $"已完成:{completedCount}/{mPuzzleList.Count}";

                yield return new WaitForSeconds(0.05f);
            }

            // 最终检查是否完成
            CheckGameIsFinish();
            this._finishBtn.enabled = true;

            yield break;
        }

        private void PlayFairyGUISound(string soundName)
        {
            // FairyGUI 音效格式：ui://包名/资源名
            // 尝试从当前包获取音效
            NAudioClip audioClip = UIPackage.GetItemAssetByURL($"ui://{this.packageItem.owner.name}/{soundName}") as NAudioClip;
            if (audioClip == null)
            {
                // 如果没找到，尝试直接从默认包获取
                audioClip = UIPackage.GetItemAssetByURL($"ui://CommonPKG/{soundName}") as NAudioClip;
            }
            if (audioClip != null && audioClip.nativeClip != null)
            {
                Stage.inst.PlayOneShotSound(audioClip.nativeClip, 1f);
            }
        }

        private void PlayShakeAnimation(GObject target)
        {
            float originalX = target.x;
            float shakeAmount = 8f; // 抖动幅度
            
            // 创建一个抖动序列
            GTween.To(target.x, originalX + shakeAmount, 0.05f)
                .SetTarget(target)
                .OnUpdate((tweener) => { target.x = tweener.value.x; })
                .OnComplete(() =>
                {
                    GTween.To(target.x, originalX - shakeAmount, 0.05f)
                        .SetTarget(target)
                        .OnUpdate((tweener) => { target.x = tweener.value.x; })
                        .OnComplete(() =>
                        {
                            GTween.To(target.x, originalX + shakeAmount, 0.05f)
                                .SetTarget(target)
                                .OnUpdate((tweener) => { target.x = tweener.value.x; })
                                .OnComplete(() =>
                                {
                                    GTween.To(target.x, originalX, 0.05f)
                                        .SetTarget(target)
                                        .OnUpdate((tweener) => { target.x = tweener.value.x; });
                                });
                        });
                });
        }

        private void UpdateProgressText()
        {
            int completedCount = 0;
            foreach (var item in mPuzzleList)
            {
                var btnGo = GetChild(item.Id.ToString());
                var btnGo_icon = GetChildByPath($"{item.Id}.icon");
                if (btnGo.data.Equals(btnGo_icon.data))
                {
                    completedCount++;
                }
            }
            this._yesTxt.text = $"已完成:{completedCount}/{mPuzzleList.Count}";
        }

        private void CheckGameIsFinish()
        {
            var index = 0;
            foreach (var item in mPuzzleList)
            {
                var btnGo = GetChild(item.Id.ToString());
                var btnGo_icon = GetChildByPath($"{item.Id}.icon");
                if (btnGo.data.Equals(btnGo_icon.data))
                {
                    index++;
                }
            }

            // 同步更新进度显示
            this._yesTxt.text = $"已完成:{index}/{mPuzzleList.Count}";

            if (index == 3)
            {
                ProxyCommonPKGModule.Instance.AddToastStr("你已拼了三个啦,加油~~");
            }
            else if (index >= 24)
            {
                Debug.LogError("拼图 完成了");
                ProxyCommonPKGModule.Instance.AddToastStr("拼图完成了");
                // ProxyDialogTipModule.Instance.OpenDialogTip1ViewWin("恭喜", "拼图完成了", "确定", null);
            }

            Debug.Log($"拼了 {index} 块了");
        }

        private void OnClickCloseBtn()
        {
            ProxyPuzzlePKGModule.Instance.ClosePuzzleMainView();
        }

        public void SetData(string obj)
        {
        }

        public override void Dispose()
        {
            base.Dispose();
            EventCenter.Instance.Fire<int>((int)EventEnumAOT.EE_NumOfCircleToShow,2);
        }
    }
}