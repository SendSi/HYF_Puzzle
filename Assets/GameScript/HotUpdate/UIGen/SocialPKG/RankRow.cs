/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace SocialPKG
{
    public partial class RankRow : GComponent
    {
        public GGraph _bg;
        public GTextField _rankText;
        public GTextField _nameText;
        public GTextField _progressText;
        public GTextField _starText;
        public const string URL = "ui://soc1al01rankrow01";

        public static RankRow CreateInstance()
        {
            return (RankRow)UIPackage.CreateObject("SocialPKG", "RankRow");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
            _rankText = (GTextField)GetChild("rankText");
            _nameText = (GTextField)GetChild("nameText");
            _progressText = (GTextField)GetChild("progressText");
            _starText = (GTextField)GetChild("starText");
        }
    }
}