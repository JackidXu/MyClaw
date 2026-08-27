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
  $url = "https://github.com/eugeneware/ffmpeg-static/releases/download/$Tag/ffmpeg-win32-x64"
  $proxyUrl = "https://gh-proxy.com/$url"
  $tmpFile = "$Bin.tmp"
  $downloaded = $false
  
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -sL --retry 3 --retry-delay 2 --max-time 180 -C - -o $tmpFile $proxyUrl
    if (-not (Test-Path $tmpFile)) {
      & curl.exe -sL --retry 3 --retry-delay 2 --max-time 180 -C - -o $tmpFile $url
    }
  } else {
    try {
      (New-Object System.Net.WebClient).DownloadFile($proxyUrl, $tmpFile)
    } catch {
      (New-Object System.Net.WebClient).DownloadFile($url, $tmpFile)
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
