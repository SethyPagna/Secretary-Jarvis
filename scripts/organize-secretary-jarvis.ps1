param(
  [switch]$Apply,
  [switch]$NoCompatibilityLinks
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$workspaceRoot = Resolve-Path (Join-Path $repoRoot "..")
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$planDir = Join-Path $repoRoot "data\organization"
$planPath = Join-Path $planDir "secretary-jarvis-organization-$timestamp.json"

function Join-WorkspacePath {
  param([string]$RelativePath)
  Join-Path $workspaceRoot.Path $RelativePath
}

function Assert-WithinWorkspace {
  param([string]$Path)
  $full = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetFullPath($workspaceRoot.Path)
  if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to touch path outside workspace root: $full"
  }
  return $full
}

function New-MovePlan {
  param(
    [string]$SourceRelative,
    [string]$DestinationRelative,
    [string]$Category,
    [string]$Note,
    [bool]$PlanOnly = $false,
    [bool]$CreateCompatibilityLink = $false
  )

  $source = Join-WorkspacePath $SourceRelative
  if (-not (Test-Path -LiteralPath $source)) {
    return $null
  }

  [pscustomobject]@{
    source = Assert-WithinWorkspace $source
    destination = Assert-WithinWorkspace (Join-WorkspacePath $DestinationRelative)
    category = $Category
    note = $Note
    planOnly = $PlanOnly
    createCompatibilityLink = $CreateCompatibilityLink
  }
}

function Move-Safely {
  param([pscustomobject]$Move)

  if ($Move.planOnly) {
    Write-Host "Skipping plan-only item:" $Move.source
    return
  }

  $destinationDir = Split-Path -Parent $Move.destination
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null

  if (Test-Path -LiteralPath $Move.destination) {
    $sourceItem = Get-Item -LiteralPath $Move.source -Force
    $destinationItem = Get-Item -LiteralPath $Move.destination -Force

    if ($sourceItem.PSIsContainer -and $destinationItem.PSIsContainer) {
      Get-ChildItem -LiteralPath $Move.source -Force | ForEach-Object {
        $childDestination = Join-Path $Move.destination $_.Name
        if (Test-Path -LiteralPath $childDestination) {
          Write-Host "Keeping existing destination child:" $childDestination
        } else {
          Move-Item -LiteralPath $_.FullName -Destination $childDestination
          Write-Host "Moved child:" $_.FullName "->" $childDestination
        }
      }

      if (-not (Get-ChildItem -LiteralPath $Move.source -Force -ErrorAction SilentlyContinue)) {
        Remove-Item -LiteralPath $Move.source -Force
      }
      return
    }

    Write-Host "Skipping existing destination:" $Move.destination
    return
  }

  Move-Item -LiteralPath $Move.source -Destination $Move.destination
  Write-Host "Moved:" $Move.source "->" $Move.destination
}

function New-CompatibilityJunction {
  param([pscustomobject]$Move)

  if ($NoCompatibilityLinks -or -not $Move.createCompatibilityLink -or $Move.planOnly) {
    return
  }
  if (Test-Path -LiteralPath $Move.source) {
    return
  }
  if (-not (Test-Path -LiteralPath $Move.destination -PathType Container)) {
    return
  }

  New-Item -ItemType Junction -Path $Move.source -Target $Move.destination | Out-Null
  Write-Host "Compatibility junction:" $Move.source "->" $Move.destination
}

$explicitMoves = @(
  (New-MovePlan -SourceRelative "voice" -DestinationRelative "assets\voice" -Category "assets\voice" -Note "Voice identity samples. Jarvis also keeps tracked copies under jarvis/assets/voice." -CreateCompatibilityLink $true),
  (New-MovePlan -SourceRelative "gateways, openclaw, ruflo, rust and cargo" -DestinationRelative "vendor\reference\openclaw-ruflo-rust" -Category "vendor\reference" -Note "Reference zips and local Rust installer bundle."),
  (New-MovePlan -SourceRelative "jarvis-opensource" -DestinationRelative "vendor\reference\jarvis-opensource-bundles" -Category "vendor\reference" -Note "Community Jarvis reference bundles."),
  (New-MovePlan -SourceRelative "workflow integration" -DestinationRelative "vendor\reference\workflow-engines" -Category "vendor\reference" -Note "n8n, Activepieces, Kestra, and Node-RED workflow reference bundles."),
  (New-MovePlan -SourceRelative "models" -DestinationRelative "models" -Category "models" -Note "Local model assets remain in place so downloaded and partial snapshots keep auto-connecting." -PlanOnly $true)
) | Where-Object { $null -ne $_ }

$fileMoves = @()
$rootFiles = Get-ChildItem -LiteralPath $workspaceRoot.Path -Force -File |
  Where-Object { $_.Name -notlike "~$*" }

foreach ($file in $rootFiles) {
  $relativeName = $file.Name
  if ($file.Extension -in @(".exe", ".msi")) {
    $fileMoves += New-MovePlan -SourceRelative $relativeName -DestinationRelative ("tools\installers\" + $relativeName) -Category "tools\installers" -Note "Local installers and setup binaries."
    continue
  }

  if ($file.Extension -in @(".docx", ".pdf", ".md", ".html")) {
    $fileMoves += New-MovePlan -SourceRelative $relativeName -DestinationRelative ("docs\imported\" + $relativeName) -Category "docs\imported" -Note "Imported planning documents and standalone references."
    continue
  }

  if ($file.Extension -eq ".zip") {
    $fileMoves += New-MovePlan -SourceRelative $relativeName -DestinationRelative ("vendor\reference\archives\" + $relativeName) -Category "vendor\reference" -Note "Reference archive."
  }
}

$moves = @($explicitMoves + ($fileMoves | Where-Object { $null -ne $_ }))

$compatibilityLinks = $moves |
  Where-Object { $_.createCompatibilityLink -and -not $_.planOnly } |
  ForEach-Object {
    [pscustomobject]@{
      link = $_.source
      target = $_.destination
      enabled = -not [bool]$NoCompatibilityLinks
    }
  }

$plan = [pscustomobject]@{
  createdAt = (Get-Date).ToString("o")
  workspaceRoot = $workspaceRoot.Path
  repoRoot = $repoRoot.Path
  applyRequested = [bool]$Apply
  safety = "Models stay in place. All paths are checked against the workspace root. Compatibility junctions preserve legacy folders."
  moves = @($moves)
  compatibilityLinks = @($compatibilityLinks)
}

New-Item -ItemType Directory -Force -Path $planDir | Out-Null
$plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $planPath -Encoding UTF8

Write-Host "Jarvis organization plan written:"
Write-Host $planPath

if (-not $Apply) {
  Write-Host "Dry-run only. Re-run with -Apply to move non-model items."
  $plan.moves | Format-Table category, source, destination, planOnly, createCompatibilityLink -AutoSize
  exit 0
}

foreach ($move in $plan.moves) {
  Move-Safely -Move $move
}

foreach ($move in $plan.moves) {
  New-CompatibilityJunction -Move $move
}

$appliedPath = Join-Path $planDir "latest-applied-organization.json"
$plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $appliedPath -Encoding UTF8
Write-Host "Applied organization manifest:"
Write-Host $appliedPath
