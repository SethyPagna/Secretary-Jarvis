param(
  [switch]$CheckOnly,
  [switch]$KeepOllama,
  [int]$GatewayPort = 4317
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $Root "data\runtime"
$LogRoot = Join-Path $Root "data\logs"
New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

function Invoke-EmergencyStop {
  $uri = "http://127.0.0.1:$GatewayPort/api/emergency-stop"
  if ($CheckOnly) {
    Write-Host "Would notify gateway emergency stop: $uri"
    return
  }

  try {
    Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json" -Body '{"reason":"Graceful shutdown from stop-jarvis.ps1"}' | Out-Null
    Write-Host "Gateway emergency stop recorded."
  } catch {
    Write-Host "Gateway emergency stop was unavailable; continuing local process stop."
  }
}

function Stop-PidFile {
  param(
    [string]$Name,
    [string]$PidFile
  )

  if (-not (Test-Path -LiteralPath $PidFile)) {
    Write-Host "$Name pid file not present."
    return
  }

  $pidText = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $processId = 0
  if (-not [int]::TryParse($pidText, [ref]$processId)) {
    Write-Host "$Name pid file is invalid: $PidFile"
    return
  }

  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-Host "$Name already stopped."
    if (-not $CheckOnly) {
      Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
    return
  }

  if ($CheckOnly) {
    Write-Host "Would stop $Name (PID $processId)."
    return
  }

  try {
    if ($process.MainWindowHandle -ne 0) {
      $null = $process.CloseMainWindow()
      Start-Sleep -Milliseconds 900
      $process.Refresh()
    }
    if (-not $process.HasExited) {
      Stop-Process -Id $processId -Force
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped $Name."
  } catch {
    Write-Host "Unable to stop ${Name}: $($_.Exception.Message)"
  }
}

Invoke-EmergencyStop

$ordered = @(
  "electron-hud",
  "hud-renderer",
  "dashboard",
  "typescript-gateway",
  "python-brain"
)

foreach ($name in $ordered) {
  Stop-PidFile -Name $name -PidFile (Join-Path $RuntimeRoot "$name.pid")
}

if (-not $KeepOllama) {
  Stop-PidFile -Name "ollama" -PidFile (Join-Path $RuntimeRoot "ollama.pid")
}

Write-Host "Jarvis local service stop requested."
