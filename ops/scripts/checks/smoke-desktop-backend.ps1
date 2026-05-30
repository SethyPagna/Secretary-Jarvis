param(
    [string]$BackendCommand = "",
    [string[]]$BackendArgs = @(),
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8765,
    [int]$TimeoutSec = 20
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$BaseUrl = "http://${BindHost}:$Port"
$LogId = [Guid]::NewGuid().ToString("N")
$StdoutLog = Join-Path ([IO.Path]::GetTempPath()) "jarvis-backend-smoke-$LogId.out.log"
$StderrLog = Join-Path ([IO.Path]::GetTempPath()) "jarvis-backend-smoke-$LogId.err.log"

if (-not $BackendCommand) {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $candidate = & $pyLauncher.Source -3.11 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $candidate) {
            $BackendCommand = $pyLauncher.Source
            $BackendArgs = @(
                "-3.11",
                "-m",
                "jarvis_cli.desktop_entry",
                "--host",
                $BindHost,
                "--port",
                [string]$Port,
                "--no-open"
            )
            $PreflightArgs = @(
                "-3.11",
                "-m",
                "jarvis_cli.desktop_entry",
                "--preflight",
                "--host",
                $BindHost,
                "--port",
                [string]$Port
            )
        }
    }
    if (-not $BackendCommand) {
        $python = Get-Command python -ErrorAction Stop
        $BackendCommand = $python.Source
    }
}

if (-not $BackendArgs) {
    $BackendArgs = @(
        "-m",
        "jarvis_cli.desktop_entry",
        "--host",
        $BindHost,
        "--port",
        [string]$Port,
        "--no-open"
    )
    $PreflightArgs = @(
        "-m",
        "jarvis_cli.desktop_entry",
        "--preflight",
        "--host",
        $BindHost,
        "--port",
        [string]$Port
    )
}
if (-not $PreflightArgs) {
    $PreflightArgs = @(
        "--preflight",
        "--host",
        $BindHost,
        "--port",
        [string]$Port
    )
}

$PreviousEmbedded = $env:JARVIS_DESKTOP_EMBEDDED
$PreviousLazyInstalls = $env:JARVIS_DISABLE_LAZY_INSTALLS
$PreviousShutdownToken = $env:JARVIS_DESKTOP_SHUTDOWN_TOKEN
$ShutdownToken = "$([Guid]::NewGuid().ToString("N"))$([Guid]::NewGuid().ToString("N"))"
$Process = $null

try {
    $env:JARVIS_DESKTOP_EMBEDDED = "1"
    $env:JARVIS_DESKTOP_SHUTDOWN_TOKEN = $ShutdownToken
    $env:JARVIS_DISABLE_LAZY_INSTALLS = "1"

    $preflight = & $BackendCommand @PreflightArgs
    if ($LASTEXITCODE -ne 0) {
        throw "JARVIS desktop backend preflight failed before launch:`n$preflight"
    }

    $Process = Start-Process `
        -FilePath $BackendCommand `
        -ArgumentList $BackendArgs `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError $StderrLog `
        -WindowStyle Hidden `
        -PassThru

    $Deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
    $Status = $null
    $LastError = $null

    while ([DateTime]::UtcNow -lt $Deadline) {
        if ($Process.HasExited) {
            $stderr = if (Test-Path $StderrLog) { Get-Content -Raw -Path $StderrLog } else { "" }
            throw "JARVIS backend exited before readiness. ExitCode=$($Process.ExitCode)`n$stderr"
        }

        try {
            $Status = Invoke-RestMethod -Uri "$BaseUrl/api/status" -TimeoutSec 2
            break
        }
        catch {
            $LastError = $_
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not $Status) {
        $stderr = if (Test-Path $StderrLog) { Get-Content -Raw -Path $StderrLog } else { "" }
        throw "JARVIS backend did not become ready at $BaseUrl within $TimeoutSec seconds. LastError=$LastError`n$stderr"
    }

    Invoke-RestMethod `
        -Method Post `
        -Uri "$BaseUrl/api/shutdown" `
        -Headers @{"X-Jarvis-Desktop-Shutdown-Token" = $ShutdownToken} `
        -TimeoutSec 5 | Out-Null

    if (-not $Process.WaitForExit(5000)) {
        Stop-Process -Id $Process.Id -Force
        $Process.WaitForExit(5000) | Out-Null
    }

    if (-not $Process.HasExited) {
        throw "JARVIS backend smoke process did not exit after shutdown and stop request."
    }

    Write-Host "JARVIS backend smoke passed at $BaseUrl"
}
finally {
    if ($Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }

    if ($null -eq $PreviousEmbedded) {
        Remove-Item Env:\JARVIS_DESKTOP_EMBEDDED -ErrorAction SilentlyContinue
    }
    else {
        $env:JARVIS_DESKTOP_EMBEDDED = $PreviousEmbedded
    }

    if ($null -eq $PreviousLazyInstalls) {
        Remove-Item Env:\JARVIS_DISABLE_LAZY_INSTALLS -ErrorAction SilentlyContinue
    }
    else {
        $env:JARVIS_DISABLE_LAZY_INSTALLS = $PreviousLazyInstalls
    }

    if ($null -eq $PreviousShutdownToken) {
        Remove-Item Env:\JARVIS_DESKTOP_SHUTDOWN_TOKEN -ErrorAction SilentlyContinue
    }
    else {
        $env:JARVIS_DESKTOP_SHUTDOWN_TOKEN = $PreviousShutdownToken
    }
}
