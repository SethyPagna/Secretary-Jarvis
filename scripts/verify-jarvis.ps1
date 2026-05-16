param(
  [switch]$SkipUi,
  [switch]$SkipPython,
  [switch]$CheckOnlyServices
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Command
  Write-Host "PASS $Name" -ForegroundColor Green
}

function Find-Python {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
    "python.exe"
  )

  foreach ($candidate in $candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  return $null
}

Push-Location $Root
try {
  Invoke-Step "Core and gateway unit tests" { npm.cmd test }
  Invoke-Step "Core build" { npm.cmd run build -w "@jarvis/core" }
  Invoke-Step "Gateway build" { npm.cmd run build -w "@jarvis/gateway" }
  Invoke-Step "HUD build" { npm.cmd run build -w "@jarvis/hud" }

  if (-not $SkipUi) {
    Invoke-Step "HUD Playwright UI tests" { npm.cmd run test:ui -w "@jarvis/hud" }
  } else {
    Write-Host "SKIP HUD Playwright UI tests" -ForegroundColor Yellow
  }

  if (-not $SkipPython) {
    $python = Find-Python
    if (-not $python) {
      throw "Python was not found. Install Python or pass -SkipPython."
    }
    Invoke-Step "Python vision sidecar test" { & $python -m unittest services.brain.test_vision }
  } else {
    Write-Host "SKIP Python sidecar tests" -ForegroundColor Yellow
  }

  if ($CheckOnlyServices) {
    Invoke-Step "Startup script check-only" { powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly }
    Invoke-Step "Shutdown script check-only" { powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-jarvis.ps1 -CheckOnly -KeepOllama }
  }

  Write-Host ""
  Write-Host "Jarvis integration verification completed." -ForegroundColor Green
} finally {
  Pop-Location
}
