param(
  [ValidateSet("Doctor", "ShowCommands", "EnsureVenv", "ProbePythonVoiceDeps", "InstallPythonVoiceDeps")]
  [string]$Action = "Doctor",
  [string]$PipIndexUrl = "",
  [int]$PipGroupTimeoutSeconds = 300,
  [switch]$StrictInstall
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Parent = Split-Path -Parent $Root
$VenvRoot = Join-Path $Root "services\brain\.venv"
$VenvPython = Join-Path $VenvRoot "Scripts\python.exe"
$RequirementsPath = Join-Path $Root "services\brain\requirements.txt"
$SnapshotRoot = Join-Path $Parent "models\huggingface\snapshots"
$KokoroPath = Join-Path $SnapshotRoot "hexgrad__Kokoro-82M"
$OmniVoicePath = Join-Path $SnapshotRoot "k2-fsa__OmniVoice"
$PiperPath = Join-Path $Parent "tools\piper"
$VoskPath = Join-Path $Parent "models\vosk"
$WakePath = Join-Path $Parent "models\wake-word"

$CorePythonPackages = @(
  "transformers",
  "torch",
  "accelerate",
  "sentencepiece",
  "soundfile",
  "Pillow"
)

$OptionalPythonPackages = @(
  "webrtcvad",
  "silero-vad",
  "pvporcupine",
  "vosk"
)

$PythonPackages = @($CorePythonPackages + $OptionalPythonPackages)

function Test-CommandAvailable {
  param([string]$Command)
  $found = Get-Command $Command -ErrorAction SilentlyContinue
  return [bool]$found
}

function Test-PythonPackage {
  param(
    [string]$PackageName,
    [string]$PythonCommand = (Resolve-JarvisPython)
  )
  if (-not $PythonCommand) {
    return $false
  }
  & $PythonCommand -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('$PackageName') else 1)" *> $null
  return $LASTEXITCODE -eq 0
}

