using Cysharp.Threading.Tasks;

//反射调用
public class HotFixReflex
{
    //反射调用
    public static void Run()
    {
        Debuger.LogWarning("HotFixReflex-->Run");
        //var gameMain = GameObject.Find("GameMain");//Find元素
        // if (gameMain != null) { gameMain.AddComponent<SafeAreaUtils>(); }
        
        LanguageUtils.Instance.Begin();//时序有要求
        
        ProxyLoginModule.Instance.OpenLoginMainView();//时序有要求
        
        // 只绑定不需要配置表的管理器（GMManager需要配置表，延迟初始化）
        LoginManager.Instance.ListenLogin();

#if UNITY_WEBGL
        // WebGL平台使用异步初始化（配置表必须先加载，其他管理器依赖它）
        InitAsync().Forget();
#else
        // 非WebGL平台：CfgLubanMgr.OnInit 已经同步初始化了配置表，直接初始化其他管理器
        InitOtherManagers();
#endif
    }

#if UNITY_WEBGL
    private static async UniTask InitAsync()
    {
        Debuger.Log("WebGL平台：异步初始化配置表...");
        
        // 先异步加载所有配置表（必须先完成，因为其他管理器依赖配置表）
        await CfgLubanMgr.Instance.InitAsync();
        
        Debuger.Log("WebGL平台：配置表加载完成，初始化其他管理器...");
        
        // 配置表加载完成后，再初始化其他管理器
        InitOtherManagers();
        
        Debuger.Log("WebGL平台：异步初始化完成");
    }
#endif

    /// <summary>
    /// 初始化其他管理器（配置表加载完成后调用）
    /// </summary>
    private static void InitOtherManagers()
    {
        // GMManager依赖配置表，必须在配置表初始化完成后调用
        GMManager.Instance.ListenGM();
        
        AudioMgr.Instance.Begin();
        SceneMgr.Instance.Begin();//大海.视野可拖动
        
        Debuger.Log("所有管理器初始化完成");
    }

    public static void Destroy()
    {
        Debuger.LogWarning("HotFixReflex-->Destroy");
        ManagerBinder.UnBind();
        
        AudioMgr.Instance.Dispose();
    }
}