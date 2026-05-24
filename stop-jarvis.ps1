$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $RepoRoot

try {
    $escapedRepo = [Regex]::Escape((Resolve-Path $RepoRoot).Path)
    $repoParent = Split-Path -Parent $RepoRoot
    $modelRoots = @(
        (Join-Path $repoParent "models"),
        (Join-Path $HOME ".jarvis\\models")
    ) | ForEach-Object {
        try { [Regex]::Escape((Resolve-Path $_ -ErrorAction Stop).Path) } catch { [Regex]::Escape($_) }
    }
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
        $isJarvisModelHelper = (
            $_.Name -match "^(llama-server|llama-cli)\.exe$" -and
            $commandLine -and
            (($modelRoots | Where-Object { $commandLine -match $_ }).Count -gt 0)
        )

        return (($isRepoProcess -and $isJarvisRuntime) -or $isJarvisModelHelper)
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
