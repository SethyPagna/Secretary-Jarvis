param(
    [switch]$SkipWebBuild,
    [switch]$SkipDependencyPreflight,
    [switch]$RequireRelease
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

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

    if (-not $SkipWebBuild) {
        Invoke-Checked "Web production build" {
            npm.cmd --prefix web run build
        }
    }

    if (-not $SkipDependencyPreflight) {
        Invoke-Checked "Desktop Python dependency preflight" {
            powershell -ExecutionPolicy Bypass -File scripts/check-desktop-python-deps.ps1 -Python $desktopPython
        }
    }

    $releaseExe = Join-Path $RepoRoot "release/JARVIS 1.0.0.exe"
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
