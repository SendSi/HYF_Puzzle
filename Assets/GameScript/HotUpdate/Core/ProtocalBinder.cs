using System.Threading;

public class ProtocalBinder
{
    private static CancellationTokenSource tokenCancel;
    public static void BindAll()
    {
        var channel = GrpcChannelManager.Instance.InitMainChannel(AppConfig.serverURL);
        tokenCancel = new CancellationTokenSource();
        ProtocalLogin.Instance.ListenLogin(channel,tokenCancel);
    }

    public static void UnBind()
    {
        GrpcChannelManager.Instance.Dispose();
        tokenCancel.Cancel();
        ProtocalLogin.Instance.Dispose();
        ServiceManager.Instance.Dispose();//统一移到这里了
    }
}