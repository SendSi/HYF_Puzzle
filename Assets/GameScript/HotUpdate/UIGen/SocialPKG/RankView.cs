/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace SocialPKG
{
    public partial class RankView : GComponent
    {
        public GGraph _bg;
        public GGraph _header;
        public GTextField _titleText;
        public SocialButton _closeBtn;
        public GTextField _tipText;
        public GComponent _rankList;
        public const string URL = "ui://soc1al01rankv001";

        public static RankView CreateInstance()
        {
            return (RankView)UIPackage.CreateObject("SocialPKG", "RankView");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
            _header = (GGraph)GetChild("header");
            _titleText = (GTextField)GetChild("titleText");
            _closeBtn = (SocialButton)GetChild("closeBtn");
            _tipText = (GTextField)GetChild("tipText");
            _rankList = (GComponent)GetChild("rankList");
        }
    }
}