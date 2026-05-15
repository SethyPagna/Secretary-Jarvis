param(
  [switch]$NoDashboard,
  [switch]$NoHud,
  [switch]$OpenDashboard,
  [int]$GatewayPort = 4317,
  [int]$DashboardPort = 5174
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogRoot = Join-Path $Root "data\logs"
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

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

  $existing = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($Arguments)
  } | Select-Object -First 1

  if ($existing) {
    Write-Host "$Name already running (PID $($existing.ProcessId))."
    return
  }

  $safeName = $Name.ToLowerInvariant().Replace(" ", "-")
  $stdout = Join-Path $LogRoot "$safeName.out.log"
  $stderr = Join-Path $LogRoot "$safeName.err.log"
  Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  Write-Host "Started $Name."
}

Add-SessionPath

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  $ollama = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ollama.exe" } | Select-Object -First 1
  if (-not $ollama) {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Write-Host "Started Ollama service."
  } else {
    Write-Host "Ollama already running."
  }
} else {
  Write-Host "Ollama is not on PATH. Install/open Ollama before local LLM calls."
}

Start-JarvisProcess -Name "Python Brain" -FilePath "python" -Arguments "services\brain\brain_server.py" -WorkingDirectory $Root
Start-JarvisProcess -Name "TypeScript Gateway" -FilePath "cmd.exe" -Arguments "/d /s /c npm.cmd run start:gateway" -WorkingDirectory $Root

if (-not $NoDashboard) {
  Start-JarvisProcess -Name "Dashboard" -FilePath "cmd.exe" -Arguments "/d /s /c npm.cmd run dev:dashboard -- --host 127.0.0.1 --port $DashboardPort" -WorkingDirectory $Root
}

if (-not $NoHud) {
  Start-JarvisProcess -Name "Electron HUD" -FilePath "cmd.exe" -Arguments "/d /s /c npm.cmd run build -w @jarvis/desktop && npm.cmd run hud -w @jarvis/desktop" -WorkingDirectory $Root
}

if ($OpenDashboard) {
  Start-Process "http://127.0.0.1:$DashboardPort"
}

Write-Host "Jarvis local services requested. Gateway: http://127.0.0.1:$GatewayPort"
