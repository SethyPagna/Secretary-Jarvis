param(
    [string]$PyInstallerSpec = "packaging/jarvis-backend.spec",
    [string]$Python = "",
    [switch]$SkipInstaller,
    [switch]$SkipSmoke,
    [switch]$SkipRendererSmoke,
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

    if (-not $Python) {
        $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
        if ($pyLauncher) {
            $candidate = & $pyLauncher.Source -3.11 -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $candidate) {
                $Python = $candidate.Trim()
            }
        }
    }
    if (-not $Python) {
        $pythonCommand = Get-Command python -ErrorAction Stop
        $Python = $pythonCommand.Source
    }
    $pythonVersion = & $Python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    if ([version]$pythonVersion -ge [version]"3.13") {
        throw "JARVIS desktop packaging requires Python 3.11 or 3.12 so Kokoro local TTS can be bundled. Found Python $pythonVersion at $Python."
    }

    $dependencyCheck = Join-Path $PSScriptRoot "check-desktop-python-deps.ps1"
    & $dependencyCheck -Python $Python

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

    Invoke-Checked $Python -m PyInstaller $PyInstallerSpec --noconfirm --clean

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

    $stageLlama = Join-Path $PSScriptRoot "stage_llamacpp_runtime.py"
    Invoke-Checked $Python $stageLlama

    if (-not $SkipInstaller) {
        Invoke-Checked $npm.Source run desktop:pack
        Get-ChildItem -Path (Join-Path $RepoRoot "release") -Force -ErrorAction SilentlyContinue |
            Where-Object {
                ((-not $_.PSIsContainer) -and (
                    $_.Name -like "JARVIS Setup*.exe" -or
                    $_.Name -like "JARVIS Setup*.blockmap" -or
                    $_.Name -in @("latest.yml", "builder-debug.yml")
                ))
            } |
            Remove-Item -Recurse -Force

        if (-not $SkipRendererSmoke) {
            $portableExe = Join-Path $RepoRoot "release/JARVIS 1.0.0.exe"
            $unpackedExe = Join-Path $RepoRoot "release/win-unpacked/JARVIS.exe"
            $rendererSmoke = Join-Path $PSScriptRoot "smoke-electron-renderer.ps1"
            if (Test-Path $portableExe) {
                & $rendererSmoke -AppPath $portableExe -BackendPort ($SmokePort + 1) -DebugPort ($SmokePort + 601) -TimeoutSec 180
            }
            elseif (Test-Path $unpackedExe) {
                & $rendererSmoke -AppPath $unpackedExe -BackendPort ($SmokePort + 1) -DebugPort ($SmokePort + 601) -TimeoutSec 120
            }
            else {
                throw "Electron pack did not create release/JARVIS 1.0.0.exe or release/win-unpacked/JARVIS.exe."
            }
        }

        $unpackedDir = Join-Path $RepoRoot "release/win-unpacked"
        if (Test-Path $unpackedDir) {
            Remove-Item -LiteralPath $unpackedDir -Recurse -Force
            Write-Host "Removed intermediate release/win-unpacked directory; portable exe remains the release artifact."
        }
    }
}
finally {
    Pop-Location
}
