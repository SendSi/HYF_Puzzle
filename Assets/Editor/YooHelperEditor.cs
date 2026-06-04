using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using YooAsset.Editor;

//对yooAsset不熟 先手动写死吧
public static class YooHelperEditor
{
    static string GetPlatform()
    {
        if (UnityEditor.EditorUserBuildSettings.activeBuildTarget == BuildTarget.Android)
            return "Android";
        else if (UnityEditor.EditorUserBuildSettings.activeBuildTarget == BuildTarget.iOS)
            return "IPhone";
        else if (UnityEditor.EditorUserBuildSettings.activeBuildTarget == BuildTarget.WebGL)
            return "WebGL";
        else
            return "PC";
    }

    [MenuItem("YooAsset/Clear清空_WWW_hyfclient")] //打了热更后  替换
    public static void ClearCDNPath()
    {
        var toDir = $"{AppConfig.localCDN}{GetPlatform()}/{AppConfig.appVersion}";
        Debug.Log("若无报错 则成功删除       将删除=" + toDir);
        if (Directory.Exists(toDir))
        {
            Directory.Delete(toDir, true); //先删除  
        }

        AssetDatabase.Refresh();
    }

    public const string menuYooCopy = "YooAsset/Copy到_WWW_hyfclient";

    [MenuItem(menuYooCopy)] //打了热更后  替换
    public static void CopyCDNPath()
    {
        RunCopyResTarget(AppConfig.appVersion, AppConfig.resVersion);
    }

    public static void RunCopyResTarget(string appVersion, string resVersion)
    {
        var targetPath = $"{AppConfig.localCDN}{GetPlatform()}/{appVersion}";
        if (Directory.Exists(targetPath) == false)
        {
            Directory.CreateDirectory(targetPath); //先删除  再copy
        }

        var formRoot = $"{YooAsset.Editor.AssetBundleBuilderHelper.GetDefaultBuildOutputRoot()}/{UnityEditor.EditorUserBuildSettings.activeBuildTarget}";

        var soreceList = new List<string>();
        string resVerPath = "";
        foreach (var item in AssetBundleCollectorSettingData.Setting.Packages)
        {
            resVerPath = $"{formRoot}/{item.PackageName}/{resVersion}";
            soreceList.Add(resVerPath);
            Debug.Log($"formRoot={resVerPath}");
            if (Directory.Exists(resVerPath) == false)
            {
                Debug.LogError($"不存在此路径={resVerPath},请先打包资源 或看看AppConfig.resVersion是否正确");
                return;
            }
        }

        //Debuger.LogError($"formRoot:{formRoot} -->     targetPath: {targetPath}");
        for (int i = 0; i < soreceList.Count; i++)
        {
            foreach (string filePath in Directory.GetFiles(soreceList[i]))
            {
                string fileName = Path.GetFileName(filePath);
                string destinationPath = Path.Combine(targetPath, fileName);
                File.Copy(filePath, destinationPath, true); // 如果目标文件已经存在，覆盖
            }
        }

        AssetDatabase.Refresh();
        Debug.Log(" http-server --port 80 -b --cors       已copy    若无报错 则成功  ");
        GUIUtility.systemCopyBuffer = "http-server --port 80 -b --cors";
        System.Diagnostics.Process.Start(AppConfig.localCDN.Replace("CDN", ""));
    }
    
    /// <summary>
    /// 复制整个yoo文件夹到 CDN/{Platform}/StreamingAssets/yoo/
    /// 用于WebGL/微信小游戏平台，将资源复制到StreamingAssets目录
    /// </summary>
    public static void RunCopyResStreamingAssets(string resVersion)
    {
        // 目标路径：D:/WWW_hyfclient/CDN/WebGL/StreamingAssets/yoo/
        var targetPath = $"{AppConfig.localCDN}{GetPlatform()}/StreamingAssets/yoo/";
        
        // 如果目标目录已存在，先删除
        if (Directory.Exists(targetPath))
        {
            Directory.Delete(targetPath, true);
            Debug.Log($"已删除旧目录: {targetPath}");
        }
        Directory.CreateDirectory(targetPath);

        var formRoot = $"{YooAsset.Editor.AssetBundleBuilderHelper.GetDefaultBuildOutputRoot()}/{UnityEditor.EditorUserBuildSettings.activeBuildTarget}";

        // 复制每个Package的yoo资源文件夹
        foreach (var item in AssetBundleCollectorSettingData.Setting.Packages)
        {
            var sourcePath = $"{formRoot}/{item.PackageName}/{resVersion}";
            Debug.Log($"源路径={sourcePath}");
            
            if (Directory.Exists(sourcePath) == false)
            {
                Debug.LogError($"不存在此路径={sourcePath},请先打包资源 或看看AppConfig.resVersion是否正确");
                return;
            }

            // 目标子目录：.../StreamingAssets/yoo/{PackageName}/
            var packageTargetPath = Path.Combine(targetPath, item.PackageName);
            
            // 递归复制整个文件夹
            CopyDirectory(sourcePath, packageTargetPath);
            Debug.Log($"已复制: {sourcePath} -> {packageTargetPath}");
        }

        AssetDatabase.Refresh();
        Debug.Log($"已复制到 StreamingAssets/yoo/ 目录完成！目标路径: {targetPath}");
    }

    /// <summary>
    /// 递归复制整个目录
    /// </summary>
    private static void CopyDirectory(string sourceDir, string targetDir)
    {
        // 创建目标目录
        if (!Directory.Exists(targetDir))
        {
            Directory.CreateDirectory(targetDir);
        }

        // 复制所有文件
        foreach (string filePath in Directory.GetFiles(sourceDir))
        {
            string fileName = Path.GetFileName(filePath);
            string destFilePath = Path.Combine(targetDir, fileName);
            File.Copy(filePath, destFilePath, true);
        }

        // 递归复制所有子目录
        foreach (string subDir in Directory.GetDirectories(sourceDir))
        {
            string subDirName = Path.GetFileName(subDir);
            string destSubDir = Path.Combine(targetDir, subDirName);
            CopyDirectory(subDir, destSubDir);
        }
    }
    
}