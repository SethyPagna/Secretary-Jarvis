param(
  [switch]$Unregister,
  [switch]$CheckOnly,
  [switch]$NoDashboard,
  [switch]$NoHud,
  [switch]$Elevated,
  [string]$TaskName = "Secretary Jarvis Local Runtime"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $Root "scripts\jarvis-runtime.ps1"

if ($Unregister) {
  if ($CheckOnly) {
    Write-Host "Would remove startup task: $TaskName"
    Write-Host "Would remove Startup shortcut: Secretary Jarvis Local Runtime.lnk"
    exit 0
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  $shortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "Secretary Jarvis Local Runtime.lnk"
  Remove-Item -LiteralPath $shortcut -Force -ErrorAction SilentlyContinue
  Write-Host "Removed startup task: $TaskName"
  exit 0
}

if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "Missing startup script: $StartScript"
}

$startArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$StartScript`"", "-Action", "Start", "-Silent")
if ($NoDashboard) {
  $startArgs += "-NoDashboard"
}
if ($NoHud) {
  $startArgs += "-NoHud"
}
$argument = $startArgs -join " "

if ($CheckOnly) {
  Write-Host "Would register startup task: $TaskName"
  Write-Host "Command: powershell.exe $argument"
  Write-Host "Run level: $(if ($Elevated) { "Highest" } else { "Limited" })"
  exit 0
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel $(if ($Elevated) { "Highest" } else { "Limited" })

try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "Registered startup task: $TaskName"
  Write-Host "It starts Jarvis local services at Windows logon without opening the dashboard."
} catch {
  $startupFolder = [Environment]::GetFolderPath("Startup")
  $shortcutPath = Join-Path $startupFolder "Secretary Jarvis Local Runtime.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "powershell.exe"
  $shortcut.Arguments = $argument
  $shortcut.WorkingDirectory = $Root
  $shortcut.IconLocation = "powershell.exe,0"
  $shortcut.Save()
  Write-Host "Scheduled task registration was denied, so Jarvis created a Startup shortcut instead:"
  Write-Host $shortcutPath
}
