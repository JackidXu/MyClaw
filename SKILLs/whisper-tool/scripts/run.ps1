# whisper-tool 包装脚本（Windows）
# 选择 windows-x64 的 whisper-cli 与内置 ffmpeg，抽取音频（如需）后转写。
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Assets   = Join-Path $ScriptDir ".." "assets"
$WH       = Join-Path $Assets "windows-x64" "whisper-cli.exe"
$FF       = Join-Path $Assets "ffmpeg" "windows-x64" "ffmpeg.exe"
$Model    = Join-Path $Assets "models" "ggml-base.bin"

$WhTag = "b4938"; $FfTag = "b6.1.1"

function Download-Component($url, $out, $desc, $isHf=$false) {
  if (Test-Path $out) { return }
  Write-Host ">>> [whisper-tool] 正在下载 $desc ..."
  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
  $tmp = "$out.tmp"
  $proxyUrl = if ($isHf) { $url } else { "https://gh-proxy.com/$url" }
  
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -sL --retry 3 --retry-delay 2 --max-time 300 -C - -o $tmp $proxyUrl
    if (-not (Test-Path $tmp)) {
      & curl.exe -sL --retry 3 --retry-delay 2 --max-time 300 -C - -o $tmp $url
    }
  } else {
    try {
      (New-Object System.Net.WebClient).DownloadFile($proxyUrl, $tmp)
    } catch {
      (New-Object System.Net.WebClient).DownloadFile($url, $tmp)
    }
  }

  if ((Test-Path $tmp) -and ((Get-Item $tmp).Length -gt 1000)) {
    Move-Item -Path $tmp -Destination $out -Force
    Write-Host ">>> [whisper-tool] $desc 下载完成！"
  } else {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Write-Error "$desc 下载失败，请检查网络后重试。"
    exit 2
  }
}

# 1. ffmpeg.exe
Download-Component "https://github.com/eugeneware/ffmpeg-static/releases/download/$FfTag/ffmpeg-win32-x64" $FF "内置 ffmpeg.exe"

# 2. whisper-cli.exe
if (-not (Test-Path $WH)) {
  $zipPath = "$env:TEMP\whisper-bin-x64.zip"
  Download-Component "https://github.com/ggml-org/whisper.cpp/releases/download/$WhTag/whisper-bin-x64.zip" $zipPath "whisper-cli.exe 压缩包"
  Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\whisper-win" -Force
  $WinExe = (Get-ChildItem "$env:TEMP\whisper-win" -Recurse -Include @("whisper-cli.exe","whisper.exe") | Select-Object -First 1).FullName
  if ($WinExe) {
    New-Item -ItemType Directory -Force -Path (Split-Path $WH) | Out-Null
    Copy-Item $WinExe $WH -Force
  } else {
    Write-Error "解压后未找到 whisper-cli.exe"
    exit 2
  }
}

# 3. ggml-base.bin 模型 (国内镜像优先)
if (-not (Test-Path $Model)) {
  try {
    Download-Component "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" $Model "Whisper 模型 (ggml-base.bin)" $true
  } catch {
    Download-Component "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" $Model "Whisper 模型 (ggml-base.bin)" $true
  }
}

$Input=""; $Fmt="srt"; $Lang="auto"
$i=0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    "--format" { $Fmt=$args[$i+1]; $i+=2 }
    "--lang"   { $Lang=$args[$i+1]; $i+=2 }
    "--*"      { Write-Error "未知选项: $($args[$i])"; exit 1 }
    default    { if (-not $Input) { $Input=$args[$i] }; $i++ }
  }
}

if (-not $Input) { Write-Error "用法: run.ps1 <输入文件> [-Format srt] [-Lang auto]"; exit 1 }
if (-not (Test-Path $Input)) { Write-Error "输入文件不存在: $Input"; exit 1 }

$Original = $Input
$Ext = [System.IO.Path]::GetExtension($Input).ToLower()
$TmpWav = ""
if ($Ext -ne ".wav") {
  $TmpWav = Join-Path $env:TEMP ("whisper_" + [guid]::NewGuid().ToString("N") + ".wav")
  & $FF -y -i $Input -ar 16000 -ac 1 -c:a pcm_s16le $TmpWav | Out-Null
  if (-not (Test-Path $TmpWav)) { Write-Error "音频抽取失败（ffmpeg 无法解码该文件）"; exit 3 }
  $Input = $TmpWav
}

$OutBase = [System.IO.Path]::Combine(
  [System.IO.Path]::GetDirectoryName($Original),
  [System.IO.Path]::GetFileNameWithoutExtension($Original) + "_whisper"
)
# 把 -Format 映射到 whisper.cpp 的布尔开关（b4938 起为 -osrt/-ovtt/-otxt 等）
$OFlag = switch ($Fmt) {
  "srt"  { "-osrt" }
  "vtt"  { "-ovtt" }
  "txt"  { "-otxt" }
  "lrc"  { "-olrc" }
  "csv"  { "-ocsv" }
  "json" { "-oj" }
  default { Write-Error "不支持的格式: $Fmt （支持 srt/vtt/txt/lrc/csv/json）"; exit 1 }
}

& $WH -m $Model -f $Input $OFlag -of $OutBase -l $Lang
Write-Host "已生成: $OutBase.$Fmt"

if ($TmpWav) { Remove-Item $TmpWav -Force -ErrorAction SilentlyContinue }
