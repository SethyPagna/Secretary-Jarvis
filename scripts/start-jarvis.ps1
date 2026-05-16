param(
  [switch]$NoDashboard,
  [switch]$NoHud,
  [switch]$WithDashboard,
  [switch]$WebPreview,
  [switch]$OpenDashboard,
  [switch]$CheckOnly,
  [switch]$SkipBuild,
  [switch]$ReuseExisting,
  [switch]$SkipLiveProbe,
  [switch]$Silent,
  [int]$GatewayPort = 4317,
  [int]$DashboardPort = 5174,
  [int]$HudPort = 5175,
  [int]$BrainPort = 5000
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogRoot = Join-Path $Root "data\logs"
$RuntimeRoot = Join-Path $Root "data\runtime"
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

function Add-SessionPath {
  $paths = @(
    "$env:LOCALAPPDATA\Programs\Ollama",
    "$env:APPDATA\Python\Python313\Scripts",
    "$env:USERPROFILE\.cargo\bin"
  )
  $env:PATH = (($paths + ($env:PATH -split ";")) | Where-Object { $_ } | Select-Object -Unique) -join ";"
}

function Start-JarvisProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [switch]$Visible
  )

  if ($CheckOnly) {
    Write-Host "Would start $Name with: $FilePath $Arguments"
    return
  }

  $safeName = $Name.ToLowerInvariant().Replace(" ", "-")
  $existing = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($Arguments)
  } | Select-Object -First 1

  if ($existing) {
    if ($ReuseExisting) {
      Write-Host "$Name already running (PID $($existing.ProcessId))."
      Set-Content -LiteralPath (Join-Path $RuntimeRoot "$safeName.pid") -Value $existing.ProcessId
      return
    }

    Write-Host "Stopping existing $Name process tree (PID $($existing.ProcessId)) for clean app start..."
    Stop-ProcessTree -ProcessId $existing.ProcessId
    Start-Sleep -Milliseconds 500
  }

  $stdout = Join-Path $LogRoot "$safeName.out.log"
  $stderr = Join-Path $LogRoot "$safeName.err.log"
  $startParams = @{
    FilePath = $FilePath
    ArgumentList = $Arguments
    WorkingDirectory = $WorkingDirectory
    RedirectStandardOutput = $stdout
    RedirectStandardError = $stderr
    PassThru = $true
  }
  if (-not $Visible) {
    $startParams.WindowStyle = "Hidden"
  }
  $process = Start-Process @startParams
  Set-Content -LiteralPath (Join-Path $RuntimeRoot "$safeName.pid") -Value $process.Id
  Write-Host "Started $Name (PID $($process.Id))."
}

function Start-JarvisElectronApp {
  if ($CheckOnly) {
    Write-Host "Would start Electron HUD app visibly with: electron dist-electron/main.js"
    return
  }

  $safeName = "electron-hud"
  $existing = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains("dist-electron/main.js") -and $_.CommandLine.Contains("electron")
  } | Select-Object -First 1
  if ($existing -and $ReuseExisting) {
    Write-Host "Electron HUD already running (PID $($existing.ProcessId))."
    Set-Content -LiteralPath (Join-Path $RuntimeRoot "$safeName.pid") -Value $existing.ProcessId
    return
  }
  if ($existing) {
    Write-Host "Stopping existing Electron HUD process tree (PID $($existing.ProcessId)) for clean app start..."
    Stop-ProcessTree -ProcessId $existing.ProcessId
    Start-Sleep -Milliseconds 500
  }

  $electronExe = Join-Path $Root "node_modules\electron\dist\electron.exe"
  if (-not (Test-Path -LiteralPath $electronExe)) {
    throw "Electron binary is missing at $electronExe. Run npm install before starting Jarvis."
  }

  $env:JARVIS_HUD_MODE = "app"
  $env:JARVIS_WINDOW_MODE = "desktop"
  $env:JARVIS_START_MINIMIZED = if ($Silent) { "1" } else { "0" }
  $env:JARVIS_GATEWAY_URL = "http://127.0.0.1:$GatewayPort"
  $env:JARVIS_DASHBOARD_URL = "http://127.0.0.1:$DashboardPort"
  $process = Start-Process -FilePath $electronExe -ArgumentList "dist-electron/main.js" -WorkingDirectory (Join-Path $Root "apps\hud") -PassThru
  Set-Content -LiteralPath (Join-Path $RuntimeRoot "$safeName.pid") -Value $process.Id
  Write-Host "Started Electron HUD app (PID $($process.Id))."
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-BuildArtifact {
  param(
    [string]$Name,
    [string]$Path,
    [string]$Command
  )

  if ($SkipBuild -or (Test-Path -LiteralPath $Path)) {
    return
  }

  if ($CheckOnly) {
    Write-Host "Would build $Name with: $Command"
    return
  }

  Write-Host "Building $Name for app-mode launch..."
  Push-Location $Root
  try {
    cmd.exe /d /s /c $Command
    if ($LASTEXITCODE -ne 0) {
      throw "$Name build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Wait-HttpJson {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds = 35
  )

  if ($CheckOnly) {
    Write-Host "Would verify $Name at $Url"
    return $null
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 4
      Write-Host "Ready $Name."
      return $response
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds 700
    }
  }

  throw "$Name did not become ready at $Url. Last error: $lastError"
}

