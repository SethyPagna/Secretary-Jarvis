param(
  [string[]]$Models = @(
    "openai/whisper-large-v3-turbo",
    "Qwen/Qwen3.5-9B",
    "google/gemma-4-E4B-it",
    "Qwen/Qwen3.6-27B"
  ),
  [switch]$IncludeDeepSeek,
  [switch]$CloneRepos,
  [int]$MaxWorkers = 8,
  [string]$Root = "C:\Users\user\Downloads\Secretary Jarvis\models\huggingface"
)

$ErrorActionPreference = "Stop"
$env:PATH = "$env:APPDATA\Python\Python313\Scripts;$env:LOCALAPPDATA\Programs\Ollama;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:GIT_LFS_SKIP_SMUDGE = "1"

if ($IncludeDeepSeek -and -not ($Models -contains "deepseek-ai/DeepSeek-V4-Flash")) {
  $Models += "deepseek-ai/DeepSeek-V4-Flash"
}

$RepoRoot = Join-Path $Root "repos"
$SnapshotRoot = Join-Path $Root "snapshots"
New-Item -ItemType Directory -Force -Path $RepoRoot, $SnapshotRoot | Out-Null

if (-not (Get-Command hf -ErrorAction SilentlyContinue)) {
  throw "HF CLI was not found. Install it with: python -m pip install --user 'huggingface_hub[cli]' hf_xet"
}

foreach ($model in $Models) {
  $safe = $model.Replace("/", "__")
  $repoPath = Join-Path $RepoRoot $safe
  $snapshotPath = Join-Path $SnapshotRoot $safe

  if ($CloneRepos) {
    if (Test-Path -LiteralPath (Join-Path $repoPath ".git")) {
      git -C $repoPath fetch --depth 1 origin main
    } else {
      git -c core.longpaths=true clone --depth 1 "https://huggingface.co/$model" $repoPath
    }
  }

  New-Item -ItemType Directory -Force -Path $snapshotPath | Out-Null
  Write-Host "Downloading full local snapshot for $model -> $snapshotPath"
  hf download $model --local-dir $snapshotPath --max-workers $MaxWorkers
}

Write-Host "Done. Snapshot root: $SnapshotRoot"
