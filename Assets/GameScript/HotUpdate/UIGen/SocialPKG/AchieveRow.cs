/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace SocialPKG
{
    public partial class AchieveRow : GComponent
    {
        public GGraph _bg;
        public GTextField _nameText;
        public GTextField _descText;
        public GTextField _stateText;
        public const string URL = "ui://soc1al01acherow01";

        public static AchieveRow CreateInstance()
        {
            return (AchieveRow)UIPackage.CreateObject("SocialPKG", "AchieveRow");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
            _nameText = (GTextField)GetChild("nameText");
            _descText = (GTextField)GetChild("descText");
            _stateText = (GTextField)GetChild("stateText");
        }
    }
}