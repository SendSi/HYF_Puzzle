/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace LevelFlowPKG
{
    public partial class LevelSelectView : GComponent
    {
        public GGraph _bg;
        public GGraph _header;
        public LevelFlowButton _backBtn;
        public GTextField _titleText;
        public LevelFlowButton _signBtn;
        public GComponent _levelGrid;
        public const string URL = "ui://lvfl0w01sel0v001";

        public static LevelSelectView CreateInstance()
        {
            return (LevelSelectView)UIPackage.CreateObject("LevelFlowPKG", "LevelSelectView");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _bg = (GGraph)GetChild("bg");
            _header = (GGraph)GetChild("header");
            _backBtn = (LevelFlowButton)GetChild("backBtn");
            _titleText = (GTextField)GetChild("titleText");
            _signBtn = (LevelFlowButton)GetChild("signBtn");
            _levelGrid = (GComponent)GetChild("levelGrid");
        }
    }
}