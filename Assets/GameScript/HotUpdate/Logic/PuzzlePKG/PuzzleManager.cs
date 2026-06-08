using System.Collections.Generic;
using cfg;

public class PuzzleManager : Singleton<PuzzleManager>
{
    Dictionary<int, List<PuzzleConfig>>
        mPuzzlePlayerDic = new Dictionary<int, List<PuzzleConfig>>(); //key是玩家id,,,,value是手牌

    private List<PuzzleConfig> mPuzzleAllLists;

    public void ListenPuzzle()
    {
    }


    public List<PuzzleConfig> GetSelfCardList(int playerId = 1)
    {
        mPuzzleAllLists = CfgLubanMgr.Instance.globalTab.TbPuzzleConfig.DataList; //ConfigMgr.Instance.LoadConfigList<PuzzleConfig>();
        mPuzzleAllLists = OtherUtils.Instance.GetRandomList(mPuzzleAllLists); //打乱排序

        for (int i = 1; i < 4; i++)
        {
            mPuzzlePlayerDic[i] = new List<PuzzleConfig>();
        }

        var ply = 1;
        for (int i = 0; i < 52; i++)
        {
            if (ply == 4) ply = 1;

            mPuzzlePlayerDic[ply].Add(mPuzzleAllLists[i]);

            ply++;
        }


        return mPuzzlePlayerDic[playerId];
    }

    /// <summary>
    /// 从 urlIcon 中解析包名，如 "ui://Map_10/map" → "Map_10"
    /// </summary>
    public string GetPkgNameFromUrl(string url)
    {
        if (string.IsNullOrEmpty(url)) return "";
        // 格式: ui://包名/资源名
        int start = url.IndexOf("//") + 2;
        int end = url.LastIndexOf('/');
        if (start >= 2 && end > start)
            return url.Substring(start, end - start);
        return "";
    }

    public PuzzleMapConfig GetLevelMapCfg(int currLv)
    {
        var mapCfg = CfgLubanMgr.Instance.globalTab.TbPuzzleMapConfig.DataList;
        PuzzleMapConfig levelCfg = null;
        foreach (var cfg in mapCfg)
        {
            if (cfg.Task == currLv)
            {
                levelCfg = cfg;
                break;
            }
        }

        return levelCfg;
    }
}