param(
  [ValidateSet("Doctor", "ShowCommands", "ProbePythonVoiceDeps", "InstallPythonVoiceDeps")]
  [string]$Action = "Doctor"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Parent = Split-Path -Parent $Root
$SnapshotRoot = Join-Path $Parent "models\huggingface\snapshots"
$KokoroPath = Join-Path $SnapshotRoot "hexgrad__Kokoro-82M"
$OmniVoicePath = Join-Path $SnapshotRoot "k2-fsa__OmniVoice"
$PiperPath = Join-Path $Parent "tools\piper"
$VoskPath = Join-Path $Parent "models\vosk"
$WakePath = Join-Path $Parent "models\wake-word"

$PythonPackages = @(
  "transformers",
  "torch",
  "accelerate",
  "sentencepiece",
  "soundfile",
  "webrtcvad",
  "vosk"
)

function Test-CommandAvailable {
  param([string]$Command)
  $found = Get-Command $Command -ErrorAction SilentlyContinue
  return [bool]$found
}

function Test-PythonPackage {
  param([string]$PackageName)
  if (-not (Test-CommandAvailable "python")) {
    return $false
  }
  & python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('$PackageName') else 1)" *> $null
  return $LASTEXITCODE -eq 0
}

function Get-FolderState {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return "missing"
  }
  $files = Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue
  if (($files | Measure-Object).Count -eq 0) {
    return "empty"
  }
  return "present"
}

function Write-Doctor {
  $python = if (Test-CommandAvailable "python") { (& python --version 2>&1 | Out-String).Trim() } else { "missing" }
  $hf = if (Test-CommandAvailable "hf") { "present" } else { "missing" }
  $hfToken = if ($env:HF_TOKEN) { "set" } else { "not set" }

  $packageRows = $PythonPackages | ForEach-Object {
    [pscustomobject]@{
      package = $_
      status = if (Test-PythonPackage $_) { "ready" } else { "missing" }
    }
  }

  $folderRows = @(
    [pscustomobject]@{ id = "kokoro"; path = $KokoroPath; status = Get-FolderState $KokoroPath },
    [pscustomobject]@{ id = "omnivoice"; path = $OmniVoicePath; status = Get-FolderState $OmniVoicePath },
    [pscustomobject]@{ id = "piper"; path = $PiperPath; status = Get-FolderState $PiperPath },
    [pscustomobject]@{ id = "vosk"; path = $VoskPath; status = Get-FolderState $VoskPath },
    [pscustomobject]@{ id = "wake-word"; path = $WakePath; status = Get-FolderState $WakePath }
  )

  [pscustomobject]@{
    action = "Doctor"
    python = $python
    hfCli = $hf
    hfToken = $hfToken
    tokenPolicy = "HF_TOKEN is only detected as set/not-set; token values are never printed or stored."
    packages = $packageRows
    folders = $folderRows
    next = "Run scripts\setup-voice-runtime.ps1 -Action ShowCommands for safe setup previews."
  } | ConvertTo-Json -Depth 5
}

function Write-Commands {
  [pscustomobject]@{
    action = "ShowCommands"
    tokenPolicy = "Set HF_TOKEN in your user environment or Jarvis vault. Do not paste tokens into commands, code, commits, or logs."
    pythonVoiceDeps = "python -m pip install transformers torch accelerate sentencepiece soundfile webrtcvad vosk"
    kokoro = "hf download hexgrad/Kokoro-82M --local-dir `"$KokoroPath`""
    omniVoice = "hf download k2-fsa/OmniVoice --local-dir `"$OmniVoicePath`""
    piper = "Place piper.exe under `"$PiperPath`" and at least one ONNX voice plus JSON config under `"$PiperPath\voices`"."
    vosk = "Extract a Vosk model under `"$VoskPath`"."
    wakeWord = "Install pvporcupine or place a local Vosk wake profile under `"$WakePath`"; enable mic capture only after Jarvis approval."
  } | ConvertTo-Json -Depth 4
}

if ($Action -eq "Doctor" -or $Action -eq "ProbePythonVoiceDeps") {
  Write-Doctor
  exit 0
}

if ($Action -eq "ShowCommands") {
  Write-Commands
  exit 0
}

if ($Action -eq "InstallPythonVoiceDeps") {
  if (-not (Test-CommandAvailable "python")) {
    throw "Python is not available on PATH."
  }
  & python -m pip install transformers torch accelerate sentencepiece soundfile webrtcvad vosk
  exit $LASTEXITCODE
}
