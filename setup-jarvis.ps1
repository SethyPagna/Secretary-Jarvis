param(
    [switch]$SkipPython,
    [switch]$SkipNode,
    [switch]$SkipDockerCheck,
    [switch]$BuildDesktop,
    [switch]$SkipInstaller,
    [string]$Wheelhouse = "wheelhouse/desktop"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
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
        & (Join-Path $RepoRoot "scripts/check-desktop-python-deps.ps1") -Python $Python -Wheelhouse $Wheelhouse
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

    & (Join-Path $RepoRoot "scripts/check-desktop-python-deps.ps1") -Python $Python -Wheelhouse $Wheelhouse
}

try {
    Write-Host "JARVIS setup"
    Write-Host "Repository: $RepoRoot"
    Write-Host ""

    if (-not $SkipPython) {
        $python = Get-Command python -ErrorAction Stop
        Invoke-PythonDependencyCheck -Python $python.Source
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

    if (-not $SkipDockerCheck) {
        $docker = Get-Command docker -ErrorAction SilentlyContinue
        if ($docker) {
            Invoke-Checked $docker.Source compose -f docker-compose.local-models.yml config
            Write-Host "Docker Compose local model configuration is valid."
        }
        else {
            Write-Host "Docker was not found. JARVIS will still run, but local model containers need Docker Desktop."
        }
    }

    if ($BuildDesktop) {
        $buildArgs = @("-ExecutionPolicy", "Bypass", "-File", "scripts/build-desktop.ps1")
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
