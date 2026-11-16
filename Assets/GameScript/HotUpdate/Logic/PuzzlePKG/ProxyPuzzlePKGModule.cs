using PuzzlePKG;
using LevelFlowPKG;
using System;

public class ProxyPuzzlePKGModule : Singleton<ProxyPuzzlePKGModule>, IProxy
{
    private const string pkgName = "PuzzlePKG";
    private const string flowPkgName = "LevelFlowPKG";

    public void CheckLoad(Action finishCB)
    {
        FGUILoader.Instance.AddPackage(pkgName, finishCB);
    }

    public void OpenPuzzleMainView(int level = 1)
    {
        CheckLoad(() =>
        {
            var targetView = UIMgr.Instance.OpenUIViewCom<PuzzleMainView>(pkgName);
            targetView.SetData(level);
        });
    }
    public void ClosePuzzleMainView()
    {
        UIMgr.Instance.CloseUIViewCom<PuzzleMainView>();
    }

    public void OpenLevelSelectView()
    {
        FGUILoader.Instance.AddPackage(flowPkgName, () =>
        {
            var view = UIMgr.Instance.OpenUIViewCom<LevelSelectView>(flowPkgName);
            view.SetData();
        });
    }

    public void CloseLevelSelectView()
    {
        UIMgr.Instance.CloseUIViewCom<LevelSelectView>();
    }

    public void OpenResultView(LevelClearResultData data)
    {
        FGUILoader.Instance.AddPackage(flowPkgName, () =>
        {
            var view = UIMgr.Instance.OpenUIViewCom<ResultView>(flowPkgName);
            view.SetData(data);
        });
    }

    public void CloseResultView()
    {
        UIMgr.Instance.CloseUIViewCom<ResultView>();
    }
}
