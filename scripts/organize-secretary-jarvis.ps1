param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$workspaceRoot = Resolve-Path (Join-Path $repoRoot "..")
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$planDir = Join-Path $repoRoot "data\organization"
$planPath = Join-Path $planDir "secretary-jarvis-organization-$timestamp.json"

$rules = @(
  @{
    Destination = "tools\installers"
    Patterns = @("OllamaSetup.exe", "rustup-init.exe", "*.msi", "*.exe")
    Note = "Local installers and setup binaries."
  },
  @{
    Destination = "vendor\reference"
    Patterns = @("openclaw-main.zip", "ruflo-main.zip", "cargo-master.zip", "openclaw-main", "ruflo-main", "cargo-master", "jarvis-opensource", "gateways, openclaw, ruflo, rust and cargo", "workflow integration")
    Note = "Reference source imports. Jarvis keeps its owned code in the repo."
  },
  @{
    Destination = "docs\imported"
    Patterns = @("*.docx", "*.pdf", "*.md", "*.html")
    Note = "Imported planning documents and downloaded references."
  },
  @{
    Destination = "assets\voice"
    Patterns = @("voice")
    Note = "Voice identity samples and local audio assets."
  },
  @{
    Destination = "models\local"
    Patterns = @("models")
    Note = "Local model assets. This move is intentionally not applied automatically because existing model paths may depend on the current folder."
    PlanOnly = $true
  }
)

function Test-RuleMatch {
  param(
    [System.IO.FileSystemInfo]$Item,
    [string[]]$Patterns
  )

  foreach ($pattern in $Patterns) {
    if ($Item.Name -like $pattern) {
      return $true
    }
  }
  return $false
}

$items = Get-ChildItem -LiteralPath $workspaceRoot -Force |
  Where-Object {
    $_.Name -notin @("jarvis", ".git") -and
    $_.Name -notlike "secretary-jarvis-organization-*.json"
  }

$moves = foreach ($item in $items) {
  foreach ($rule in $rules) {
    if (Test-RuleMatch -Item $item -Patterns $rule.Patterns) {
      $destinationDir = Join-Path $workspaceRoot $rule.Destination
      [pscustomobject]@{
        source = $item.FullName
        destination = Join-Path $destinationDir $item.Name
        category = $rule.Destination
        note = $rule.Note
        planOnly = [bool]$rule.PlanOnly
      }
      break
    }
  }
}

$plan = [pscustomobject]@{
  createdAt = (Get-Date).ToString("o")
  workspaceRoot = $workspaceRoot.Path
  applyRequested = [bool]$Apply
  safety = "Dry-run by default. Model folders and planOnly entries are never moved by this script."
  moves = @($moves)
}

New-Item -ItemType Directory -Force -Path $planDir | Out-Null
$plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $planPath -Encoding UTF8

Write-Host "Jarvis organization plan written:"
Write-Host $planPath

if (-not $Apply) {
  Write-Host "Dry-run only. Re-run with -Apply to move non-model, non-planOnly items."
  $plan.moves | Format-Table category, source, destination, planOnly -AutoSize
  exit 0
}

foreach ($move in $plan.moves) {
  if ($move.planOnly) {
    Write-Host "Skipping plan-only item:" $move.source
    continue
  }
  $destinationDir = Split-Path -Parent $move.destination
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  if (Test-Path -LiteralPath $move.destination) {
    Write-Host "Skipping existing destination:" $move.destination
    continue
  }
  Move-Item -LiteralPath $move.source -Destination $move.destination
  Write-Host "Moved:" $move.source "->" $move.destination
}
