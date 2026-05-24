param(
    [string]$Python = "",
    [string]$Wheelhouse = "wheelhouse/desktop"
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

    $preflightOutput = & $Python -m jarvis_cli.desktop_entry --preflight --port 0 2>&1
    $preflightExit = $LASTEXITCODE

    & $Python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('PyInstaller') else 1)"
    $pyInstallerExit = $LASTEXITCODE
    & $Python -c "import importlib.util, sys; mods=['kokoro','soundfile','faster_whisper']; missing=[m for m in mods if importlib.util.find_spec(m) is None]; print(','.join(missing)); sys.exit(0 if not missing else 1)"
    $voiceMissing = $LASTEXITCODE

    if ($preflightExit -eq 0 -and $pyInstallerExit -eq 0 -and $voiceMissing -eq 0) {
        Write-Host "JARVIS desktop Python dependencies are ready."
        return
    }

    Write-Host "JARVIS desktop Python dependencies are incomplete."
    if ($preflightOutput) {
        Write-Host ""
        Write-Host "Backend preflight:"
        $preflightOutput | ForEach-Object { Write-Host "  $_" }
    }

    if ($pyInstallerExit -ne 0) {
        Write-Host ""
        Write-Host "Missing build dependency: PyInstaller"
    }
    if ($voiceMissing -ne 0) {
        Write-Host ""
        Write-Host "Missing voice/STT dependency: Kokoro, soundfile, or faster-whisper"
    }

    Write-Host ""
    Write-Host "Online recovery:"
    Write-Host "  $Python -m pip install --no-build-isolation -e `".[voice,pty]`" pyinstaller"
    Write-Host "  If pypi.org is slow from this network, use:"
    Write-Host "  $Python -m pip install --no-build-isolation -e `".[voice,pty]`" pyinstaller -i https://pypi.tuna.tsinghua.edu.cn/simple"

    if (Test-Path $wheelhousePath) {
        Write-Host ""
        Write-Host "Offline recovery from existing wheelhouse:"
        Write-Host "  $Python -m pip install --no-index --find-links `"$wheelhousePath`" --no-build-isolation -e . pyinstaller"
    }
    else {
        Write-Host ""
        Write-Host "No wheelhouse found at: $wheelhousePath"
        Write-Host "Prepare one on a connected machine:"
        Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/prepare-desktop-wheelhouse.ps1 -Wheelhouse `"$wheelhousePath`""
        Write-Host "Then copy that wheelhouse back here and run:"
        Write-Host "  $Python -m pip install --no-index --find-links `"$wheelhousePath`" --no-build-isolation -e . pyinstaller"
    }

    throw "JARVIS desktop Python dependency check failed."
}
finally {
    Pop-Location
}
