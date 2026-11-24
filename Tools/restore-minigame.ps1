# ============================================================
# 导出微信小游戏后，恢复被「微信小游戏转换工具」删掉的自定义文件
#   用法：双击 tools\restore-minigame.bat，或
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\restore-minigame.ps1
#   参数：-Target <小游戏目录>   自定义导出目录时使用
#         -CleanStale            顺便清理 data-package 里没被引用的旧资源
# ============================================================
param(
    [string]$Target = "",
    [switch]$CleanStale
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$overlay = Join-Path $root 'minigame_custom'
if (-not $Target) { $Target = Join-Path $root 'HYF_Puzzle_H5\minigame' }

function Step($m) { Write-Host " "; Write-Host $m -ForegroundColor Cyan }
function Ok($m)   { Write-Host ("   [OK]   " + $m) -ForegroundColor Green }
function Skip($m) { Write-Host ("   [跳过] " + $m) -ForegroundColor DarkGray }
function Warn($m) { Write-Host ("   [注意] " + $m) -ForegroundColor Yellow }
function Err($m)  { Write-Host ("   [失败] " + $m) -ForegroundColor Red }

Write-Host " "
Write-Host "==============================================" -ForegroundColor White
Write-Host " 拼图小游戏 - 导出自定义文件修复工具" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor White
Write-Host (" 源目录: " + $overlay)
Write-Host (" 目标: " + $Target)

if (-not (Test-Path $Target)) { Err "找不到小游戏目录，请确认导出路径是否正确"; exit 1 }
if (-not (Test-Path $overlay)) { Err "找不到自定义文件源目录 minigame_custom"; exit 1 }

$utf8 = New-Object System.Text.UTF8Encoding($false)

# ---------- 1. 拷贝自定义文件 ----------
Step "1/4 恢复自定义文件 / 目录"

$dirs = @('cloudfunctions', 'open-data')
foreach ($d in $dirs) {
    $src = Join-Path $overlay $d
    if (-not (Test-Path $src)) { Warn ("源目录缺少 " + $d + "，跳过"); continue }
    $dst = Join-Path $Target $d
    if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
    Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
    $n = (Get-ChildItem $dst -Recurse -File | Measure-Object).Count
    Ok ($d + "\  已恢复（" + $n + " 个文件）")
}

$files = @('wx-cloud-progress-sync.js', 'project.private.config.json')
foreach ($f in $files) {
    $src = Join-Path $overlay $f
    if (-not (Test-Path $src)) { Warn ("源目录缺少 " + $f + "，跳过"); continue }
    Copy-Item -Path $src -Destination (Join-Path $Target $f) -Force
    Ok ($f + "  已恢复")
}

# ---------- 2. 补 game.js 的 import ----------
Step "2/4 检查 game.js 的桥接脚本引入"

$gameJs = Join-Path $Target 'game.js'
if (-not (Test-Path $gameJs)) {
    Warn "找不到 game.js，跳过"
} else {
    $content = [System.IO.File]::ReadAllText($gameJs)
    if ($content -match 'wx-cloud-progress-sync') {
        Skip "game.js 已包含 wx-cloud-progress-sync 引入"
    } else {
        $anchor = "import './webgl.wasm.framework.unityweb';"
        if ($content.Contains($anchor)) {
            $replacement = $anchor + "`r`n" + "import './wx-cloud-progress-sync';"
            $content = $content.Replace($anchor, $replacement)
            [System.IO.File]::WriteAllText($gameJs, $content, $utf8)
            Ok "game.js 已插入 import './wx-cloud-progress-sync';"
        } else {
            Warn "game.js 结构变了，找不到 webgl.wasm.framework.unityweb 引入，需手动加一行 import"
        }
    }
}

# ---------- 3. 补 project.config.json 的 cloudfunctionRoot ----------
Step "3/4 检查 project.config.json 的 cloudfunctionRoot"

$cfg = Join-Path $Target 'project.config.json'
if (-not (Test-Path $cfg)) {
    Warn "找不到 project.config.json，跳过"
} else {
    $json = [System.IO.File]::ReadAllText($cfg)
    if ($json -match 'cloudfunctionRoot') {
        Skip "project.config.json 已包含 cloudfunctionRoot"
    } else {
        $anchor2 = '"compileType": "game",'
        if ($json.Contains($anchor2)) {
            $json = $json.Replace($anchor2, $anchor2 + "`r`n" + '  "cloudfunctionRoot": "cloudfunctions/",')
            [System.IO.File]::WriteAllText($cfg, $json, $utf8)
            Ok 'project.config.json 已插入 "cloudfunctionRoot": "cloudfunctions/"'
        } elseif ($json.Contains('"compileType": "game"')) {
            $json = $json.Replace('"compileType": "game"', '"compileType": "game",' + "`r`n" + '  "cloudfunctionRoot": "cloudfunctions/"')
            [System.IO.File]::WriteAllText($cfg, $json, $utf8)
            Ok 'project.config.json 已插入 cloudfunctionRoot'
        } else {
            Warn "project.config.json 结构变了，请手动加 cloudfunctionRoot"
        }
    }
}

# ---------- 4. 确保 game.json 开启云能力 ----------
Step "4/4 检查 game.json 的 cloud 开关"

$gameJson = Join-Path $Target 'game.json'
if (-not (Test-Path $gameJson)) {
    Warn "找不到 game.json，跳过"
} else {
    $gj = [System.IO.File]::ReadAllText($gameJson)
    if ($gj -match '"cloud"') {
        Skip "game.json 已包含 cloud 字段"
    } elseif ($gj.Contains('{')) {
        $gj = $gj.Replace('{', "{" + "`r`n" + '  "cloud" : true,', 1)
        [System.IO.File]::WriteAllText($gameJson, $gj, $utf8)
        Ok 'game.json 已插入 "cloud": true'
    } else {
        Warn "game.json 结构异常，请手动加 `"cloud`": true"
    }
}

# ---------- 可选：清理未被引用的旧资源 ----------
if ($CleanStale) {
    Step "附加 data-package 旧资源清理"
    $dp = Join-Path $Target 'data-package'
    if (Test-Path $dp) {
        $gjs = [System.IO.File]::ReadAllText($gameJs)
        $removed = 0; $freed = 0
        Get-ChildItem $dp -File -Filter '*.webgl.data.unityweb.bin.txt' | ForEach-Object {
            $hash = $_.BaseName.Split('.')[0]
            if ($gjs -notmatch [regex]::Escape($hash)) {
                $freed += $_.Length
                Remove-Item $_.FullName -Force
                $removed++
            }
        }
        if ($removed -gt 0) { Ok ("清理 " + $removed + " 个无引用资源，释放 " + [math]::Round($freed/1MB,1) + " MB") }
        else { Skip "没有无引用资源" }
    } else { Skip "没有 data-package 目录" }
}

# ---------- 结果汇总 ----------
Write-Host " "
Write-Host "----------------------------------------------" -ForegroundColor White
$okItems = @()
if (Test-Path (Join-Path $Target 'cloudfunctions\progressStorage\index.js')) { $okItems += "云函数" }
if (Test-Path (Join-Path $Target 'wx-cloud-progress-sync.js')) { $okItems += "桥接脚本" }
if (Test-Path (Join-Path $Target 'open-data\index.js')) { $okItems += "开放数据域" }

# 只统计真正会被打进小游戏包的文件：排除符号表、云函数源码、.plugincache
$pkgFiles = Get-ChildItem $Target -Recurse -File | Where-Object {
    $_.FullName -notmatch 'symbols\.unityweb' -and
    $_.FullName -notmatch '\\cloudfunctions\\' -and
    $_.FullName -notmatch '\\\.plugincache\\'
}
$size = ($pkgFiles | Measure-Object -Property Length -Sum).Sum

Write-Host (" 已就位: " + ($okItems -join ' / ')) -ForegroundColor Green
Write-Host (" 小游戏包体积(估算): " + [math]::Round($size/1MB,2) + " MB  (上限 30 MB)") -ForegroundColor Green
Write-Host " 下一步：微信开发者工具里点「编译」，再预览/上传" -ForegroundColor White
Write-Host " "
