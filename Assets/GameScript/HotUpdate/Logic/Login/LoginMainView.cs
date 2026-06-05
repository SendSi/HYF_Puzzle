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

            this._noticeBtn.onClick.Set(OnClickNoticeBtn);
            this._serviceBtn.onClick.Set(OnClickServiceBtn);
            this._mapBtn_1.onClick.Set(OnClickMapBtn1);
            this._mapBtn_2.onClick.Set(OnClickMapBtn2);
            this._mapBtn_3.onClick.Set(OnClickMapBtn3);

            // 初始化时显示进度（先从本地读，等云端回调回来再更新）
            int savedProgress = WXCloudStorageManager.Instance.GetProgress();
            if (savedProgress <= 0) savedProgress = 1;
            this._title_progress.text = $"当前进度是:{savedProgress}";//服务端获取进度

            // 监听云端数据加载完成事件（拖删后重新安装时异步回调）
            WXCloudStorageManager.Instance.OnProgressChanged += OnProgressLoadedFromCloud;

            this._btn_progress2.onClick.Set(OnClickProgress2Btn);
            this._btn_progress10.onClick.Set(OnClickProgress10Btn);
            this._btn_progress100.onClick.Set(OnClickProgress100Btn);

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

            this._languCom.selectedIndex = _currComValue;
            this._languCom.items = new[] { "简体中文", "繁體中文", "English" };
            this._languCom.onChanged.Set(OnChangedLanguage);
        }

        //上传服务端器 第2关
        private void OnClickProgress2Btn()
        {
            SaveProgressToCloud(2);
        }
        //上传服务端器 第10关
        private void OnClickProgress10Btn()
        {
            SaveProgressToCloud(10);
        }
        //上传服务端器 第100关
        private void OnClickProgress100Btn()
        {
            SaveProgressToCloud(100);
        }

        /// <summary>
        /// 云端进度加载完成后的回调（异步）
        /// </summary>
        private void OnProgressLoadedFromCloud(int level)
        {
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
            ProxyCommonPKGModule.Instance.AddToastStr($"第{level}关进度已保存到云端");

            Debuger.Log($"[LoginMainView] 进度已保存到微信云端: 第{level}关");
        }

        private void OnClickMapBtn1()
        {
            int level = WXCloudStorageManager.Instance.GetProgress();
            if (level <= 0) level = 1;
            ProxyPuzzlePKGModule.Instance.OpenPuzzleMainView(level);
        }

        private void OnClickMapBtn2()
        {
        }

        private void OnClickMapBtn3()
        {
            throw new System.NotImplementedException();
        }


        private void OnClickNoticeBtn()
        {
            ProxyLoginModule.Instance.OpenGameNoticeViewWin();
        }


        private void OnClickAgeBtn()
        {
            ProxyLoginModule.Instance.OpenGameAgeViewWin();
        }

        private void OnClickServiceBtn()
        {
            ProxyDialogTipModule.Instance.OpenDialogTip1ViewWin("提示", "正在编辑内容", "确定", null);
        }

        private void OnChangedLanguage()
        {
            if (_currComValue == _languCom.selectedIndex)
            {
                return; //本就选中 当前语言
            }

            var content = $"您确定要切换成{this._languCom.title},\r\n游戏将退出,重启后再成为目标语言";
            ProxyDialogTipModule.Instance.OpenDialogTip2ViewWin("提示", content, null, delegate
            {
                _languCom.selectedIndex = _currComValue;
                _languCom.title = this._languCom.items[_currComValue];
            }, null, delegate
            {
                if (this._languCom.selectedIndex == 0)
                {
                    LanguageUtils.Instance.ChangeLanguage("SimChinese");
                }
                else if (this._languCom.selectedIndex == 1)
                {
                    LanguageUtils.Instance.ChangeLanguage("TraChinese");
                }
                else if (this._languCom.selectedIndex == 2)
                {
                    LanguageUtils.Instance.ChangeLanguage("English");
                }
            });
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