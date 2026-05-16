param(
  [switch]$NoDashboard,
  [switch]$NoHud,
  [switch]$WithDashboard,
  [switch]$WebPreview,
  [switch]$OpenDashboard,
  [switch]$CheckOnly,
  [switch]$SkipBuild,
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
    [string]$WorkingDirectory
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
    Write-Host "$Name already running (PID $($existing.ProcessId))."
    Set-Content -LiteralPath (Join-Path $RuntimeRoot "$safeName.pid") -Value $existing.ProcessId
    return
  }

  $stdout = Join-Path $LogRoot "$safeName.out.log"
  $stderr = Join-Path $LogRoot "$safeName.err.log"
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Set-Content -LiteralPath (Join-Path $RuntimeRoot "$safeName.pid") -Value $process.Id
  Write-Host "Started $Name (PID $($process.Id))."
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
    Start-JarvisProcess -Name "Electron HUD" -FilePath "cmd.exe" -Arguments "/d /s /c set JARVIS_HUD_MODE=app&& set JARVIS_GATEWAY_URL=http://127.0.0.1:$GatewayPort&& set JARVIS_DASHBOARD_URL=http://127.0.0.1:$DashboardPort&& npm.cmd run start -w @jarvis/hud" -WorkingDirectory $Root
  }
}

if ($OpenDashboard) {
  if ($CheckOnly) {
    Write-Host "Would open dashboard: http://127.0.0.1:$DashboardPort"
  } else {
    Start-Process "http://127.0.0.1:$DashboardPort"
  }
}

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
