using Luban;
using UnityEngine;
using YooAsset;
using Cysharp.Threading.Tasks;
using System.Collections.Generic;

/// <summary>
/// https://luban.doc.code-philosophy.com/docs/beginner/quickstart
///单独取一条数据.oneCfg-->CfgLubanMgr.Instance.globalTab.TbItemConfig.Get(id);
///取一个整表.lists--> CfgLubanMgr.Instance.globalTab.TbEightGiftConfig.DataList   
/// </summary>
public class CfgLubanMgr : Singleton<CfgLubanMgr>
{
    private cfg.Tables _globalTab;
    private static Dictionary<string, ByteBuf> _bytesCache = new Dictionary<string, ByteBuf>();

    protected override void OnInit()
    {
        base.OnInit();
        Debug.LogWarning($"导表文件 加载了lubanBytes文件夹的所有bytes  使用二进制读取,比json的性能好很多");
        
#if !UNITY_WEBGL
        // 非WebGL平台：同步初始化
        InitSync();
#endif
    }

#if !UNITY_WEBGL
    /// <summary>
    /// 同步初始化配置表（非WebGL平台使用）
    /// </summary>
    private void InitSync()
    {
        Debug.Log("CfgLubanMgr 同步初始化...");
        _globalTab = new cfg.Tables(LoadByteBuf);
        Debug.Log("CfgLubanMgr 同步初始化完成");
    }
#endif

    /// <summary>
    /// 异步初始化配置表（WebGL平台必须使用）
    /// </summary>
    public async UniTask InitAsync()
    {
        // 先异步加载所有配置表文件
        await PreloadAllConfigFiles();
        
        // 然后创建 Tables（使用缓存的 bytes）
        _globalTab = new cfg.Tables(LoadByteBufFromCache);
        Debug.Log("CfgLubanMgr 异步初始化完成");
    }

    /// <summary>
    /// 预加载所有配置文件到缓存
    /// </summary>
    private async UniTask PreloadAllConfigFiles()
    {
        var assetPackage = YooAssets.TryGetPackage(AppConfig.defaultYooAssetPKG);
        // 这里列出所有需要加载的导表文件
        string[] configFiles = new string[]
        {
            "tbpuzzleconfig",
            "tbpuzzlemapconfig",
            "tbgmconfig",
            "tbcfg_language",
            "tbscript_language",
            "tbsoundconfig",
            "tbeffectconfig",
            "tbtiptextconfig",
        };

        foreach (var file in configFiles)
        {
            var handle = assetPackage.LoadAssetAsync<TextAsset>(file);
            await handle.ToUniTask();
            
            if (handle.AssetObject is TextAsset textAsset)
            {
                // 缓存 key 使用小写的文件名（与 Luban Tables 调用 loader 的参数一致）
                _bytesCache[file.ToLower()] = new ByteBuf(textAsset.bytes);
                handle.Release(); // 释放句柄，但 bytes 已缓存
            }
            else
            {
                Debug.LogWarning($"配置表文件加载失败: {file}");
            }
        }
    }

    private static ByteBuf LoadByteBufFromCache(string file)
    {
        string key = file.ToLower();
        if (_bytesCache.TryGetValue(key, out var byteBuf))
        {
            return byteBuf;
        }
        
        // 如果缓存中没有，尝试同步加载（非WebGL平台）
#if !UNITY_WEBGL
        var assetPackage = YooAssets.TryGetPackage(AppConfig.defaultYooAssetPKG);
        var handle = assetPackage.LoadAssetSync(file);
        if (handle.AssetObject is TextAsset textAsset)
        {
            return new ByteBuf(textAsset.bytes);
        }
#else
        Debug.LogError($"配置表未在缓存中找到: {file}，请先调用 InitAsync() 预加载");
#endif
        return null;
    }

    private static ByteBuf LoadByteBuf(string file)
    {
        // WebGL 平台不允许同步加载，必须先用 InitAsync 预加载
#if UNITY_WEBGL
        return LoadByteBufFromCache(file);
#else
        // 非WebGL平台，先检查缓存
        var cached = LoadByteBufFromCache(file);
        if (cached != null) return cached;
        
        // 缓存没有，同步加载
        var assetPackage = YooAssets.TryGetPackage(AppConfig.defaultYooAssetPKG);
        var handle = assetPackage.LoadAssetSync(file);
        if (handle.AssetObject is TextAsset textAsset)
        {
            return new ByteBuf(textAsset.bytes);
        }
        return null;
#endif
    }

    public cfg.Tables globalTab
    {
        get { return _globalTab; }
    }

    /// <summary> 导表索引过来的数据 </summary>
    /// <param name="plainText">可以传原导表的文本内容</param>
    public string GetCurrLangCfgTxt(int langId, string plainText = "null")
    {
        if (langId <= 0) return plainText;

        var cfg = _globalTab.TbCfgLanguage.Get(langId);
        if (cfg == null) return plainText;
        else if (AppConfig.currLang == "TraChinese") return cfg.LangTraChinese;
        else if (AppConfig.currLang == "English") return cfg.LangEnglish;
        else return cfg.LangSimChinese;
    }

    /// <summary> 平时程序 写代码 收集到的中文 需翻译 </summary>
    /// <param name="plainText">可以传原导表的文本内容</param>
    public string GetCurrLangScriptTxt(int langId)
    {
        if (langId <= 0) return "null";

        var cfg = _globalTab.TbScriptLanguage.Get(langId);
        if (cfg == null) return "null";
        else if (AppConfig.currLang == "TraChinese") return cfg.LangTraChinese;
        else if (AppConfig.currLang == "English") return cfg.LangEnglish;
        else return cfg.LangSimChinese;
    }

    /// <summary> 举例 </summary>
    /// var cfg = CfgLubanMgr.Instance.globalTab.TbReward.Get(10001);       Debug.LogFormat("{0}",cfg);
    public void ExampleMethod()
    {
        // var cfg1 = _globalTab.TBATestItem.DataList[1];
        // Debug.LogFormat("下标 item[1]:{0}", cfg1);
        //
        // foreach (var itT in _globalTab.TBATestItem.DataList)
        // {
        //     Debug.Log($"列表  {itT.Name}   {itT.Price}");
        // }
        //
        // var cfg2 = _globalTab.TBATestItem.Get(10001);
        // Debug.LogFormat("根据id取值 data:{0}", cfg2);
    }
}