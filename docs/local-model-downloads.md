# Local Hugging Face Model Downloads

Jarvis keeps model weights outside Git at:

`C:\Users\user\Downloads\Secretary Jarvis\models\huggingface`

The lightweight Git repos live in `repos\`. Full local snapshots live in `snapshots\`.

## Paste This In PowerShell

Run this from anywhere:

```powershell
cd "C:\Users\user\Downloads\Secretary Jarvis\jarvis"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\pull-hf-models-full.ps1" -CloneRepos
```

To include the homelab-scale DeepSeek snapshot:

```powershell
cd "C:\Users\user\Downloads\Secretary Jarvis\jarvis"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\pull-hf-models-full.ps1" -CloneRepos -IncludeDeepSeek
```

## Manual Equivalent

```powershell
$env:PATH = "$env:APPDATA\Python\Python313\Scripts;$env:LOCALAPPDATA\Programs\Ollama;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:GIT_LFS_SKIP_SMUDGE = "1"
$root = "C:\Users\user\Downloads\Secretary Jarvis\models\huggingface"
New-Item -ItemType Directory -Force -Path "$root\repos", "$root\snapshots" | Out-Null

$models = @(
  "openai/whisper-large-v3-turbo",
  "Qwen/Qwen3.5-9B",
  "google/gemma-4-E4B-it",
  "Qwen/Qwen3.6-27B"
)

foreach ($model in $models) {
  $safe = $model.Replace("/", "__")
  git -c core.longpaths=true clone --depth 1 "https://huggingface.co/$model" "$root\repos\$safe"
  hf download $model --local-dir "$root\snapshots\$safe" --max-workers 8
}
```

Notes:

- `GIT_LFS_SKIP_SMUDGE=1` keeps the Git clone lightweight.
- `hf download` pulls the actual full local weights.
- HF downloads resume into the same `--local-dir` if interrupted.
- Keep these folders out of Git. They are too large and are local runtime assets.
