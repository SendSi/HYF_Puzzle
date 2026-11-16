/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace SocialPKG
{
    public partial class ProfileView : GComponent
    {
        public GGraph _bg;
        public GGraph _panel;
        public GTextField _titleText;
        public GTextField _statsText;
        public SocialButton _rankBtn;
        public SocialButton _achieveBtn;
        public SocialButton _signBtn;
        public SocialButton _closeBtn;
        public const string URL = "ui://soc1al01prof0001";

        public static ProfileView CreateInstance()
        {
            return (ProfileView)UIPackage.CreateObject("SocialPKG", "ProfileView");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
            _panel = (GGraph)GetChild("panel");
            _titleText = (GTextField)GetChild("titleText");
            _statsText = (GTextField)GetChild("statsText");
            _rankBtn = (SocialButton)GetChild("rankBtn");
            _achieveBtn = (SocialButton)GetChild("achieveBtn");
            _signBtn = (SocialButton)GetChild("signBtn");
            _closeBtn = (SocialButton)GetChild("closeBtn");
        }
    }
}