param(
    [switch]$SkipPython,
    [switch]$SkipNode,
    [switch]$BuildDesktop,
    [switch]$SkipInstaller,
    [string]$Wheelhouse = "wheelhouse/desktop"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
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

function Invoke-PythonDependencyCheck {
    param([string]$Python)

    try {
        & (Join-Path $RepoRoot "ops/scripts/check-desktop-python-deps.ps1") -Python $Python -Wheelhouse $Wheelhouse
        return
    }
    catch {
        Write-Host ""
        Write-Host "Attempting automatic Python dependency recovery..."
    }

    $wheelhousePath = if ([IO.Path]::IsPathRooted($Wheelhouse)) {
        $Wheelhouse
    }
    else {
        Join-Path $RepoRoot $Wheelhouse
    }

    if (Test-Path $wheelhousePath) {
        Invoke-Checked $Python -m pip install --no-index --find-links $wheelhousePath --no-build-isolation -e . pyinstaller
    }
    else {
        Invoke-Checked $Python -m pip install --timeout 30 --retries 1 --prefer-binary --no-build-isolation -e . pyinstaller
    }

    & (Join-Path $RepoRoot "ops/scripts/check-desktop-python-deps.ps1") -Python $Python -Wheelhouse $Wheelhouse
}

function Resolve-JarvisPython {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $candidate = & $pyLauncher.Source -3.11 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $candidate) {
            return $candidate.Trim()
        }
        $candidate = & $pyLauncher.Source -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $candidate) {
            return $candidate.Trim()
        }
    }
    $python = Get-Command python -ErrorAction Stop
    return $python.Source
}

try {
    Write-Host "JARVIS setup"
    Write-Host "Repository: $RepoRoot"
    Write-Host ""

    if (-not $SkipPython) {
        $python = Resolve-JarvisPython
        $pythonVersion = & $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
        if ([version]$pythonVersion -ge [version]"3.13") {
            throw "JARVIS Desktop needs Python 3.11 or 3.12 for the bundled Kokoro voice runtime. Found Python $pythonVersion at $python."
        }
        Invoke-PythonDependencyCheck -Python $python
    }

    if (-not $SkipNode) {
        $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $npm) {
            $npm = Get-Command npm -ErrorAction Stop
        }

        if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
            Invoke-Checked $npm.Source install
        }
        else {
            Write-Host "Root Node dependencies already installed."
        }

        if (-not (Test-Path (Join-Path $RepoRoot "web/node_modules"))) {
            Invoke-Checked $npm.Source --prefix web install
        }
        else {
            Write-Host "Web Node dependencies already installed."
        }
    }

    if ($BuildDesktop) {
        $buildArgs = @("-ExecutionPolicy", "Bypass", "-File", "ops/scripts/build-desktop.ps1")
        if ($SkipInstaller) {
            $buildArgs += "-SkipInstaller"
        }
        Invoke-Checked powershell @buildArgs
    }

    Write-Host ""
    Write-Host "Setup complete."
    Write-Host "Run:  .\run-jarvis.cmd"
    Write-Host "Stop: .\stop-jarvis.cmd"
}
finally {
    Pop-Location
}
