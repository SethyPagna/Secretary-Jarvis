param(
  [ValidateSet("Menu", "Start", "Stop", "Restart", "Verify", "SelfTest", "InstallShortcuts", "RegisterStartup", "UnregisterStartup", "OpenDashboard")]
  [string]$Action = "Menu",
  [switch]$CheckOnly,
  [switch]$StopOllama,
  [switch]$NoCleanStart
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$GatewayUrl = "http://127.0.0.1:4317"

function Invoke-JarvisAction {
  param([string]$SelectedAction)

  $checkOnlyArgs = @()
  if ($CheckOnly) {
    $checkOnlyArgs += "-CheckOnly"
  }

  switch ($SelectedAction) {
    "Start" {
      if (-not $NoCleanStart) {
        Write-Host "Cleaning old Jarvis app processes before start..."
        Invoke-JarvisAction "Stop"
        Start-Sleep -Seconds 1
      }
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-jarvis.ps1") @checkOnlyArgs
    }
    "Stop" {
      $stopArgs = @()
      if (-not $StopOllama) {
        $stopArgs += "-KeepOllama"
      }
      $stopArgs += $checkOnlyArgs
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "stop-jarvis.ps1") @stopArgs
    }
    "Restart" {
      Invoke-JarvisAction "Stop"
      Start-Sleep -Seconds 2
      Invoke-JarvisAction "Start"
    }
    "Verify" {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "verify-jarvis.ps1") -CheckOnlyServices
    }
    "SelfTest" {
      Show-SelfTest
    }
    "InstallShortcuts" {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "install-shortcuts.ps1") -All @checkOnlyArgs
    }
    "RegisterStartup" {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "register-startup-task.ps1") @checkOnlyArgs
    }
    "UnregisterStartup" {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "register-startup-task.ps1") -Unregister @checkOnlyArgs
    }
    "OpenDashboard" {
      if ($CheckOnly) {
        Write-Host "Would open dashboard: http://127.0.0.1:5174"
      } else {
        Start-Process "http://127.0.0.1:5174"
      }
    }
    default {
      Show-Menu
    }
  }
}

function Show-SelfTest {
  $uri = "$GatewayUrl/api/runtime/self-test"
  if ($CheckOnly) {
    Write-Host "Would request runtime self-test: $uri"
    return
  }

  try {
    $payload = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 4
    $summary = $payload.selfTest.summary
    Write-Host "Jarvis self-test: $($summary.topStatus)"
    Write-Host "Ready: $($summary.ready)  Attention: $($summary.attention)  Blocked: $($summary.blocked)  Staged: $($summary.staged)"
    foreach ($fix in ($payload.selfTest.fixes | Select-Object -First 4)) {
      Write-Host "Fix: $($fix.label) [$($fix.status)]"
    }
  } catch {
    Write-Host "Gateway self-test is unavailable. Start Jarvis first, then try SelfTest again."
    Write-Host "Endpoint: $uri"
  }
}

function Show-Menu {
  Write-Host ""
  Write-Host "Jarvis Control"
  Write-Host "=============="
  Write-Host "1. Start Jarvis"
  Write-Host "2. Stop Jarvis"
  Write-Host "3. Restart Jarvis"
  Write-Host "4. Verify Jarvis"
  Write-Host "5. Runtime self-test"
  Write-Host "6. Install Desktop and Start Menu shortcuts"
  Write-Host "7. Register Jarvis at Windows startup"
  Write-Host "8. Remove Jarvis startup"
  Write-Host "9. Open dashboard"
  Write-Host "0. Exit"
  $choice = Read-Host "Choose"
  $map = @{
    "1" = "Start"
    "2" = "Stop"
    "3" = "Restart"
    "4" = "Verify"
    "5" = "SelfTest"
    "6" = "InstallShortcuts"
    "7" = "RegisterStartup"
    "8" = "UnregisterStartup"
    "9" = "OpenDashboard"
  }
  if ($choice -eq "0") {
    return
  }
  if ($map.ContainsKey($choice)) {
    Invoke-JarvisAction $map[$choice]
  } else {
    Write-Host "No action selected."
  }
}

Set-Location -LiteralPath $Root
Invoke-JarvisAction $Action
