/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace LevelFlowPKG
{
    public partial class LevelCard : GComponent
    {
        public GGraph _bg;
        public GLoader _thumbLoader;
        public GTextField _levelText;
        public GTextField _detailText;
        public const string URL = "ui://lvfl0w01card0lv01";

        public static LevelCard CreateInstance()
        {
            return (LevelCard)UIPackage.CreateObject("LevelFlowPKG", "LevelCard");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
            _thumbLoader = (GLoader)GetChild("thumbLoader");
            _levelText = (GTextField)GetChild("levelText");
            _detailText = (GTextField)GetChild("detailText");
        }
    }
}