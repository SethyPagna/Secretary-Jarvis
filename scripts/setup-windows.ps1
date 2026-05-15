param(
  [switch]$Install,
  [switch]$PullBalancedModels,
  [string]$OllamaModels = "$env:USERPROFILE\.ollama\models",
  [string]$AssetRoot = "C:\Users\user\Downloads\Secretary Jarvis"
)

$ErrorActionPreference = "Stop"

function Test-Command {
  param(
    [string]$Name,
    [string[]]$Arguments = @("--version"),
    [string[]]$CandidatePaths = @(),
    [string[]]$LocalInstallers = @()
  )
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  $foundPath = if ($command) { $command.Source } else { "" }
  if (-not $foundPath) {
    foreach ($candidate in $CandidatePaths) {
      $expanded = $ExecutionContext.InvokeCommand.ExpandString($candidate)
      if (Test-Path -LiteralPath $expanded) {
        $foundPath = $expanded
        break
      }
    }
  }

  $installerPath = ""
  foreach ($installer in $LocalInstallers) {
    $candidateInstaller = Join-Path $AssetRoot $installer
    if (Test-Path -LiteralPath $candidateInstaller) {
      $installerPath = $candidateInstaller
      break
    }
  }

  if (-not $command) {
    return [pscustomobject]@{
      Name = $Name
      Installed = [bool]$foundPath
      Version = if ($foundPath) { "found outside PATH" } else { "" }
      Path = $foundPath
      LocalInstaller = $installerPath
    }
  }

  $version = ""
  try {
    $version = (& $Name @Arguments 2>$null | Select-Object -First 1)
  } catch {
    $version = "installed"
  }
  [pscustomobject]@{ Name = $Name; Installed = $true; Version = $version; Path = $foundPath; LocalInstaller = $installerPath }
}

function Show-Doctor {
  $tools = @(
    (Test-Command -Name "node"),
    (Test-Command -Name "npm.cmd"),
    (Test-Command -Name "python"),
    (Test-Command -Name "git"),
    (Test-Command -Name "rustc" -CandidatePaths @("$env:USERPROFILE\.cargo\bin\rustc.exe") -LocalInstallers @("rustup-init.exe")),
    (Test-Command -Name "cargo" -CandidatePaths @("$env:USERPROFILE\.cargo\bin\cargo.exe") -LocalInstallers @("cargo-master.zip", "rustup-init.exe")),
    (Test-Command -Name "ollama" -CandidatePaths @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe") -LocalInstallers @("OllamaSetup.exe")),
    (Test-Command -Name "hf" -CandidatePaths @("$env:APPDATA\Python\Python313\Scripts\hf.exe", "$env:USERPROFILE\.local\bin\hf.exe")),
    (Test-Command -Name "git-xet" -CandidatePaths @("$env:APPDATA\Python\Python313\site-packages\hf_xet")),
    (Test-Command -Name "whisper-cli"),
    (Test-Command -Name "piper"),
    (Test-Command -Name "docker")
  )
  $tools | Format-Table -AutoSize
  Write-Host ""
  Write-Host "Asset root: $AssetRoot"
  Write-Host "Local setup assets:"
  @("OllamaSetup.exe", "rustup-init.exe", "cargo-master.zip", "openclaw-main.zip", "ruflo-main.zip") | ForEach-Object {
    $asset = Join-Path $AssetRoot $_
    if (Test-Path -LiteralPath $asset) {
      Write-Host " - found $_"
    } else {
      Write-Host " - missing $_"
    }
  }
  Write-Host "Model directory: $OllamaModels"
  Write-Host "Free space on C: $([math]::Round((Get-PSDrive C).Free / 1GB, 1)) GB"
}

function Install-Tooling {
  Write-Host "Installing missing free/open-source tooling with winget where possible..."
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is missing. Install App Installer from Microsoft Store or install tools manually."
  }

  if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
    winget install --id Rustlang.Rustup --source winget --accept-source-agreements --accept-package-agreements
  }

  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    $ollamaInstaller = Join-Path $AssetRoot "OllamaSetup.exe"
    if (Test-Path -LiteralPath $ollamaInstaller) {
      Write-Host "Found local Ollama installer: $ollamaInstaller"
      Write-Host "Run it manually if the GUI installer is required; Jarvis will not force-launch it."
    } else {
      winget install --id Ollama.Ollama --source winget --accept-source-agreements --accept-package-agreements
    }
  }

  if (-not (Get-Command hf -ErrorAction SilentlyContinue)) {
    Write-Host "Install Hugging Face CLI when ready:"
    Write-Host 'powershell -ExecutionPolicy ByPass -c "irm https://hf.co/cli/install.ps1 | iex"'
  }

  if (-not (Get-Command git-xet -ErrorAction SilentlyContinue)) {
    Write-Host "Install git-xet when ready:"
    Write-Host "winget install git-xet"
  }

  Write-Host "Microsoft C++ Build Tools may require a GUI/admin flow."
  Write-Host "If Tauri build fails, install workload: 'Desktop development with C++'."
  winget install --id Microsoft.VisualStudio.2022.BuildTools --source winget --accept-source-agreements --accept-package-agreements
}

function Pull-BalancedModels {
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw "Ollama is not installed. Run this script with -Install first or install Ollama manually."
  }

  $models = @(
    @{ Name = "qwen3:8b"; Estimate = "5-7 GB"; Purpose = "fast daily assistant" },
    @{ Name = "qwen3-coder:7b"; Estimate = "4-6 GB"; Purpose = "coding and repo work" },
    @{ Name = "nomic-embed-text"; Estimate = "300-500 MB"; Purpose = "fast memory embeddings" },
    @{ Name = "bge-m3"; Estimate = "1.5-3 GB"; Purpose = "deeper multilingual retrieval" }
  )

  Write-Host "Balanced model pack:"
  $models | ForEach-Object { Write-Host " - $($_.Name) / $($_.Estimate) / $($_.Purpose)" }
  Write-Host "Estimated total download/cache use: roughly 11-17 GB before Ollama cache overhead."
  Write-Host "Continuing because -PullBalancedModels was provided."
  foreach ($model in $models) {
    ollama pull $model.Name
  }
}

Show-Doctor

if ($Install) {
  Install-Tooling
  Show-Doctor
}

if ($PullBalancedModels) {
  Pull-BalancedModels
}

Write-Host "Jarvis setup script complete."
