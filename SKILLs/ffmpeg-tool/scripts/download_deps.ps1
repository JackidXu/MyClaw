# ffmpeg-tool 提供方专用（Windows）：重新拉取 ffmpeg 静态二进制，内嵌进 assets/。
# 终端用户无需运行。脚本自动探测本机翻墙代理，断点续传下载三端二进制。
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillDir  = Split-Path -Parent $ScriptDir
Set-Location $SkillDir

function Log($m){ Write-Host "[$(Get-Date -Format HH:mm:ss)] $m" }

# 代理自动探测
$proxyOk = $false
if (-not $env:HTTPS_PROXY -and -not $env:HTTP_PROXY) {
  foreach ($p in @(7890,1087,1080,8118,8080,60069)) {
    try {
      $r = Invoke-WebRequest -Uri "https://github.com" -Proxy "http://127.0.0.1:$p" -TimeoutSec 5 -UseBasicParsing -Method Head -ErrorAction Stop
      $env:HTTPS_PROXY = "http://127.0.0.1:$p"; $env:HTTP_PROXY = "http://127.0.0.1:$p"
      Log "未设代理，自动使用本机翻墙端口 $p"; $proxyOk = $true; break
    } catch {}
  }
} else { Log "使用环境代理 $($env:HTTPS_PROXY)"; $proxyOk = $true }

function Get-Binary($url, $out) {
  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
  $ok = $false
  for ($i=1; $i -le 40; $i++) {
    try {
      if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -sL --retry 3 --retry-delay 3 --max-time 590 -C - -o $out $url
      } else {
        $wc = New-Object System.Net.WebClient
        if ($env:HTTPS_PROXY) { $wc.Proxy = New-Object System.Net.WebProxy($env:HTTPS_PROXY, $true) }
        $wc.DownloadFile($url, $out)
      }
      if ((Test-Path $out) -and ((Get-Item $out).Length -gt 1000)) { Log "OK  $out"; $ok=$true; break }
    } catch { Log "retry $i for $out" ; Start-Sleep -Seconds 3 }
  }
  if (-not $ok) { Log "FAIL $out" }
}

$Tag = "b6.1.1"
Log "=== 下载 ffmpeg 静态二进制 (macOS arm64 / x64 + Windows x64) ==="
Get-Binary "https://github.com/eugeneware/ffmpeg-static/releases/download/$Tag/ffmpeg-darwin-arm64" "assets/macos-arm64/ffmpeg"
Get-Binary "https://github.com/eugeneware/ffmpeg-static/releases/download/$Tag/ffmpeg-darwin-x64"   "assets/macos-x64/ffmpeg"
Get-Binary "https://github.com/eugeneware/ffmpeg-static/releases/download/$Tag/ffmpeg-win32-x64"    "assets/windows-x64/ffmpeg.exe"
Log "=== ffmpeg-tool 二进制更新完成 ==="
