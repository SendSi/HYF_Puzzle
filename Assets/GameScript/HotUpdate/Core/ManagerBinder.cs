using UnityEngine;

public class ManagerBinder
{
    public static void BindAll()
    {
        LoginManager.Instance.ListenLogin();
        // 初始化微信云存储管理器（启动时从云端拉取进度）
        WXCloudStorageManager.Instance.Begin();
        // GMManager.ListenGM 已移至配置表加载完成后调用（WebGL平台需要异步加载配置表）
    }

    public static void UnBind()
    {
        LoginManager.Instance.Dispose();
    }
}