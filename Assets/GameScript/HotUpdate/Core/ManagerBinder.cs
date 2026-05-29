using UnityEngine;

public class ManagerBinder
{
    public static void BindAll()
    {
        LoginManager.Instance.ListenLogin();
        GMManager.Instance.ListenGM();
    }

    public static void UnBind()
    {
        LoginManager.Instance.Dispose();
    }
}