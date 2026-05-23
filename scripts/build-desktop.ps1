param(
    [string]$PyInstallerSpec = "packaging/jarvis-backend.spec",
    [switch]$SkipInstaller,
    [switch]$SkipSmoke,
    [int]$SmokePort = 18765
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $RepoRoot

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command exited with code $LASTEXITCODE"
    }
}

try {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        $npm = Get-Command npm -ErrorAction Stop
    }

    $python = Get-Command python -ErrorAction Stop

    $dependencyCheck = Join-Path $PSScriptRoot "check-desktop-python-deps.ps1"
    & $dependencyCheck -Python $python.Source

    if (-not (Test-Path "web/node_modules")) {
        Invoke-Checked $npm.Source --prefix web install
    }

    Invoke-Checked $npm.Source --prefix web run build

    $webDist = Join-Path $RepoRoot "web/dist"
    $embeddedDist = Join-Path $RepoRoot "jarvis_cli/web_dist"
    $viteEmbeddedDist = $embeddedDist
    if (Test-Path (Join-Path $webDist "index.html")) {
        if (Test-Path $embeddedDist) {
            Remove-Item -LiteralPath $embeddedDist -Recurse -Force
        }
        New-Item -ItemType Directory -Force -Path $embeddedDist | Out-Null
        Copy-Item -Path (Join-Path $webDist "*") -Destination $embeddedDist -Recurse -Force
    }
    elseif (Test-Path (Join-Path $viteEmbeddedDist "index.html")) {
        Write-Host "Vite already emitted the web app into $viteEmbeddedDist"
    }
    else {
        throw "Vite build output not found. Expected web/dist or jarvis_cli/web_dist."
    }

    Invoke-Checked $python.Source -m PyInstaller $PyInstallerSpec --noconfirm --clean

    $backendExe = Join-Path $RepoRoot "dist/jarvis-backend/jarvis-backend.exe"
    $backendBin = Join-Path $RepoRoot "dist/jarvis-backend/jarvis-backend"
    if (-not (Test-Path $backendExe) -and -not (Test-Path $backendBin)) {
        throw "PyInstaller did not create dist/jarvis-backend/jarvis-backend(.exe)."
    }
    $backendLaunch = if (Test-Path $backendExe) { $backendExe } else { $backendBin }

    if (-not $SkipSmoke) {
        $smokeScript = Join-Path $PSScriptRoot "smoke-desktop-backend.ps1"
        & $smokeScript `
            -BackendCommand $backendLaunch `
            -BackendArgs @("--host", "127.0.0.1", "--port", [string]$SmokePort, "--no-open") `
            -BindHost "127.0.0.1" `
            -Port $SmokePort
    }

    if (-not (Test-Path "node_modules")) {
        Invoke-Checked $npm.Source install
    }

    if (-not $SkipInstaller) {
        Invoke-Checked $npm.Source run desktop:pack
    }
}
finally {
    Pop-Location
}
