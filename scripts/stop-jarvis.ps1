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

function Stop-CommandLineMatch {
  param(
    [string]$Name,
    [string[]]$Patterns
  )

  $currentPid = $PID
  $matches = @(Get-CimInstance Win32_Process | Where-Object {
    if ($_.ProcessId -eq $currentPid -or $_.Name -eq "powershell.exe" -or -not $_.CommandLine) {
      return $false
    }
    foreach ($pattern in $Patterns) {
      if ($_.CommandLine -like $pattern) {
        return $true
      }
    }
    return $false
  })

  foreach ($match in $matches) {
    if ($CheckOnly) {
      Write-Host "Would stop stale $Name process $($match.Name) (PID $($match.ProcessId))."
      continue
    }
    Stop-ProcessTree -ProcessId $match.ProcessId
    Write-Host "Stopped stale $Name process $($match.Name) (PID $($match.ProcessId))."
  }
}

function Stop-PortOwner {
  param(
    [string]$Name,
    [int]$Port
  )

  $owners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -eq 0) {
    Write-Host "$Name port $Port is free."
    return
  }

  foreach ($owner in $owners) {
    $process = Get-Process -Id $owner -ErrorAction SilentlyContinue
    if (-not $process) {
      continue
    }
    if ($CheckOnly) {
      Write-Host "Would stop $Name port owner $($process.ProcessName) (PID $owner) on port $Port."
      continue
    }
    try {
      Stop-Process -Id $owner -Force
      Write-Host "Stopped $Name port owner $($process.ProcessName) (PID $owner) on port $Port."
    } catch {
      Write-Host "Unable to stop ${Name} port owner on ${Port}: $($_.Exception.Message)"
    }
  }
}

Invoke-EmergencyStop

Stop-CommandLineMatch -Name "Brain" -Patterns @(
  "*services\brain\brain_server.py*",
  "*services/brain/brain_server.py*"
)

Stop-CommandLineMatch -Name "Gateway" -Patterns @(
  "*services\gateway\dist\server.js*",
  "*services/gateway/dist/server.js*"
)

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

Stop-PortOwner -Name "Gateway" -Port $GatewayPort
Stop-PortOwner -Name "Brain" -Port 5000
Stop-PortOwner -Name "Dashboard" -Port 5174
Stop-PortOwner -Name "HUD renderer" -Port 5175

Write-Host "Jarvis local service stop requested."
