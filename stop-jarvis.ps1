param(
    [switch]$KeepDocker
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $RepoRoot

try {
    if (-not $KeepDocker) {
        try {
            & (Join-Path $RepoRoot "scripts/jarvis-docker-models.ps1") stop
        }
        catch {
            Write-Host "Docker stop skipped or failed: $($_.Exception.Message)"
        }
    }

    $escapedRepo = [Regex]::Escape((Resolve-Path $RepoRoot).Path)
    $ownPid = $PID
    $targets = Get-CimInstance Win32_Process | Where-Object {
        if ($_.ProcessId -eq $ownPid) {
            return $false
        }

        $commandLine = $_.CommandLine
        $exePath = $_.ExecutablePath
        $isRepoProcess = (
            ($commandLine -and $commandLine -match $escapedRepo) -or
            ($exePath -and $exePath -match $escapedRepo)
        )
        $isJarvisRuntime = (
            $_.Name -match "^(JARVIS|Jarvis|jarvis-backend|electron|node|python)\.exe$" -or
            ($commandLine -and $commandLine -match "jarvis_cli\.desktop_entry|jarvis-backend|electron\\main\.js")
        )

        return $isRepoProcess -and $isJarvisRuntime
    }

    foreach ($process in $targets) {
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            Write-Host "Stopped $($process.Name) ($($process.ProcessId))"
        }
        catch {
            Write-Host "Could not stop $($process.Name) ($($process.ProcessId)): $($_.Exception.Message)"
        }
    }

    Write-Host "JARVIS owned desktop/runtime processes stopped."
}
finally {
    Pop-Location
}
