using PuzzlePKG;
using System;

public class ProxyPuzzlePKGModule : Singleton<ProxyPuzzlePKGModule>, IProxy
{
    private const string pkgName = "PuzzlePKG";

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
}
