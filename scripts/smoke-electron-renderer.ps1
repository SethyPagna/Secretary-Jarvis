param(
    [int]$BackendPort = 18768,
    [int]$DebugPort = 19223,
    [int]$TimeoutSec = 90,
    [string]$ScreenshotPath = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ElectronCmd = Join-Path $RepoRoot "node_modules/.bin/electron.cmd"
if (-not (Test-Path $ElectronCmd)) {
    throw "Electron command not found at $ElectronCmd. Run npm install first."
}

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

$PreviousBackendPort = $env:JARVIS_DESKTOP_BACKEND_PORT
$PreviousNoRuntime = $env:JARVIS_LOCAL_RUNTIME_AUTOSTART
$PreviousModelsDir = $env:JARVIS_MODELS_DIR
$PreviousResourceRoot = $env:JARVIS_RESOURCE_ROOT
$Process = $null

try {
    $env:JARVIS_DESKTOP_BACKEND_PORT = [string]$BackendPort
    $env:JARVIS_LOCAL_RUNTIME_AUTOSTART = "0"
    $env:JARVIS_RESOURCE_ROOT = [string]$RepoRoot
    $modelsDir = Resolve-Path (Join-Path $RepoRoot "..\models") -ErrorAction SilentlyContinue
    if ($modelsDir) {
        $env:JARVIS_MODELS_DIR = [string]$modelsDir
    }

    $Process = Start-Process `
        -FilePath $ElectronCmd `
        -ArgumentList @(".", "--remote-debugging-port=$DebugPort") `
        -WorkingDirectory $RepoRoot `
        -WindowStyle Hidden `
        -PassThru

    $Deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
    $Target = $null
    do {
        try {
            $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json/list" -TimeoutSec 2
            $Target = @($targets | Where-Object { $_.type -eq "page" -and $_.webSocketDebuggerUrl } | Select-Object -First 1)[0]
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    } until ($Target -or [DateTime]::UtcNow -gt $Deadline)

    if (-not $Target) {
        throw "Electron renderer did not expose a debuggable page on port $DebugPort."
    }

    $Ready = $false
    $BodyText = ""
    $StatusVersion = ""
    $StatsCpu = ""
    do {
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
        $StatusVersion = [string]$statusEval.result.result.value
        $StatsCpu = [string]$statsEval.result.result.value
        $Ready =
            $BodyText -match "JARVIS" -and
            $BodyText -match "Terminal / Chat Input" -and
            $BodyText -match "How can I help" -and
            $BodyText -notmatch "\bOFFLINE\b" -and
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

    & (Join-Path $RepoRoot "stop-jarvis.ps1") | Out-Null

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
}
