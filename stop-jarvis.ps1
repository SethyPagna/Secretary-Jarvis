$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $RepoRoot

try {
    $escapedRepo = [Regex]::Escape((Resolve-Path $RepoRoot).Path)
    $repoParent = Split-Path -Parent $RepoRoot
    $escapedRelease = [Regex]::Escape((Join-Path $RepoRoot "release"))
    $escapedUserData = [Regex]::Escape((Join-Path $env:APPDATA "JARVIS"))
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
            ($exePath -and $exePath -match $escapedRepo) -or
            ($commandLine -and $commandLine -match $escapedRelease) -or
            ($exePath -and $exePath -match $escapedRelease)
        )
        $isPackagedTempProcess = (
            $_.Name -match "^(JARVIS|jarvis-backend)( 1\.0\.0)?\.exe$" -and
            (
                ($commandLine -and $commandLine -match $escapedUserData) -or
                ($commandLine -and $commandLine -match "resources\\app\.asar|resources\\backend\\jarvis-backend") -or
                ($exePath -and $exePath -match "\\AppData\\Local\\Temp\\[^\\]+\\JARVIS\.exe$") -or
                ($exePath -and $exePath -match "\\AppData\\Local\\Temp\\[^\\]+\\resources\\backend\\jarvis-backend\.exe$")
            )
        )
        $isJarvisRuntime = (
            $_.Name -match "^(JARVIS|Jarvis|JARVIS 1\.0\.0|jarvis-backend|electron|node|python)\.exe$" -or
            ($commandLine -and $commandLine -match "jarvis_cli\.desktop_entry|jarvis-backend|electron\\main\.js")
        )
        $isJarvisModelHelper = (
            $_.Name -match "^(llama-server|llama-cli)\.exe$" -and
            $commandLine -and
            (($modelRoots | Where-Object { $commandLine -match $_ }).Count -gt 0)
        )

        return (($isRepoProcess -and $isJarvisRuntime) -or $isPackagedTempProcess -or $isJarvisModelHelper)
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
