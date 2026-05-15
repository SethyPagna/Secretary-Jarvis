param(
  [switch]$Unregister,
  [string]$TaskName = "Secretary Jarvis Local Runtime"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $Root "scripts\start-jarvis.ps1"

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  $shortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "Secretary Jarvis Local Runtime.lnk"
  Remove-Item -LiteralPath $shortcut -Force -ErrorAction SilentlyContinue
  Write-Host "Removed startup task: $TaskName"
  exit 0
}

if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "Missing startup script: $StartScript"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -NoDashboard"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

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
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -NoDashboard"
  $shortcut.WorkingDirectory = $Root
  $shortcut.IconLocation = "powershell.exe,0"
  $shortcut.Save()
  Write-Host "Scheduled task registration was denied, so Jarvis created a Startup shortcut instead:"
  Write-Host $shortcutPath
}