function Resolve-JarvisPython {
  if ($env:JARVIS_PYTHON -and (Test-Path -LiteralPath $env:JARVIS_PYTHON)) {
    return $env:JARVIS_PYTHON
  }
  if (Test-Path -LiteralPath $VenvPython) {
    return $VenvPython
  }
  if (Test-CommandAvailable "python") {
    return "python"
  }
  return $null
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
  $pythonCommand = Resolve-JarvisPython
  $python = if ($pythonCommand) { (& $pythonCommand --version 2>&1 | Out-String).Trim() } else { "missing" }
  $hf = if (Test-CommandAvailable "hf") { "present" } else { "missing" }
  $hfToken = if ($env:HF_TOKEN) { "set" } else { "not set" }

  $packageRows = $PythonPackages | ForEach-Object {
    [pscustomobject]@{
      package = $_
      status = if (Test-PythonPackage -PackageName $_ -PythonCommand $pythonCommand) { "ready" } else { "missing" }
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
    pythonCommand = if ($pythonCommand) { $pythonCommand } else { "missing" }
    venvPath = $VenvRoot
    venvStatus = if (Test-Path -LiteralPath $VenvPython) { "ready" } else { "missing" }
    hfCli = $hf
    hfToken = $hfToken
    tokenPolicy = "HF_TOKEN is only detected as set/not-set; token values are never printed or stored."
    packages = $packageRows
    folders = $folderRows
    next = if (Test-Path -LiteralPath $VenvPython) { "Run scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps after approval." } else { "Run scripts\setup-voice-runtime.ps1 -Action EnsureVenv to create the local Jarvis Python runtime." }
  } | ConvertTo-Json -Depth 5
}

function Write-Commands {
  [pscustomobject]@{
    action = "ShowCommands"
    tokenPolicy = "Set HF_TOKEN in your user environment or Jarvis vault. Do not paste tokens into commands, code, commits, or logs."
    ensureVenv = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action EnsureVenv"
    pythonVoiceDeps = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps"
    requirements = $RequirementsPath
    kokoro = "hf download hexgrad/Kokoro-82M --local-dir `"$KokoroPath`""
    omniVoice = "hf download k2-fsa/OmniVoice --local-dir `"$OmniVoicePath`""
    piper = "Place piper.exe under `"$PiperPath`" and at least one ONNX voice plus JSON config under `"$PiperPath\voices`"."
    vosk = "Extract a Vosk model under `"$VoskPath`"."
    wakeWord = "Install pvporcupine or place a local Vosk wake profile under `"$WakePath`"; enable mic capture only after Jarvis approval."
  } | ConvertTo-Json -Depth 4
}

function Ensure-Venv {
  if (Test-Path -LiteralPath $VenvPython) {
    Write-Doctor
    return
  }
  if (-not (Test-CommandAvailable "python")) {
    throw "Python is not available on PATH; cannot create services\brain\.venv."
  }
  & python -m venv $VenvRoot
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  & $VenvPython -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  Write-Doctor
}

function Invoke-PipInstallGroup {
  param(
    [string]$Group,
    [string[]]$Packages,
    [bool]$Required
  )

  $args = @("-m", "pip", "install", "--timeout", "60", "--retries", "5")
  if ($PipIndexUrl.Trim().Length -gt 0) {
    $args += @("--index-url", $PipIndexUrl)
  }
  $args += $Packages

  $job = Start-Job -ScriptBlock {
    param(
      [string]$PythonPath,
      [string[]]$PipArgs
    )
    $ErrorActionPreference = "Continue"
    $output = & $PythonPath @PipArgs 2>&1 | Out-String
    [pscustomobject]@{
      output = $output
      exitCode = $LASTEXITCODE
    }
  } -ArgumentList $VenvPython, $args

  $completed = Wait-Job -Job $job -Timeout $PipGroupTimeoutSeconds
  if (-not $completed) {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    $output = "pip install group '$Group' exceeded ${PipGroupTimeoutSeconds}s and was stopped. Rerun later or pass a trusted -PipIndexUrl."
    $exitCode = 124
  } else {
    $result = Receive-Job -Job $job
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    $output = ($result.output | Out-String)
    $exitCode = [int]$result.exitCode
  }

  [pscustomobject]@{
    group = $Group
    required = $Required
    status = if ($exitCode -eq 0) { "installed" } elseif ($Required) { "failed" } else { "attention" }
    exitCode = $exitCode
    packages = $Packages
    log = ($output -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -Last 30)
  }
}

if ($Action -eq "Doctor" -or $Action -eq "ProbePythonVoiceDeps") {
  Write-Doctor
  exit 0
}

if ($Action -eq "ShowCommands") {
  Write-Commands
  exit 0
}

if ($Action -eq "EnsureVenv") {
  Ensure-Venv
  exit 0
}

if ($Action -eq "InstallPythonVoiceDeps") {
  if (-not (Test-Path -LiteralPath $VenvPython)) {
    Ensure-Venv
  }
  $results = @(
    Invoke-PipInstallGroup -Group "core-stt-tts" -Packages $CorePythonPackages -Required $true
    Invoke-PipInstallGroup -Group "optional-streaming-wake" -Packages $OptionalPythonPackages -Required $false
  )
  $doctor = Write-Doctor | ConvertFrom-Json
  $failedRequired = @($results | Where-Object { $_.required -and $_.status -eq "failed" })
  $summary = [pscustomobject]@{
    action = "InstallPythonVoiceDeps"
    status = if ($failedRequired.Count -gt 0) { "attention" } else { "ready" }
    strict = [bool]$StrictInstall
    python = $doctor.python
    pythonCommand = $doctor.pythonCommand
    venvPath = $VenvRoot
    results = $results
    doctor = $doctor
    next = if ($failedRequired.Count -gt 0) {
      "Core packages could not be installed. Check network/PyPI access, then rerun this action. You may pass -PipIndexUrl to use a trusted mirror."
    } else {
      "Core packages are installed. Optional wake/VAD/Vosk packages can be retried later if any remain missing."
    }
  }
  $summary | ConvertTo-Json -Depth 8
  if ($StrictInstall -and $failedRequired.Count -gt 0) {
    exit 1
  }
  exit 0
}
