# 部署云函数（必须带 --remote-npm-install，否则线上缺 wx-server-sdk）
# 不装依赖的症状：客户端报 errCode -504002 / Cannot find module 'wx-server-sdk'

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Cli     = 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat'
$EnvId   = 'cloud1-4g6ek89l1ec65c3f'
$Proj    = 'D:\GitHub_Project\HYF_Puzzle\HYF_Puzzle_H5\minigame'
$Name    = 'progressStorage'
$MaxTry  = 4
$deployed = $false

Write-Host ""
Write-Host "==== 部署云函数 $Name -> $EnvId ====" -ForegroundColor Cyan

for ($i = 1; $i -le $MaxTry; $i++) {
    Write-Host ""
    Write-Host ("[第 $i/$MaxTry 次] 上传并让云端安装依赖 ...") -ForegroundColor Yellow
    $out = & $Cli cloud functions deploy --env $EnvId --names $Name --remote-npm-install --project $Proj 2>&1
    $out | ForEach-Object { Write-Host $_ }
    if ($out -match 'success\s*\|\s*true' -or ($LASTEXITCODE -eq 0 -and -not ($out -match 'success\s*\|\s*false'))) {
        $deployed = $true
        break
    }

    if ($i -lt $MaxTry) {
        Write-Host "本次未成功（多半是上一次部署仍在 Updating），20 秒后重试 ..." -ForegroundColor Yellow
        Start-Sleep -Seconds 20
    }
}

if (-not $deployed) {
    Write-Host ""
    Write-Host "[失败] 部署未成功，请把上面的输出发给我" -ForegroundColor Red
    return
}

Write-Host ""
Write-Host "==== 校验线上包是否带上依赖 ====" -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP ('hyf_deploy_check_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$dl = & $Cli cloud functions download --env $EnvId --name $Name --path $tmp --project $Proj 2>&1
$dl | ForEach-Object { Write-Host $_ }

$dep = Join-Path $tmp 'node_modules\wx-server-sdk'
if (Test-Path $dep) {
    $ver = (Get-Content (Join-Path $dep 'package.json') -Raw | ConvertFrom-Json).version
    Write-Host ("[OK] 线上已包含 wx-server-sdk " + $ver) -ForegroundColor Green
} else {
    Write-Host "[失败] 线上仍缺 wx-server-sdk，请到开发者工具里勾选「云端安装依赖」后重新上传" -ForegroundColor Red
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "完成。客户端扫码后即可正常签到 / 提示 / 排行榜。" -ForegroundColor Green
Write-Host ""