function Invoke-LiveTextProbe {
  param([int]$TimeoutSeconds = 90)

  if ($CheckOnly) {
    Write-Host "Would run live text probe through /api/chat."
    return
  }
  if ($SkipLiveProbe) {
    Write-Host "Live text probe skipped by request."
    return
  }

  $chatBody = @{
    message = "Jarvis startup probe: reply in one short sentence that live text is connected."
    taskProfile = "daily-assistant"
  } | ConvertTo-Json -Depth 6
  $chat = Invoke-RestMethod -Uri "http://127.0.0.1:$GatewayPort/api/chat" -Method Post -ContentType "application/json" -Body $chatBody -TimeoutSec 15
  if (-not $chat.task.id) {
    throw "Live text probe did not return a task id."
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $tasks = Invoke-RestMethod -Uri "http://127.0.0.1:$GatewayPort/api/tasks" -Method Get -TimeoutSec 5
    $task = @($tasks.tasks | Where-Object { $_.id -eq $chat.task.id } | Select-Object -First 1)
    if ($task -and $task.status -eq "completed" -and $task.result) {
      $preview = ([string]$task.result).Trim()
      if ($preview.Length -gt 120) {
        $preview = $preview.Substring(0, 120) + "..."
      }
      Write-Host "Live text connected: $preview"
      return
    }
    Start-Sleep -Milliseconds 700
  }

  throw "Live text probe task $($chat.task.id) did not complete in $TimeoutSeconds seconds."
}

Add-SessionPath

Ensure-BuildArtifact -Name "Gateway" -Path (Join-Path $Root "services\gateway\dist\server.js") -Command "npm.cmd run build -w @jarvis/gateway"
if (-not $NoHud -and -not $WebPreview) {
  Ensure-BuildArtifact -Name "Electron HUD" -Path (Join-Path $Root "apps\hud\dist-electron\main.js") -Command "npm.cmd run build -w @jarvis/hud"
  Ensure-BuildArtifact -Name "HUD renderer" -Path (Join-Path $Root "apps\hud\dist\index.html") -Command "npm.cmd run build -w @jarvis/hud"
}

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  $ollama = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ollama.exe" } | Select-Object -First 1
  if (-not $ollama) {
    if ($CheckOnly) {
      Write-Host "Would start Ollama service."
    } else {
      $ollamaProcess = Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -PassThru
      Set-Content -LiteralPath (Join-Path $RuntimeRoot "ollama.pid") -Value $ollamaProcess.Id
      Write-Host "Started Ollama service (PID $($ollamaProcess.Id))."
    }
  } else {
    Write-Host "Ollama already running."
    Set-Content -LiteralPath (Join-Path $RuntimeRoot "ollama.pid") -Value $ollama.ProcessId
  }
} else {
  Write-Host "Ollama is not on PATH. Install/open Ollama before local LLM calls."
}

Start-JarvisProcess -Name "Python Brain" -FilePath "cmd.exe" -Arguments "/d /s /c set JARVIS_BRAIN_PORT=$BrainPort&& python services\brain\brain_server.py" -WorkingDirectory $Root
Start-JarvisProcess -Name "TypeScript Gateway" -FilePath "cmd.exe" -Arguments "/d /s /c set JARVIS_GATEWAY_PORT=$GatewayPort&& set JARVIS_BRAIN_URL=http://127.0.0.1:$BrainPort&& node services\gateway\dist\server.js" -WorkingDirectory $Root

if (($WithDashboard -or $OpenDashboard) -and -not $NoDashboard) {
  Start-JarvisProcess -Name "Dashboard" -FilePath "cmd.exe" -Arguments "/d /s /c npm.cmd run dev:dashboard -- --host 127.0.0.1 --port $DashboardPort" -WorkingDirectory $Root
}

if (-not $NoHud) {
  if ($WebPreview) {
    Start-JarvisProcess -Name "HUD Renderer" -FilePath "cmd.exe" -Arguments "/d /s /c set VITE_JARVIS_GATEWAY_URL=http://127.0.0.1:$GatewayPort&& npm.cmd run dev -w @jarvis/hud -- --host 127.0.0.1 --port $HudPort" -WorkingDirectory $Root
    Start-Sleep -Seconds 2
    Start-JarvisProcess -Name "Electron HUD" -FilePath "cmd.exe" -Arguments "/d /s /c set JARVIS_HUD_URL=http://127.0.0.1:$HudPort&& set JARVIS_GATEWAY_URL=http://127.0.0.1:$GatewayPort&& set JARVIS_DASHBOARD_URL=http://127.0.0.1:$DashboardPort&& npm.cmd run electron -w @jarvis/hud" -WorkingDirectory $Root
  } else {
    Start-JarvisElectronApp
  }
}

if ($OpenDashboard) {
  if ($CheckOnly) {
    Write-Host "Would open dashboard: http://127.0.0.1:$DashboardPort"
  } else {
    Start-Process "http://127.0.0.1:$DashboardPort"
  }
}

Wait-HttpJson -Name "Python Brain" -Url "http://127.0.0.1:$BrainPort/" | Out-Null
Wait-HttpJson -Name "TypeScript Gateway" -Url "http://127.0.0.1:$GatewayPort/" | Out-Null
Wait-HttpJson -Name "Gateway status" -Url "http://127.0.0.1:$GatewayPort/api/status" | Out-Null
Invoke-LiveTextProbe

Write-Host "Jarvis local services requested."
Write-Host "Gateway:   http://127.0.0.1:$GatewayPort"
Write-Host "Brain:     http://127.0.0.1:$BrainPort"
$dashboardState = "optional; use -WithDashboard for browser fallback"
if (($WithDashboard -or $OpenDashboard) -and -not $NoDashboard) {
  $dashboardState = "http://127.0.0.1:$DashboardPort"
}
$hudState = "Electron app-mode"
if ($WebPreview) {
  $hudState = "Electron web-preview with renderer http://127.0.0.1:$HudPort"
}
Write-Host "Dashboard: $dashboardState"
Write-Host "HUD:       $hudState"
