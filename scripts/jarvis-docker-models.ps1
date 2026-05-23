param(
    [ValidateSet("status", "start", "stop", "restart", "apply")]
    [string]$Action = "status",

    [ValidateSet("auto", "llamacpp", "vllm", "ollama")]
    [string]$Profile = "auto",

    [switch]$NoVoice,
    [switch]$Json
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$argsList = @("-m", "jarvis_cli.docker_models", $Action, "--profile", $Profile)
if ($NoVoice) {
    $argsList += "--no-voice"
}
if ($Json) {
    $argsList += "--json"
}

python @argsList
