# ffmpeg-tool 包装脚本（Windows）
# 选择 windows-x64 的静态 ffmpeg 二进制，并透传所有参数。
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Assets   = Join-Path $ScriptDir ".." "assets"
$Bin      = Join-Path $Assets "windows-x64" "ffmpeg.exe"

$Tag = "b6.1.1"
if (-not (Test-Path $Bin)) {
  Write-Host ">>> [ffmpeg-tool] 正在下载 ffmpeg.exe 组件..."
  New-Item -ItemType Directory -Force -Path (Split-Path $Bin) | Out-Null
  $cdnUrl = "https://scrm0.cdn.banchengyun.com/heyclaw/assets/ffmpeg-tool/ffmpeg.exe"
  $url = "https://github.com/eugeneware/ffmpeg-static/releases/download/$Tag/ffmpeg-win32-x64"
  $proxyUrl = "https://gh-proxy.com/$url"
  $tmpFile = "$Bin.tmp"
  $downloaded = $false
  
  $urlsToTry = @($cdnUrl, $proxyUrl, $url)
  foreach ($targetUrl in $urlsToTry) {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe -sL --retry 3 --retry-delay 2 --max-time 180 -C - -o $tmpFile $targetUrl
    } else {
      try {
        (New-Object System.Net.WebClient).DownloadFile($targetUrl, $tmpFile)
      } catch {
        # 忽略单个 URL 失败，尝试下一个
      }
    }
    if ((Test-Path $tmpFile) -and ((Get-Item $tmpFile).Length -gt 1000)) {
      break
    }
  }

  if ((Test-Path $tmpFile) -and ((Get-Item $tmpFile).Length -gt 1000)) {
    Move-Item -Path $tmpFile -Destination $Bin -Force
    Write-Host ">>> [ffmpeg-tool] 下载完成！"
    $downloaded = $true
  } else {
    Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
  }

  if (-not $downloaded) {
    Write-Error "ffmpeg.exe 下载失败，请检查网络后重试。"
    exit 2
  }
}

& $Bin @args
