param(
  [ValidateSet("Menu", "Start", "Stop", "Restart", "Verify", "LiveTest", "RegisterStartup", "UnregisterStartup", "Status")]
  [string]$Action = "Menu",
  [switch]$CheckOnly,
  [switch]$StopOllama,
  [switch]$StandardStartup,
  [switch]$Silent,
  [switch]$NoDashboard,
  [switch]$NoHud,
  [string]$TaskName = "Secretary Jarvis Local Runtime",
  [int]$GatewayPort = 4317
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$GatewayUrl = "http://127.0.0.1:$GatewayPort"
$RuntimeRoot = Join-Path $Root "data\runtime"
New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

$RuntimeMutex = New-Object System.Threading.Mutex($false, "Local\SecretaryJarvisRuntimeSupervisor")
$RuntimeMutexAcquired = $false

function Invoke-JarvisRuntimeAction {
  param([string]$SelectedAction)

  switch ($SelectedAction) {
    "Start" {
      if ((Test-JarvisRuntimeReady) -and -not $CheckOnly) {
        Write-Host "Jarvis already running. Focusing the existing HUD instead of starting a duplicate."
        Invoke-FocusExistingHud
        return
      }
      Invoke-Stop -Quiet
      $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "start-jarvis.ps1"), "-GatewayPort", "$GatewayPort")
      if ($CheckOnly) { $args += "-CheckOnly" }
      if ($Silent) { $args += "-Silent" }
      if ($NoDashboard) { $args += "-NoDashboard" }
      if ($NoHud) { $args += "-NoHud" }
      & powershell.exe @args
    }
    "Stop" {
      Invoke-Stop
    }
    "Restart" {
      Invoke-Stop
      Start-Sleep -Seconds 1
      Invoke-JarvisRuntimeAction "Start"
    }
    "Verify" {
      $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "verify-jarvis.ps1"), "-CheckOnlyServices")
      & powershell.exe @args
    }
    "LiveTest" {
      Invoke-LiveTest
    }
    "RegisterStartup" {
      Invoke-RegisterStartup -UseStandard:$StandardStartup
    }
    "UnregisterStartup" {
      $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "register-startup-task.ps1"), "-Unregister", "-TaskName", $TaskName)
      if ($CheckOnly) { $args += "-CheckOnly" }
      & powershell.exe @args
    }
    "Status" {
      Invoke-Status
    }
    default {
      Show-Menu
    }
  }
}

function Invoke-Stop {
  param([switch]$Quiet)

  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "stop-jarvis.ps1"), "-GatewayPort", "$GatewayPort", "-SkipEmergencyStop")
  if (-not $StopOllama) { $args += "-KeepOllama" }
  if ($CheckOnly) { $args += "-CheckOnly" }
  if (-not $Quiet) {
    Write-Host "Stopping Jarvis runtime..."
  }
  & powershell.exe @args
}

function Invoke-RegisterStartup {
  param([switch]$UseStandard)

  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "register-startup-task.ps1"), "-TaskName", $TaskName)
  if (-not $UseStandard) { $args += "-Elevated" }
  if ($CheckOnly) { $args += "-CheckOnly" }
  & powershell.exe @args
}

function Invoke-LiveTest {
  if ($CheckOnly) {
    Write-Host "Would run Jarvis production live test: POST $GatewayUrl/api/runtime/live-test"
    return
  }
  try {
    $payload = Invoke-RestMethod -Uri "$GatewayUrl/api/runtime/live-test" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 120
    $test = $payload.liveTest
    Write-Host "Jarvis live test: $($test.status)"
    Write-Host $test.message
    foreach ($check in $test.checks) {
      $flag = if ($check.ok) { "PASS" } else { "FAIL" }
      Write-Host "$flag $($check.name): $($check.detail)"
    }
  } catch {
    Write-Host "Jarvis live test failed or Gateway is unavailable."
    Write-Host $_.Exception.Message
    exit 1
  }
}

function Invoke-Status {
  if ($CheckOnly) {
    Write-Host "Would inspect Jarvis runtime status: GET $GatewayUrl/api/runtime/services"
    return
  }
  try {
    $payload = Invoke-RestMethod -Uri "$GatewayUrl/api/runtime/services" -Method Get -TimeoutSec 8
    $summary = $payload.runtime.summary
    Write-Host "Jarvis services: $($summary.online) online, $($summary.degraded) degraded, $($summary.offline) offline"
    foreach ($service in $payload.runtime.services) {
      Write-Host "$($service.label): $($service.status) PID=$($service.pid)"
    }
  } catch {
    Write-Host "Gateway status is unavailable. Use Start or Verify."
  }
}

function Test-JarvisRuntimeReady {
  $electronPidFile = Join-Path $RuntimeRoot "electron-hud.pid"
  if (-not (Test-Path -LiteralPath $electronPidFile)) {
    return $false
  }
  $pidText = Get-Content -LiteralPath $electronPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  $processId = 0
  if (-not [int]::TryParse($pidText, [ref]$processId)) {
    return $false
  }
  if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    return $false
  }
  try {
    Invoke-RestMethod -Uri "$GatewayUrl/api/status" -Method Get -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Invoke-FocusExistingHud {
  $electronExe = Join-Path $Root "node_modules\electron\dist\electron.exe"
  $mainScript = Join-Path $Root "apps\hud\dist-electron\main.js"
  if ((Test-Path -LiteralPath $electronExe) -and (Test-Path -LiteralPath $mainScript)) {
    $env:JARVIS_HUD_MODE = "app"
    $env:JARVIS_WINDOW_MODE = "desktop"
    $env:JARVIS_START_MINIMIZED = "0"
    $env:JARVIS_GATEWAY_URL = $GatewayUrl
    Start-Process -FilePath $electronExe -ArgumentList "dist-electron/main.js" -WorkingDirectory (Join-Path $Root "apps\hud") -WindowStyle Hidden | Out-Null
  }
}

function Show-Menu {
  Write-Host ""
  Write-Host "Jarvis Runtime"
  Write-Host "=============="
  Write-Host "1. Start Jarvis"
  Write-Host "2. Stop Jarvis"
  Write-Host "3. Restart Jarvis"
  Write-Host "4. Verify Jarvis"
  Write-Host "5. Production live test"
  Write-Host "6. Runtime status"
  Write-Host "7. Register elevated startup"
  Write-Host "8. Register standard startup"
  Write-Host "9. Remove startup"
  Write-Host "0. Exit"
  $choice = Read-Host "Choose"
  $map = @{
    "1" = "Start"
    "2" = "Stop"
    "3" = "Restart"
    "4" = "Verify"
    "5" = "LiveTest"
    "6" = "Status"
    "7" = "RegisterStartup"
    "9" = "UnregisterStartup"
  }
  if ($choice -eq "0") { return }
  if ($choice -eq "8") {
    Invoke-RegisterStartup -UseStandard
    return
  }
  if ($map.ContainsKey($choice)) {
    Invoke-JarvisRuntimeAction $map[$choice]
    return
  }
  Write-Host "No action selected."
}

Set-Location -LiteralPath $Root
try {
  $RuntimeMutexAcquired = $RuntimeMutex.WaitOne(0)
  if (-not $RuntimeMutexAcquired) {
    Write-Host "Another Jarvis runtime supervisor action is already running. Try again after it finishes."
    exit 2
  }
  Invoke-JarvisRuntimeAction $Action
} finally {
  if ($RuntimeMutexAcquired) {
    $RuntimeMutex.ReleaseMutex()
  }
  $RuntimeMutex.Dispose()
}
