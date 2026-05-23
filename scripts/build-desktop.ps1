param(
    [string]$PyInstallerSpec = "packaging/jarvis-backend.spec",
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $RepoRoot

try {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        $npm = Get-Command npm -ErrorAction Stop
    }

    $python = Get-Command python -ErrorAction Stop

    & $python.Source -c "import PyInstaller" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller is not installed. Run: python -m pip install pyinstaller"
    }

    if (-not (Test-Path "web/node_modules")) {
        & $npm.Source --prefix web install
    }

    & $npm.Source --prefix web run build

    $webDist = Join-Path $RepoRoot "web/dist"
    $embeddedDist = Join-Path $RepoRoot "jarvis_cli/web_dist"
    if (Test-Path $embeddedDist) {
        Remove-Item -LiteralPath $embeddedDist -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $embeddedDist | Out-Null
    Copy-Item -Path (Join-Path $webDist "*") -Destination $embeddedDist -Recurse -Force

    & $python.Source -m PyInstaller $PyInstallerSpec --noconfirm --clean

    $backendExe = Join-Path $RepoRoot "dist/jarvis-backend/jarvis-backend.exe"
    $backendBin = Join-Path $RepoRoot "dist/jarvis-backend/jarvis-backend"
    if (-not (Test-Path $backendExe) -and -not (Test-Path $backendBin)) {
        throw "PyInstaller did not create dist/jarvis-backend/jarvis-backend(.exe)."
    }

    if (-not (Test-Path "node_modules")) {
        & $npm.Source install
    }

    if (-not $SkipInstaller) {
        & $npm.Source run desktop:pack
    }
}
finally {
    Pop-Location
}
