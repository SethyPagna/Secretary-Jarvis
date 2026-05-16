param(
  [switch]$Desktop,
  [switch]$StartMenu,
  [switch]$Startup,
  [switch]$All,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ShortcutName = "Jarvis"
$DefaultTargets = -not $Desktop -and -not $StartMenu -and -not $Startup -and -not $All

if ($All -or $DefaultTargets) {
  $Desktop = $true
  $StartMenu = $true
}

function New-JarvisShortcut {
  param(
    [string]$Path,
    [string]$Target,
    [string]$Description
  )

  if ($CheckOnly) {
    Write-Host "Would create shortcut: $Path"
    Write-Host "  Target: $Target"
    return
  }

  $folder = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $Target
  $shortcut.WorkingDirectory = $Root
  $shortcut.Description = $Description
  $shortcut.IconLocation = "powershell.exe,0"
  $shortcut.Save()
  Write-Host "Created shortcut: $Path"
}

$launcher = Join-Path $Root "Jarvis.cmd"
$startLauncher = Join-Path $Root "Start Jarvis.cmd"
$stopLauncher = Join-Path $Root "Stop Jarvis.cmd"
$verifyLauncher = Join-Path $Root "Verify Jarvis.cmd"

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Missing launcher: $launcher"
}

if ($Desktop) {
  $desktopFolder = [Environment]::GetFolderPath("Desktop")
  New-JarvisShortcut -Path (Join-Path $desktopFolder "$ShortcutName.lnk") -Target $launcher -Description "Open Jarvis Control."
  New-JarvisShortcut -Path (Join-Path $desktopFolder "Start Jarvis.lnk") -Target $startLauncher -Description "Start the Jarvis HUD and local services."
}

if ($StartMenu) {
  $programsFolder = [Environment]::GetFolderPath("Programs")
  $jarvisFolder = Join-Path $programsFolder "Secretary Jarvis"
  New-JarvisShortcut -Path (Join-Path $jarvisFolder "$ShortcutName Control.lnk") -Target $launcher -Description "Open Jarvis Control."
  New-JarvisShortcut -Path (Join-Path $jarvisFolder "Start Jarvis.lnk") -Target $startLauncher -Description "Start the Jarvis HUD and local services."
  New-JarvisShortcut -Path (Join-Path $jarvisFolder "Stop Jarvis.lnk") -Target $stopLauncher -Description "Stop Jarvis local services."
  New-JarvisShortcut -Path (Join-Path $jarvisFolder "Verify Jarvis.lnk") -Target $verifyLauncher -Description "Run Jarvis verification."
}

if ($Startup) {
  $runtimeScript = Join-Path $PSScriptRoot "jarvis-runtime.ps1"
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$runtimeScript`"", "-Action", "RegisterStartup")
  if ($CheckOnly) {
    $arguments += "-CheckOnly"
  }
  Write-Host "Configuring Windows startup through jarvis-runtime.ps1..."
  & powershell.exe @arguments
}

Write-Host "Jarvis shortcut setup complete."
