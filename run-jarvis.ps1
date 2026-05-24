param(
    [ValidateSet("auto", "llamacpp", "vllm", "ollama")]
    [string]$DockerProfile = "auto",
    [switch]$NoDocker,
    [switch]$NoVoice,
    [switch]$Dev,
    [switch]$NoTray
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $RepoRoot

try {
    if ($NoDocker) {
        $env:JARVIS_DOCKER_AUTOSTART = "0"
    }
    else {
        $env:JARVIS_DOCKER_AUTOSTART = "1"
        $env:JARVIS_DOCKER_PROFILE = $DockerProfile
        $env:JARVIS_DOCKER_INCLUDE_VOICE = if ($NoVoice) { "0" } else { "1" }
    }

    if (-not $NoTray) {
        $env:JARVIS_MINIMIZE_TO_TRAY = "1"
    }

    $env:JARVIS_DISABLE_LAZY_INSTALLS = "1"

    $exeCandidates = @(
        (Join-Path $RepoRoot "release/win-unpacked/JARVIS.exe"),
        (Join-Path $RepoRoot "release/win-unpacked/Jarvis.exe")
    )
    $desktopExe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($desktopExe -and -not $Dev) {
        Write-Host "Starting JARVIS desktop package..."
        Start-Process -FilePath $desktopExe -WorkingDirectory (Split-Path -Parent $desktopExe)
        return
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        $npm = Get-Command npm -ErrorAction Stop
    }

    Write-Host "Starting JARVIS desktop development shell..."
    & $npm.Source run desktop:dev
    if ($LASTEXITCODE -ne 0) {
        throw "npm run desktop:dev exited with code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
