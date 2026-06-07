/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace Login
{
    public partial class LoginMainView : GComponent
    {
        public GLoader _bg;
        public GButton _ageBtn;
        public GTextField _title_version;
        public GButton _btn_progress;
        public GGroup _left;
        public GTextField _title_progress;
        public GButton _startGame;
        public GGroup _center;
        public GTextField _title_03;
        public const string URL = "ui://byy9k3ghezv21ygcga7";

        public static LoginMainView CreateInstance()
        {
            return (LoginMainView)UIPackage.CreateObject("Login", "LoginMainView");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GLoader)GetChild("bg");
            _ageBtn = (GButton)GetChild("ageBtn");
            _title_version = (GTextField)GetChild("title_version");
            _btn_progress = (GButton)GetChild("btn_progress");
            _left = (GGroup)GetChild("left");
            _title_progress = (GTextField)GetChild("title_progress");
            _startGame = (GButton)GetChild("startGame");
            _center = (GGroup)GetChild("center");
            _title_03 = (GTextField)GetChild("title_03");
        }
    }
}