param(
  [ValidateSet("Doctor", "ShowCommands", "EnsureVenv", "ProbePythonVoiceDeps", "InstallPythonVoiceDeps")]
  [string]$Action = "Doctor",
  [string]$PythonVersion = "3.11",
  [string]$PipIndexUrl = "",
  [string]$TorchIndexUrl = "https://download.pytorch.org/whl/cpu",
  [int]$PipGroupTimeoutSeconds = 300,
  [int]$PipUpgradeTimeoutSeconds = 120,
  [switch]$RecreateVenv,
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
  "accelerate",
  "sentencepiece",
  "soundfile",
  "Pillow"
)

$TorchPythonPackages = @(
  "torch"
)

$OptionalPythonPackages = @(
  "webrtcvad",
  "silero-vad",
  "pvporcupine",
  "vosk"
)

$PythonPackages = @($CorePythonPackages + $TorchPythonPackages + $OptionalPythonPackages)

$PythonImportNames = @{
  "Pillow" = "PIL"
  "silero-vad" = "silero_vad"
}

function Test-CommandAvailable {
  param([string]$Command)
  $found = Get-Command $Command -ErrorAction SilentlyContinue
  return [bool]$found
}

function Test-BasePython {
  if (Test-CommandAvailable "py") {
    & py "-$PythonVersion" --version *> $null
    if ($LASTEXITCODE -eq 0) {
      return $true
    }
  }
  if (Test-CommandAvailable "python") {
    & python --version *> $null
    return $LASTEXITCODE -eq 0
  }
  return $false
}

function Get-BasePythonLabel {
  if (Test-CommandAvailable "py") {
    $version = (& py "-$PythonVersion" --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0) {
      $exe = (& py "-$PythonVersion" -c "import sys; print(sys.executable)" 2>&1 | Out-String).Trim()
      return "py -$PythonVersion ($version, $exe)"
    }
  }
  if (Test-CommandAvailable "python") {
    $version = (& python --version 2>&1 | Out-String).Trim()
    $exe = (& python -c "import sys; print(sys.executable)" 2>&1 | Out-String).Trim()
    return "python ($version, $exe)"
  }
  return "missing"
}

function Invoke-BasePython {
  param([string[]]$Arguments)
  if (Test-CommandAvailable "py") {
    & py "-$PythonVersion" --version *> $null
    if ($LASTEXITCODE -eq 0) {
      & py "-$PythonVersion" @Arguments
      return
    }
  }
  if (Test-CommandAvailable "python") {
    & python @Arguments
    return
  }
  throw "No usable base Python found."
}

function Test-PythonPackage {
  param(
    [string]$PackageName,
    [string]$PythonCommand = (Resolve-JarvisPython)
  )
  if (-not $PythonCommand) {
    return $false
  }
  $importName = if ($PythonImportNames.ContainsKey($PackageName)) { $PythonImportNames[$PackageName] } else { $PackageName }
  & $PythonCommand -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('$importName') else 1)" *> $null
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
  $pip = if ($pythonCommand) { (& $pythonCommand -m pip --version 2>&1 | Out-String).Trim() } else { "missing" }
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
    preferredPythonVersion = $PythonVersion
    basePython = Get-BasePythonLabel
    python = $python
    pip = $pip
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
    recreateVenv = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action EnsureVenv -PythonVersion 3.11 -RecreateVenv"
    pythonVoiceDeps = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps"
    pythonVoiceDepsBounded = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps -PipGroupTimeoutSeconds 300"
    pythonVoiceDepsWithTrustedIndex = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps -PipIndexUrl `"<trusted-index-url>`""
    pythonVoiceDepsWithMirror = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps -PipIndexUrl `"https://pypi.tuna.tsinghua.edu.cn/simple`""
    pythonVoiceDepsStrict = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps -StrictInstall"
    requirements = $RequirementsPath
    kokoro = "hf download hexgrad/Kokoro-82M --local-dir `"$KokoroPath`""
    omniVoice = "hf download k2-fsa/OmniVoice --local-dir `"$OmniVoicePath`""
    piper = "Place piper.exe under `"$PiperPath`" and at least one ONNX voice plus JSON config under `"$PiperPath\voices`"."
    vosk = "Extract a Vosk model under `"$VoskPath`"."
    wakeWord = "Install pvporcupine or place a local Vosk wake profile under `"$WakePath`"; enable mic capture only after Jarvis approval."
  } | ConvertTo-Json -Depth 4
}

