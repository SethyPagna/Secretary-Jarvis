param(
  [ValidateSet("Menu", "Start", "Stop", "Restart", "Verify", "SelfTest", "InstallShortcuts", "RegisterStartup", "UnregisterStartup", "OpenDashboard")]
  [string]$Action = "Menu",
  [switch]$CheckOnly,
  [switch]$StopOllama,
  [switch]$NoCleanStart
)

$runtimeAction = switch ($Action) {
  "SelfTest" { "LiveTest" }
  "OpenDashboard" { "Status" }
  "InstallShortcuts" {
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "install-shortcuts.ps1"), "-All")
    if ($CheckOnly) { $args += "-CheckOnly" }
    & powershell.exe @args
    exit $LASTEXITCODE
  }
  default { $Action }
}

$runtimeArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "jarvis-runtime.ps1"), "-Action", $runtimeAction)
if ($CheckOnly) { $runtimeArgs += "-CheckOnly" }
if ($StopOllama) { $runtimeArgs += "-StopOllama" }
& powershell.exe @runtimeArgs
