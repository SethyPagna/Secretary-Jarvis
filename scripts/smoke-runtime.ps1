param(
  [switch]$SkipBuild,
  [int]$GatewayPort = 5317,
  [int]$BrainPort = 5100,
  [int]$HudPort = 5176
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogRoot = Join-Path $Root "data\logs"
$SmokeRoot = Join-Path $Root "data\smoke"
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
New-Item -ItemType Directory -Force -Path $SmokeRoot | Out-Null

$Started = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
$Results = New-Object System.Collections.Generic.List[object]

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

function Start-SmokeProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string]$Arguments
  )

  $safeName = $Name.ToLowerInvariant().Replace(" ", "-")
  $stdout = Join-Path $LogRoot "$safeName.smoke.out.log"
  $stderr = Join-Path $LogRoot "$safeName.smoke.err.log"
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  $Started.Add($process)
  Write-Host "Started $Name (PID $($process.Id))."
  return $process
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

function Wait-HttpJson {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      $entry = [ordered]@{
        name = $Name
        url = $Url
        ok = $true
        statusCode = [int]$response.StatusCode
        bytes = $response.RawContentLength
      }
      $Results.Add([pscustomobject]$entry)
      Write-Host "Ready $Name $Url" -ForegroundColor Green
      return $response
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds 700
    }
  }

  $Results.Add([pscustomobject]@{
    name = $Name
    url = $Url
    ok = $false
    error = $lastError
  })
  throw "$Name did not become ready at $Url. Last error: $lastError"
}

Push-Location $Root
try {
  if (-not $SkipBuild) {
    Invoke-Step "Build core" { npm.cmd run build -w "@jarvis/core" }
    Invoke-Step "Build gateway" { npm.cmd run build -w "@jarvis/gateway" }
    Invoke-Step "Build HUD" { npm.cmd run build -w "@jarvis/hud" }
  }

  $python = Find-Python
  if (-not $python) {
    throw "Python was not found. Install Python before running the runtime smoke."
  }

  Invoke-Step "Start Python Brain" {
    Start-SmokeProcess -Name "Python Brain" -FilePath "cmd.exe" -Arguments "/d /s /c set JARVIS_BRAIN_PORT=$BrainPort&& `"$python`" services\brain\brain_server.py" | Out-Null
  }
  Wait-HttpJson -Name "Python Brain health" -Url "http://127.0.0.1:$BrainPort/health" | Out-Null

  Invoke-Step "Start TypeScript Gateway" {
    Start-SmokeProcess -Name "TypeScript Gateway" -FilePath "cmd.exe" -Arguments "/d /s /c set JARVIS_GATEWAY_PORT=$GatewayPort&& set JARVIS_BRAIN_URL=http://127.0.0.1:$BrainPort&& node services\gateway\dist\server.js" | Out-Null
  }
  Wait-HttpJson -Name "Gateway status" -Url "http://127.0.0.1:$GatewayPort/api/status" | Out-Null
  Wait-HttpJson -Name "Gateway voice readiness" -Url "http://127.0.0.1:$GatewayPort/api/voice/readiness" | Out-Null
  Wait-HttpJson -Name "Gateway vision readiness" -Url "http://127.0.0.1:$GatewayPort/api/vision/readiness" | Out-Null

  Invoke-Step "Start HUD renderer" {
    Start-SmokeProcess -Name "HUD Renderer" -FilePath "cmd.exe" -Arguments "/d /s /c set VITE_JARVIS_GATEWAY_URL=http://127.0.0.1:$GatewayPort&& npm.cmd run dev -w @jarvis/hud -- --host 127.0.0.1 --port $HudPort" | Out-Null
  }
  Wait-HttpJson -Name "HUD renderer" -Url "http://127.0.0.1:$HudPort/" | Out-Null

  $summary = [ordered]@{
    ok = $true
    createdAt = (Get-Date).ToString("o")
    ports = @{
      gateway = $GatewayPort
      brain = $BrainPort
      hud = $HudPort
    }
    checks = $Results
  }
  $summaryPath = Join-Path $SmokeRoot "runtime-smoke-latest.json"
  $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
  Write-Host ""
  Write-Host "Jarvis runtime smoke passed. Summary: $summaryPath" -ForegroundColor Green
} finally {
  [array]::Reverse($Started)
  foreach ($process in $Started) {
    Stop-ProcessTree -ProcessId $process.Id
  }
  Pop-Location
}
