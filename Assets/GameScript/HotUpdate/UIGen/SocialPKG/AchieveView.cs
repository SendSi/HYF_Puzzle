/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace SocialPKG
{
    public partial class AchieveView : GComponent
    {
        public GGraph _bg;
        public GGraph _header;
        public GTextField _titleText;
        public SocialButton _closeBtn;
        public GComponent _achieveList;
        public const string URL = "ui://soc1al01achv0001";

        public static AchieveView CreateInstance()
        {
            return (AchieveView)UIPackage.CreateObject("SocialPKG", "AchieveView");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
            _header = (GGraph)GetChild("header");
            _titleText = (GTextField)GetChild("titleText");
            _closeBtn = (SocialButton)GetChild("closeBtn");
            _achieveList = (GComponent)GetChild("achieveList");
        }
    }
}