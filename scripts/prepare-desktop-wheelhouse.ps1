param(
    [string]$Python = "",
    [string]$Wheelhouse = "wheelhouse/desktop",
    [switch]$IncludeVoice,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $RepoRoot

try {
    if (-not $Python) {
        $pythonCommand = Get-Command python -ErrorAction Stop
        $Python = $pythonCommand.Source
    }

    $wheelhousePath = if ([IO.Path]::IsPathRooted($Wheelhouse)) {
        $Wheelhouse
    }
    else {
        Join-Path $RepoRoot $Wheelhouse
    }

    $projectTarget = if ($IncludeVoice) { ".[pty,voice]" } else { ".[pty]" }
    $downloadArgs = @(
        "-m",
        "pip",
        "download",
        "--dest",
        $wheelhousePath,
        "--prefer-binary",
        "--timeout",
        "20",
        "--retries",
        "2",
        "--no-build-isolation",
        $projectTarget,
        "pyinstaller"
    )

    Write-Host "Preparing JARVIS desktop wheelhouse at: $wheelhousePath"
    Write-Host "Command:"
    Write-Host "  $Python $($downloadArgs -join ' ')"

    if ($DryRun) {
        Write-Host "Dry run only; no packages downloaded."
        return
    }

    New-Item -ItemType Directory -Force -Path $wheelhousePath | Out-Null
    & $Python @downloadArgs
    if ($LASTEXITCODE -ne 0) {
        throw "pip download failed while preparing the desktop wheelhouse."
    }

    Write-Host "Wheelhouse ready."
    Write-Host "Offline install:"
    Write-Host "  $Python -m pip install --no-index --find-links `"$wheelhousePath`" --no-build-isolation -e . pyinstaller"
}
finally {
    Pop-Location
}
