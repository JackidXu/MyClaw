# ffmpeg-tool 包装脚本（Windows）
# 选择 windows-x64 的静态 ffmpeg 二进制，并透传所有参数。
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Assets   = Join-Path $ScriptDir ".." "assets"
$Bin      = Join-Path $Assets "windows-x64" "ffmpeg.exe"

if (-not (Test-Path $Bin)) {
  Write-Error "未找到 ffmpeg.exe: $Bin 。发布前请提供方在有代理的机器上运行 download_deps.ps1"
  exit 2
}

& $Bin @args
