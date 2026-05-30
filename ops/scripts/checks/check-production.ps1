param(
    [switch]$SkipWebBuild,
    [switch]$SkipDependencyPreflight,
    [switch]$RequireRelease
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

function Resolve-DesktopPython {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        foreach ($version in @("3.11", "3.12")) {
            $candidate = & $pyLauncher.Source "-$version" -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $candidate) {
                return $candidate.Trim()
            }
        }
    }

    $pythonCommand = Get-Command python -ErrorAction Stop
    return $pythonCommand.Source
}

function Invoke-Checked {
    param(
        [string]$Label,
        [scriptblock]$Command
    )

    Write-Host "==> $Label"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

function Test-OwnedRuntimeProcesses {
    $owned = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.ProcessName -in @("JARVIS", "jarvis-backend", "llama-server", "electron")) -or
        ($_.Path -like "*Secretary Jarvis*")
    }

    if ($owned) {
        $owned | Select-Object Id, ProcessName, Path | Format-Table -AutoSize
        throw "JARVIS-owned runtime processes are still running. Stop them before packaging or final verification."
    }

    Write-Host "No owned JARVIS/runtime processes are running."
}

function Test-NodeRuntimeScripts {
    $node = Get-Command node -ErrorAction Stop
    $runtimeScripts = @(
        "desktop/electron/main.js",
        "desktop/electron/preload.js",
        "desktop/web/config/eslint.config.js",
        "ops/scripts/build/after-pack-icon.cjs",
        "ops/scripts/checks/whatsapp-bridge/allowlist.mjs",
        "ops/scripts/checks/whatsapp-bridge/bridge.mjs",
        "capabilities/optional-skills/research/gitnexus-explorer/scripts/proxy.mjs",
        "capabilities/skills/creative/p5js/scripts/export-frames.js"
    )

    foreach ($script in $runtimeScripts) {
        & $node.Source --check $script
        if ($LASTEXITCODE -ne 0) {
            throw "Node syntax check failed: $script"
        }
    }
}

Push-Location $RepoRoot
try {
    $desktopPython = Resolve-DesktopPython

    Invoke-Checked "Repository and desktop runtime contracts" {
        python -m unittest `
            tests.jarvis_cli.test_repository_layout_contract `
            tests.jarvis_cli.test_desktop_packaging_contract `
            tests.jarvis_cli.test_electron_shell_contract `
            tests.jarvis_cli.test_jarvis_run_files_contract `
            tests.jarvis_cli.test_runtime_readiness `
            tests.jarvis_cli.test_runtime_smoke `
            tests.jarvis_cli.test_runtime_stats
    }

    Invoke-Checked "Node/Electron runtime script syntax" {
        Test-NodeRuntimeScripts
    }

    if (-not $SkipWebBuild) {
        Invoke-Checked "Web production build" {
            npm.cmd --prefix desktop/web run build
        }
    }

    if (-not $SkipDependencyPreflight) {
        Invoke-Checked "Desktop Python dependency preflight" {
            powershell -ExecutionPolicy Bypass -File ops/scripts/checks/check-desktop-python-deps.ps1 -Python $desktopPython
        }
    }

    $releaseExe = Join-Path $RepoRoot "desktop/release/JARVIS 1.0.0.exe"
    if (Test-Path $releaseExe) {
        Write-Host "Release artifact present: $releaseExe"
    } elseif ($RequireRelease) {
        throw "Required release artifact is missing: $releaseExe. Run npm run desktop:build."
    } else {
        Write-Host "Release artifact not present; run npm run desktop:build when you need a packaged exe."
    }

    Test-OwnedRuntimeProcesses
    Write-Host "JARVIS production readiness check passed."
}
finally {
    Pop-Location
}