function Ensure-Venv {
  if ((Test-Path -LiteralPath $VenvPython) -and -not $RecreateVenv) {
    Write-Doctor
    return
  }
  if (-not (Test-BasePython)) {
    throw "Python is not available; cannot create services\brain\.venv. Install Python $PythonVersion or make python available on PATH."
  }
  if ((Test-Path -LiteralPath $VenvRoot) -and $RecreateVenv) {
    $resolvedVenv = (Resolve-Path -LiteralPath $VenvRoot).Path
    $expectedVenv = Join-Path (Resolve-Path -LiteralPath $Root).Path "services\brain\.venv"
    if ($resolvedVenv -ne $expectedVenv) {
      throw "Refusing to recreate unexpected venv path: $resolvedVenv"
    }
    Remove-Item -LiteralPath $resolvedVenv -Recurse -Force
  }
  Invoke-BasePython -Arguments @("-m", "venv", $VenvRoot)
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  $pipUpgrade = Invoke-PipUpgrade
  if ($pipUpgrade.status -eq "attention") {
    Write-Warning $pipUpgrade.log
  }
  Write-Doctor
}

function Invoke-PipUpgrade {
  $result = Invoke-TimedPythonProcess -Arguments @("-m", "pip", "install", "--upgrade", "pip") -TimeoutSeconds $PipUpgradeTimeoutSeconds -Description "pip upgrade"
  return [pscustomobject]@{
    status = if ([int]$result.exitCode -eq 0) { "ready" } else { "attention" }
    exitCode = [int]$result.exitCode
    log = (($result.output | Out-String) -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -Last 20)
  }
}

function Invoke-TimedPythonProcess {
  param(
    [string[]]$Arguments,
    [int]$TimeoutSeconds,
    [string]$Description
  )

  $stdout = Join-Path $env:TEMP ("jarvis-python-stdout-{0}.log" -f ([guid]::NewGuid().ToString("N")))
  $stderr = Join-Path $env:TEMP ("jarvis-python-stderr-{0}.log" -f ([guid]::NewGuid().ToString("N")))
  $process = Start-Process -FilePath $VenvPython -ArgumentList $Arguments -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
  $timedOut = $false
  try {
    Wait-Process -Id $process.Id -Timeout $TimeoutSeconds -ErrorAction Stop
  } catch {
    $timedOut = $true
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }

  $process.Refresh()
  $outputParts = @()
  if (Test-Path -LiteralPath $stdout) {
    $outputParts += Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $stderr) {
    $outputParts += Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue

  if ($timedOut) {
    $outputParts += "$Description exceeded ${TimeoutSeconds}s and was stopped. Rerun later or pass a trusted -PipIndexUrl."
  }

  [pscustomobject]@{
    output = ($outputParts -join "`n")
    exitCode = if ($timedOut) { 124 } else { [int]$process.ExitCode }
  }
}

function Invoke-PipInstallGroup {
  param(
    [string]$Group,
    [string[]]$Packages,
    [bool]$Required,
    [string]$IndexUrl = $PipIndexUrl
  )

  $args = @("-m", "pip", "install", "--timeout", "60", "--retries", "5")
  if ($IndexUrl.Trim().Length -gt 0) {
    $args += @("--index-url", $IndexUrl)
  }
  $args += $Packages

  $result = Invoke-TimedPythonProcess -Arguments $args -TimeoutSeconds $PipGroupTimeoutSeconds -Description "pip install group '$Group'"
  $output = $result.output
  $exitCode = [int]$result.exitCode

  [pscustomobject]@{
    group = $Group
    required = $Required
    status = if ($exitCode -eq 0) { "installed" } elseif ($Required) { "failed" } else { "attention" }
    exitCode = $exitCode
    indexUrl = if ($IndexUrl.Trim().Length -gt 0) { $IndexUrl } else { "default" }
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
    Invoke-PipInstallGroup -Group "torch-cpu" -Packages $TorchPythonPackages -Required $true -IndexUrl $TorchIndexUrl
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
