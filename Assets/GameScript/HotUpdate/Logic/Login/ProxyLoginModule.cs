using System;
using Login;

public class ProxyLoginModule : Singleton<ProxyLoginModule>,IProxy
{
    private const string pkgName = "Login";
    public void CheckLoad(Action finishCB)
    {
        FGUILoader.Instance.AddPackage(pkgName, finishCB);
    }


    public void OpenLoginMainView()
    {
        CheckLoad(() =>
        {
            var targetView = UIMgr.Instance.OpenUIViewCom<LoginMainView>(pkgName);
            targetView.SetData("v1.0.0");
        });
    }

    public void CloseLoginMainView()
    {
        UIMgr.Instance.CloseUIViewCom<LoginMainView>();
    }

    #region GameAgeView打开关闭Window

    public void OpenGameAgeViewWin()
    {
        CheckLoad(() => { UIMgr.Instance.OpenWindow<GameAgeViewWin>(); });
    }

    public void CloseGameAgeViewWin()
    {
        UIMgr.Instance.CloseWindow<GameAgeViewWin>();
    }

    #endregion



  

}
