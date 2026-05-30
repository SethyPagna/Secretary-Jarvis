param(
    [string]$AppPath = "",
    [string]$Route = "/",
    [string[]]$RequiredText = @(),
    [int]$BackendPort = 18768,
    [int]$DebugPort = 19223,
    [int]$TimeoutSec = 90,
    [string]$ScreenshotPath = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$DefaultElectronCmd = Join-Path $RepoRoot "node_modules/.bin/electron.cmd"
if (-not $AppPath) {
    $AppPath = $DefaultElectronCmd
}
if (-not (Test-Path $AppPath)) {
    throw "JARVIS app command not found at $AppPath."
}
$AppPath = [string](Resolve-Path $AppPath)

if (-not $ScreenshotPath) {
    $ScreenshotPath = Join-Path ([IO.Path]::GetTempPath()) "jarvis-electron-renderer-smoke.png"
}

function Invoke-Cdp {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebSocketUrl,
        [Parameter(Mandatory = $true)]
        [string]$Method,
        [hashtable]$Params = @{}
    )

    $client = [System.Net.WebSockets.ClientWebSocket]::new()
    $uri = [Uri]$WebSocketUrl
    $client.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    try {
        $payload = @{
            id = 1
            method = $Method
            params = $Params
        } | ConvertTo-Json -Depth 10 -Compress

        $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
        $segment = [ArraySegment[byte]]::new($bytes)
        $client.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

        $buffer = New-Object byte[] 1048576
        $output = [Text.StringBuilder]::new()
        do {
            $receiveSegment = [ArraySegment[byte]]::new($buffer)
            $result = $client.ReceiveAsync($receiveSegment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
            if ($result.Count -gt 0) {
                [void]$output.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
            }
        } until ($result.EndOfMessage)

        return ($output.ToString() | ConvertFrom-Json)
    }
    finally {
        if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "smoke complete", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        }
        $client.Dispose()
    }
}

function Get-DebugPageTarget {
    param([int]$Port)
    $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
    return @($targets | Where-Object { $_.type -eq "page" -and $_.webSocketDebuggerUrl } | Select-Object -First 1)[0]
}

$PreviousBackendPort = $env:JARVIS_DESKTOP_BACKEND_PORT
$PreviousNoRuntime = $env:JARVIS_LOCAL_RUNTIME_AUTOSTART
$PreviousModelsDir = $env:JARVIS_MODELS_DIR
$PreviousResourceRoot = $env:JARVIS_RESOURCE_ROOT
$PreviousPortableDir = $env:PORTABLE_EXECUTABLE_DIR
$PreviousPortableFile = $env:PORTABLE_EXECUTABLE_FILE
$PreviousRemoteDebuggingPort = $env:JARVIS_REMOTE_DEBUGGING_PORT
$Process = $null

