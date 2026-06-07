using FairyGUI;

namespace Login
{
    public partial class LoginMainView : GComponent
    {
        private EffectObject effObject1;
        private int _currComValue = 0;

        public override void OnInit()
        {
            base.OnInit();
            FGUILoader.Instance.CheckLoadComPKG(); //加载公共依赖包
            AudioMgr.Instance.PlayBGM("music_background");
            ProxyCommonPKGModule.Instance.LoadToastTipView(); //要加载出来 tip

            this._ageBtn.onClick.Set(OnClickAgeBtn);
            this._startGame.onClick.Set(OnClickMapBtn1);


            // 初始化时显示进度（先从本地读，等云端回调回来再更新）
            int savedProgress = WXCloudStorageManager.Instance.GetProgress();
            if (savedProgress <= 0) savedProgress = 1;
            this._title_progress.text = $"当前进度是:{savedProgress}"; //服务端获取进度

            // 监听云端数据加载完成事件（拖删后重新安装时异步回调）
            WXCloudStorageManager.Instance.OnProgressChanged += OnProgressLoadedFromCloud;

            this._btn_progress.onClick.Set(OnClickProgressBtn);

            // 简体中文SimChinese  繁体中文TraChinese  英文English 
            if (AppConfig.currLang == "SimChinese")
            {
                _currComValue = 0;
            }
            else if (AppConfig.currLang == "TraChinese")
            {
                _currComValue = 1;
            }
            else if (AppConfig.currLang == "English")
            {
                _currComValue = 2;
            }

#if UNITY_EDITOR
            _btn_progress.visible = true;
#else
            _btn_progress.visible = false;
#endif
        }

        //上传服务端器 第5关
        private void OnClickProgressBtn()
        {
            SaveProgressToCloud(5);
        }



        /// <summary>
        /// 云端进度加载完成后的回调（异步）
        /// </summary>
        private void OnProgressLoadedFromCloud(int level)
        {
            if (level <= 0) level = 1;
            this._title_progress.text = $"当前进度是:{level}";
            Debuger.Log($"[LoginMainView] 云端进度已刷新: 第{level}关");
        }

        /// <summary>
        /// 保存进度到微信云端（卸载后数据不丢失）
        /// </summary>
        private void SaveProgressToCloud(int level)
        {
            // 更新 UI 显示
            this._title_progress.text = $"当前进度是:{level}";

            // 保存到微信云端存储
            WXCloudStorageManager.Instance.SaveProgress(level);

            // 显示提示
            ProxyCommonPKGModule.Instance.AddToastStr($"第{level}关进度已保存");

            Debuger.Log($"[LoginMainView] 进度已保存: 第{level}关");
        }

        private void OnClickMapBtn1()
        {
            int level = WXCloudStorageManager.Instance.GetProgress();
            if (level <= 0) level = 1;
            ProxyPuzzlePKGModule.Instance.OpenPuzzleMainView(level);
        }

        private void OnClickAgeBtn()
        {
            ProxyLoginModule.Instance.OpenGameAgeViewWin();
        }

        public override void Dispose()
        {
            WXCloudStorageManager.Instance.OnProgressChanged -= OnProgressLoadedFromCloud;
            base.Dispose();
        }

        public void SetData(string value)
        {
            this._title_version.text = value;
        }
    }
}