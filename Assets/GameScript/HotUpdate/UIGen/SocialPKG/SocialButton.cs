/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace SocialPKG
{
    public partial class SocialButton : GButton
    {
        public GGraph _bg;
        public const string URL = "ui://soc1al01socbtn01";

        public static SocialButton CreateInstance()
        {
            return (SocialButton)UIPackage.CreateObject("SocialPKG", "SocialButton");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
        }
    }
}