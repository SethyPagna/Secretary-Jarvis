param(
    [string]$ModelsDir,
    [switch]$Dev,
    [switch]$NoTray
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $RepoRoot

try {
    if (-not $ModelsDir) {
        $candidateModels = Join-Path (Split-Path -Parent $RepoRoot) "models"
        if (Test-Path $candidateModels) {
            $ModelsDir = $candidateModels
        }
    }

    if ($ModelsDir) {
        $env:JARVIS_MODELS_DIR = (Resolve-Path $ModelsDir).Path
        Write-Host "Using local models: $env:JARVIS_MODELS_DIR"
    }

    if (-not $NoTray) {
        $env:JARVIS_MINIMIZE_TO_TRAY = "1"
    }

    $env:JARVIS_DISABLE_LAZY_INSTALLS = "1"

    $exeCandidates = @(
        (Join-Path $RepoRoot "release/JARVIS 1.0.0.exe"),
        (Join-Path $RepoRoot "release/JARVIS.exe")
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
