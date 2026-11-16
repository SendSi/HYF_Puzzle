/** This is an automatically generated class by FairyGUI. Please do not modify it. **/

using FairyGUI;
using FairyGUI.Utils;

namespace LevelFlowPKG
{
    public partial class ResultView : GComponent
    {
        public GGraph _mask;
        public GGraph _panel;
        public GTextField _titleText;
        public GTextField _detailText;
        public GTextField _hintText;
        public LevelFlowButton _nextBtn;
        public LevelFlowButton _replayBtn;
        public LevelFlowButton _backBtn;
        public const string URL = "ui://lvfl0w01rslt0001";

        public static ResultView CreateInstance()
        {
            return (ResultView)UIPackage.CreateObject("LevelFlowPKG", "ResultView");
        }

        public override void ConstructFromXML(XML xml)
        {
            base.ConstructFromXML(xml);

            _mask = (GGraph)GetChild("mask");
            _panel = (GGraph)GetChild("panel");
            _titleText = (GTextField)GetChild("titleText");
            _detailText = (GTextField)GetChild("detailText");
            _hintText = (GTextField)GetChild("hintText");
            _nextBtn = (LevelFlowButton)GetChild("nextBtn");
            _replayBtn = (LevelFlowButton)GetChild("replayBtn");
            _backBtn = (LevelFlowButton)GetChild("backBtn");
        }
    }
}