try {
    $env:JARVIS_DESKTOP_BACKEND_PORT = [string]$BackendPort
    $env:JARVIS_REMOTE_DEBUGGING_PORT = [string]$DebugPort
    $env:JARVIS_LOCAL_RUNTIME_AUTOSTART = "0"
    $env:JARVIS_RESOURCE_ROOT = [string]$RepoRoot
    $modelsDir = Resolve-Path (Join-Path $RepoRoot "..\models") -ErrorAction SilentlyContinue
    if ($modelsDir) {
        $env:JARVIS_MODELS_DIR = [string]$modelsDir
    }

    $isDevElectron = ([IO.Path]::GetFullPath($AppPath) -ieq [IO.Path]::GetFullPath($DefaultElectronCmd))
    $workingDirectory = if ($isDevElectron) {
        [string]$RepoRoot
    }
    else {
        Split-Path -Parent (Resolve-Path $AppPath)
    }
    $arguments = if ($isDevElectron) {
        @(".", "--remote-debugging-port=$DebugPort")
    }
    else {
        @("--remote-debugging-port=$DebugPort")
    }

    $Process = Start-Process `
        -FilePath $AppPath `
        -ArgumentList $arguments `
        -WorkingDirectory $workingDirectory `
        -WindowStyle Hidden `
        -PassThru

    $Deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
    $Target = $null
    do {
        try {
            $Target = Get-DebugPageTarget -Port $DebugPort
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    } until ($Target -or [DateTime]::UtcNow -gt $Deadline)

    if (-not $Target) {
        throw "Electron renderer did not expose a debuggable page on port $DebugPort."
    }

    if ($Route -and $Route -ne "/") {
        if (-not $Route.StartsWith("/")) {
            $Route = "/$Route"
        }
        $navigated = $false
        for ($attempt = 0; $attempt -lt 10 -and -not $navigated; $attempt++) {
            try {
                $Target = Get-DebugPageTarget -Port $DebugPort
                $escapedRoute = $Route.Replace("\", "\\").Replace("'", "\'")
                Invoke-Cdp -WebSocketUrl $Target.webSocketDebuggerUrl -Method "Runtime.evaluate" -Params @{
                    expression = "window.history.pushState({}, '', '$escapedRoute'); window.dispatchEvent(new PopStateEvent('popstate')); true"
                    returnByValue = $true
                } | Out-Null
                $navigated = $true
            }
            catch {
                Start-Sleep -Milliseconds 600
            }
        }
        if (-not $navigated) {
            throw "Electron renderer did not accept navigation to $Route."
        }
    }

    $Ready = $false
    $BodyText = ""
    $StatusVersion = ""
    $StatsCpu = ""
    do {
        try {
            $Target = Get-DebugPageTarget -Port $DebugPort
            $eval = Invoke-Cdp -WebSocketUrl $Target.webSocketDebuggerUrl -Method "Runtime.evaluate" -Params @{
                expression = "document.body ? document.body.innerText : ''"
                returnByValue = $true
            }
            $BodyText = [string]$eval.result.result.value
            $statusEval = Invoke-Cdp -WebSocketUrl $Target.webSocketDebuggerUrl -Method "Runtime.evaluate" -Params @{
                expression = "fetch('/api/status').then(r => r.json()).then(j => j.version || j.status || 'ok').catch(e => 'ERR:' + e.message)"
                returnByValue = $true
                awaitPromise = $true
            }
            $statsEval = Invoke-Cdp -WebSocketUrl $Target.webSocketDebuggerUrl -Method "Runtime.evaluate" -Params @{
                expression = "fetch('/api/stats').then(r => r.json()).then(j => String(j.cpu_percent ?? j.cpu?.percent ?? 'ok')).catch(e => 'ERR:' + e.message)"
                returnByValue = $true
                awaitPromise = $true
            }
        }
        catch {
            Start-Sleep -Milliseconds 600
            continue
        }
        $StatusVersion = [string]$statusEval.result.result.value
        $StatsCpu = [string]$statsEval.result.result.value
        $NormalizedBodyText = (($BodyText -replace '\s+', ' ').Trim())
        $requiredReady = $true
        foreach ($text in $RequiredText) {
            $normalizedRequired = (([string]$text -replace '\s+', ' ').Trim())
            if ($NormalizedBodyText.IndexOf($normalizedRequired, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
                $requiredReady = $false
                break
            }
        }
        $homeReady =
            $Route -ne "/" -or (
                $BodyText -match "JARVIS" -and
                $BodyText -match "Terminal / Chat Input" -and
                $BodyText -match "How can I help" -and
                $BodyText -notmatch "\bOFFLINE\b" -and
                $BodyText -notmatch "\bKANBAN\b" -and
                $BodyText -notmatch "\bACHIEVEMENTS\b" -and
                $BodyText -notmatch "\bPlugins\b"
            )
        $Ready =
            $homeReady -and
            $requiredReady -and
            $StatusVersion -notmatch "^ERR:" -and
            $StatsCpu -notmatch "^ERR:"
        if (-not $Ready) {
            Start-Sleep -Milliseconds 750
        }
    } until ($Ready -or [DateTime]::UtcNow -gt $Deadline)

    if (-not $Ready) {
        throw "Electron renderer loaded but did not reach live Home state. status=$StatusVersion statsCpu=$StatsCpu body=$($BodyText.Substring(0, [Math]::Min(500, $BodyText.Length)))"
    }

    $screenshot = Invoke-Cdp -WebSocketUrl $Target.webSocketDebuggerUrl -Method "Page.captureScreenshot" -Params @{
        format = "png"
        fromSurface = $true
    }
    [IO.File]::WriteAllBytes($ScreenshotPath, [Convert]::FromBase64String([string]$screenshot.result.data))

    Write-Host "JARVIS Electron renderer smoke passed."
    Write-Host "App: $AppPath"
    Write-Host "Screenshot: $ScreenshotPath"
    Write-Host "Status: $StatusVersion"
    Write-Host "Stats CPU: $StatsCpu"
    Write-Host "Detected text: $($BodyText -replace '\s+', ' ' | Select-Object -First 1)"
}
finally {
    if ($Process -and -not $Process.HasExited) {
        $Process.CloseMainWindow() | Out-Null
        if (-not $Process.WaitForExit(5000)) {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        }
    }

    & (Join-Path $RepoRoot "ops\run\desktop\stop-jarvis.ps1") | Out-Null

    if ($null -eq $PreviousBackendPort) {
        Remove-Item Env:\JARVIS_DESKTOP_BACKEND_PORT -ErrorAction SilentlyContinue
    }
    else {
        $env:JARVIS_DESKTOP_BACKEND_PORT = $PreviousBackendPort
    }

    if ($null -eq $PreviousNoRuntime) {
        Remove-Item Env:\JARVIS_LOCAL_RUNTIME_AUTOSTART -ErrorAction SilentlyContinue
    }
    else {
        $env:JARVIS_LOCAL_RUNTIME_AUTOSTART = $PreviousNoRuntime
    }

    if ($null -eq $PreviousModelsDir) {
        Remove-Item Env:\JARVIS_MODELS_DIR -ErrorAction SilentlyContinue
    }
    else {
        $env:JARVIS_MODELS_DIR = $PreviousModelsDir
    }

    if ($null -eq $PreviousResourceRoot) {
        Remove-Item Env:\JARVIS_RESOURCE_ROOT -ErrorAction SilentlyContinue
    }
    else {
        $env:JARVIS_RESOURCE_ROOT = $PreviousResourceRoot
    }

    if ($null -eq $PreviousPortableDir) {
        Remove-Item Env:\PORTABLE_EXECUTABLE_DIR -ErrorAction SilentlyContinue
    }
    else {
        $env:PORTABLE_EXECUTABLE_DIR = $PreviousPortableDir
    }

    if ($null -eq $PreviousPortableFile) {
        Remove-Item Env:\PORTABLE_EXECUTABLE_FILE -ErrorAction SilentlyContinue
    }
    else {
        $env:PORTABLE_EXECUTABLE_FILE = $PreviousPortableFile
    }

    if ($null -eq $PreviousRemoteDebuggingPort) {
        Remove-Item Env:\JARVIS_REMOTE_DEBUGGING_PORT -ErrorAction SilentlyContinue
    }
    else {
        $env:JARVIS_REMOTE_DEBUGGING_PORT = $PreviousRemoteDebuggingPort
    }
}
