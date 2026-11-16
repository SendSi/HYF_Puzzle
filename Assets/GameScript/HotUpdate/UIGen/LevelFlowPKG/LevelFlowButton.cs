/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace LevelFlowPKG
{
    public partial class LevelFlowButton : GButton
    {
        public GGraph _bg;
        public const string URL = "ui://lvfl0w01btn0lv01";

        public static LevelFlowButton CreateInstance()
        {
            return (LevelFlowButton)UIPackage.CreateObject("LevelFlowPKG", "LevelFlowButton");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
        }
    }
}