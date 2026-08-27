# whisper-tool 包装脚本（Windows）
# 选择 windows-x64 的 whisper-cli 与内置 ffmpeg，抽取音频（如需）后转写。
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Assets   = Join-Path $ScriptDir ".." "assets"
$WH       = Join-Path $Assets "windows-x64" "whisper-cli.exe"
$FF       = Join-Path $Assets "ffmpeg" "windows-x64" "ffmpeg.exe"
$Model    = Join-Path $Assets "models" "ggml-base.bin"

if (-not (Test-Path $WH))    { Write-Error "缺少 whisper-cli.exe: $WH ，请提供方运行 download_deps.ps1"; exit 2 }
if (-not (Test-Path $FF))    { Write-Error "缺少内置 ffmpeg.exe: $FF ，请提供方运行 download_deps.ps1"; exit 2 }
if (-not (Test-Path $Model)) { Write-Error "缺少模型 ggml-base.bin: $Model ，请提供方运行 download_deps.ps1"; exit 2 }

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
