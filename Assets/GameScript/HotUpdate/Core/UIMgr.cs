using FairyGUI;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

public class UIMgr : Singleton<UIMgr>
{
    protected override void OnInit()
    {
        base.OnInit();
    }

    /// <summary> key-viewNameStr,,,,value-GComponent </summary>
    private Dictionary<string, GComponent> mShoGCompDic = new Dictionary<string, GComponent>();

    public T1 OpenUIViewCom<T1>(string pkgName) where T1 : GComponent, new()
    {
        string viewName = (typeof(T1).Name);
        GComponent gCom = UIPackage.CreateObject(pkgName, viewName).asCom;
        gCom.MakeFullScreen();
        GRoot.inst.AddChild(gCom);
        gCom.AddRelation(GRoot.inst, RelationType.Size);
        gCom.fairyBatching = true;
        gCom.OnInit(); //继承方法 onClick itemRenderer *** 在此声明呗
        // gCom.name = $"{pkgName}_{viewName}"; //页面名字   指引有用
        gCom.name = $"{gCom.gameObjectName}"; //页面名字   指引有用

        mShoGCompDic[viewName] = gCom;
        return gCom as T1;
    }

    /// <summary>
    /// 打开纯代码构建的页面（不依赖 FairyGUI 包组件）。
    /// </summary>
    public T1 OpenCodeUIView<T1>() where T1 : GComponent, new()
    {
        string viewName = typeof(T1).Name;
        T1 view = new T1();
        view.MakeFullScreen();
        GRoot.inst.AddChild(view);
        view.AddRelation(GRoot.inst, RelationType.Size);
        view.fairyBatching = true;
        view.name = viewName;
        view.OnInit();
        mShoGCompDic[viewName] = view;
        return view;
    }

    /// <summary>
    /// 关闭纯代码构建的页面。代码页面没有 packageItem，不能走 CheckRemovePackage。
    /// </summary>
    public void CloseCodeUIView<T1>() where T1 : GComponent
    {
        string viewName = typeof(T1).Name;
        if (mShoGCompDic.TryGetValue(viewName, out var view))
        {
            mShoGCompDic.Remove(viewName);
            view.Dispose();
        }
    }

    /// <summary>关闭页面..传入具体页面类 </summary>
    public void CloseUIViewCom<T1>() where T1 : GComponent
    {
        var viewName = (typeof(T1).Name);
        GComponent gCom = null;
        if (mShoGCompDic.TryGetValue(viewName, out gCom))
        {
            gCom.Dispose();
            mShoGCompDic.Remove(viewName);

            if (gCom.packageItem != null && gCom.packageItem.owner != null)
            {
                CheckRemovePackage(gCom.packageItem.owner.name); //关闭页面 检测 移除 业务包
            }
        }
    }

    /// <summary>获取页面..传入string的ViewName </summary>
    public GComponent GetUIViewCom<T1>() where T1 : GComponent
    {
        var viewName = (typeof(T1).Name);
        GComponent tViewCls = null;
        if (mShoGCompDic.TryGetValue(viewName, out tViewCls))
        {
            return tViewCls;
        }

        return null;
    }
    
    /// <summary> UIView 反过来 显示显隐 </summary>
    /// <returns>true加载着</returns>
    public  bool SetUIViewActiveReverse<T>() where  T:GComponent
    {
        var viewName = (typeof(T).Name);

        if (mShoGCompDic.TryGetValue(viewName, out var tViewCls))
        {
             tViewCls.visible=! tViewCls.visible;
             return true;
        }
        return false;
    }


    /// <summary>隐藏已显示的页面..传入具体页面类 </summary>
    public void HideUIViewCom<T1>() where T1 : GComponent
    {
        var viewName = (typeof(T1).Name);
        GComponent tViewCls = null;
        if (mShoGCompDic.TryGetValue(viewName, out tViewCls))
        {
            tViewCls.visible = false;
        }
    }


    /// <summary>显示已隐藏的页面..传入具体页面类  </summary>
    public GComponent ShowUIViewCom<T1>() where T1 : GComponent
    {
        var viewName = (typeof(T1).Name);
        if (mShoGCompDic.TryGetValue(viewName, out var tViewCls))
        {
            tViewCls.visible = true;
            return tViewCls;
        }

        return null;
    }

    /// <summary> 检测移除Package </summary>
    public void CheckRemovePackage(string pkgName)
    {
        var isNeedGCom = true;
        foreach (var item in mShoGCompDic)
        {
            if (item.Value.packageItem != null && item.Value.packageItem.owner != null && item.Value.packageItem.owner.name == pkgName)
            {
                isNeedGCom = false; //其他页面还有引用
                return;
            }
        }

        if (isNeedGCom == true)
        {
            foreach (var item in mShowWinDic)
            {
                if (item.Value.contentPane != null && item.Value.contentPane.packageItem != null
                    && item.Value.contentPane.packageItem.owner != null
                    && item.Value.contentPane.packageItem.owner.name == pkgName)
                {
                    isNeedGCom = false; //其他Win还有引用
                    return;
                }
            }
        }


        if (isNeedGCom)
        {
            FGUILoader.Instance.RemoveUIPackage(pkgName);
        }
    }


    private Dictionary<string, Window> mShowWinDic = new Dictionary<string, Window>();

    public T1 OpenWindow<T1>() where T1 : Window, new()
    {
        var winName = (typeof(T1).Name);
        T1 t1 = new T1();
        t1.Show();
        mShowWinDic[winName] = t1;
        t1.name = $"{t1.gameObjectName}"; //页面名字   指引有用
        t1.contentPane.name = "contentPane";
        return t1 as T1;
    }

    public void CloseWindow<T1>() where T1 : Window
    {
        var viewName = (typeof(T1).Name);
        Window gWindow = null;
        if (mShowWinDic.TryGetValue(viewName, out gWindow))
        {
            gWindow.Dispose();
            mShowWinDic.Remove(viewName);

            CheckRemovePackage(gWindow.contentPane.packageItem.owner.name); //关闭页面 检测 移除 业务包
        }
    }

    public void CloseWindowExpand(Window gWindow)
    {
        for (int i = 0; i < mShowWinDic.Count; i++)
        {
            var item = mShowWinDic.ElementAt(i);
            if (item.Value == gWindow)
            {
                gWindow.Dispose();
                mShowWinDic.Remove(item.Key);

                CheckRemovePackage(gWindow.contentPane.packageItem.owner.name); //关闭页面 检测 移除 业务包
                return;
            }
        }
    }

    public void HideWindow<T1>() where T1 : Window
    {
        var viewName = (typeof(T1).Name);
        Window gWindow = null;
        if (mShowWinDic.TryGetValue(viewName, out gWindow))
        {
            gWindow.Hide();
        }
    }

    public T1 ShowWindow<T1>() where T1 : Window
    {
        var viewName = (typeof(T1).Name);
        Window gWindow = null;
        if (mShowWinDic.TryGetValue(viewName, out gWindow))
        {
            gWindow.Show();
            return gWindow as T1;
        }

        return null;
    }
}