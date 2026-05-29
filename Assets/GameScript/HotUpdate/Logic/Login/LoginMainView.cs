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

        private void OnClickMapBtn1()
        {
            ProxyPuzzlePKGModule.Instance.OpenPuzzleMainView();
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
            base.Dispose();
        }

        public void SetData(string value)
        {
            this._title_version.text = value;
        }
    }
}