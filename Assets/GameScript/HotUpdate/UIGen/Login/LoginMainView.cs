/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace Login
{
    public partial class LoginMainView : GComponent
    {
        public GLoader _bg;
        public GTextField _title_version;
        public GButton _noticeBtn;
        public GButton _serviceBtn;
        public GGroup _left;
        public GButton _ageBtn;
        public GButton _mapBtn_1;
        public GButton _mapBtn_2;
        public GButton _mapBtn_3;
        public GGroup _btns;
        public GTextField _title_03;
        public GComboBox _languCom;
        public GTextField _title_progress;
        public GButton _btn_progress2;
        public GButton _btn_progress10;
        public GButton _btn_progress100;
        public const string URL = "ui://byy9k3ghezv21ygcga7";

        public static LoginMainView CreateInstance()
        {
            return (LoginMainView)UIPackage.CreateObject("Login", "LoginMainView");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GLoader)GetChild("bg");
            _title_version = (GTextField)GetChild("title_version");
            _noticeBtn = (GButton)GetChild("noticeBtn");
            _serviceBtn = (GButton)GetChild("serviceBtn");
            _left = (GGroup)GetChild("left");
            _ageBtn = (GButton)GetChild("ageBtn");
            _mapBtn_1 = (GButton)GetChild("mapBtn_1");
            _mapBtn_2 = (GButton)GetChild("mapBtn_2");
            _mapBtn_3 = (GButton)GetChild("mapBtn_3");
            _btns = (GGroup)GetChild("btns");
            _title_03 = (GTextField)GetChild("title_03");
            _languCom = (GComboBox)GetChild("languCom");
            _title_progress = (GTextField)GetChild("title_progress");
            _btn_progress2 = (GButton)GetChild("btn_progress2");
            _btn_progress10 = (GButton)GetChild("btn_progress10");
            _btn_progress100 = (GButton)GetChild("btn_progress100");
        }
    }
}