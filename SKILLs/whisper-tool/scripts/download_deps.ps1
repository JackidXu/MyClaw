# whisper-tool 提供方专用（Windows）：重新拉取依赖，内嵌进 assets/。
# 自动探测本机翻墙代理；下载内置 ffmpeg(三端)/Windows whisper 二进制/ggml 模型。
# 注意：macOS 通用二进制需在 macOS 提供方机器上编译，本脚本不编译 mac 端。
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillDir  = Split-Path -Parent $ScriptDir
Set-Location $SkillDir

function Log($m){ Write-Host "[$(Get-Date -Format HH:mm:ss)] $m" }

if (-not $env:HTTPS_PROXY -and -not $env:HTTP_PROXY) {
  foreach ($p in @(7890,1087,1080,8118,8080,60069)) {
    try {
      Invoke-WebRequest -Uri "https://github.com" -Proxy "http://127.0.0.1:$p" -TimeoutSec 5 -UseBasicParsing -Method Head -ErrorAction Stop | Out-Null
      $env:HTTPS_PROXY = "http://127.0.0.1:$p"; $env:HTTP_PROXY = "http://127.0.0.1:$p"
      Log "未设代理，自动使用本机翻墙端口 $p"; break
    } catch {}
  }
} else { Log "使用环境代理 $($env:HTTPS_PROXY)" }

function Get-Binary($url, $out) {
  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
  for ($i=1; $i -le 40; $i++) {
    try {
      if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -sL --retry 3 --retry-delay 3 --max-time 590 -C - -o $out $url
      } else {
        $wc = New-Object System.Net.WebClient
        if ($env:HTTPS_PROXY) { $wc.Proxy = New-Object System.Net.WebProxy($env:HTTPS_PROXY, $true) }
        $wc.DownloadFile($url, $out)
      }
      if ((Test-Path $out) -and ((Get-Item $out).Length -gt 1000)) { Log "OK  $out"; return }
    } catch { Log "retry $i for $out"; Start-Sleep -Seconds 3 }
  }
  Log "FAIL $out"
}

$WhTag = "b4938"; $FfTag = "b6.1.1"

Log "=== 1) 内置 ffmpeg (三端) ==="
Get-Binary "https://github.com/eugeneware/ffmpeg-static/releases/download/$FfTag/ffmpeg-darwin-arm64" "assets/ffmpeg/macos-arm64/ffmpeg"
Get-Binary "https://github.com/eugeneware/ffmpeg-static/releases/download/$FfTag/ffmpeg-darwin-x64"   "assets/ffmpeg/macos-x64/ffmpeg"
Get-Binary "https://github.com/eugeneware/ffmpeg-static/releases/download/$FfTag/ffmpeg-win32-x64"    "assets/ffmpeg/windows-x64/ffmpeg.exe"

Log "=== 2) whisper Windows 二进制 ==="
Get-Binary "https://github.com/ggml-org/whisper.cpp/releases/download/$WhTag/whisper-bin-x64.zip" "$env:TEMP\whisper-bin-x64.zip"
Expand-Archive -Path "$env:TEMP\whisper-bin-x64.zip" -DestinationPath "$env:TEMP\whisper-win" -Force
$WinExe = (Get-ChildItem "$env:TEMP\whisper-win" -Recurse -Include @("whisper-cli.exe","whisper.exe") | Select-Object -First 1).FullName
if ($WinExe) { New-Item -ItemType Directory -Force -Path "assets/windows-x64" | Out-Null; Copy-Item $WinExe "assets/windows-x64/whisper-cli.exe" -Force; Log "win whisper -> $WinExe" }
else { Log "WARN: 未找到 windows whisper exe" }

Log "=== 3) ggml-base.bin 模型 (hf-mirror 优先) ==="
New-Item -ItemType Directory -Force -Path "assets/models" | Out-Null
Get-Binary "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" "assets/models/ggml-base.bin"
if (-not ((Test-Path "assets/models/ggml-base.bin") -and ((Get-Item "assets/models/ggml-base.bin").Length -gt 1000))) {
  Get-Binary "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" "assets/models/ggml-base.bin"
}
Log "=== whisper-tool 依赖更新完成（mac 端请在 macOS 提供方机器编译后放入 assets/macos-universal/whisper-cli）==="
