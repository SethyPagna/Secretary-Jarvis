param(
    [string]$BackendPath = "dist\jarvis-backend\jarvis-backend.exe",
    [int]$Port = 18910,
    [switch]$SkipChat,
    [switch]$SkipVoice
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [string]$ContentType = "application/json",
        [int]$TimeoutSec = 60
    )
    $uri = "http://127.0.0.1:$Port$Path"
    $args = @{
        Method = $Method
        Uri = $uri
        Headers = $Headers
        TimeoutSec = $TimeoutSec
        UseBasicParsing = $true
    }
    if ($null -ne $Body) {
        if ($Body -is [byte[]]) {
            $args.Body = $Body
        } else {
            $args.Body = ($Body | ConvertTo-Json -Depth 20)
        }
        $args.ContentType = $ContentType
    }
    $response = Invoke-WebRequest @args
    return $response.Content | ConvertFrom-Json
}

$backend = Resolve-Path -LiteralPath $BackendPath
$oldResourceRoot = $env:JARVIS_RESOURCE_ROOT
$oldLlamaServerPath = $env:JARVIS_LLAMA_SERVER_PATH
$oldModelsDir = $env:JARVIS_MODELS_DIR
$oldUpperPath = [Environment]::GetEnvironmentVariable("PATH", "Process")
$oldMixedPath = [Environment]::GetEnvironmentVariable("Path", "Process")
$resourceCandidates = @(
    (Join-Path (Resolve-Path ".").Path "release\win-unpacked\resources"),
    (Join-Path (Resolve-Path ".").Path "runtime")
)
$resourceRoot = $resourceCandidates | Where-Object { Test-Path (Join-Path $_ "runtime\llama.cpp\llama-server.exe") } | Select-Object -First 1
if ($resourceRoot) {
    $env:JARVIS_RESOURCE_ROOT = $resourceRoot
    $env:JARVIS_LLAMA_SERVER_PATH = Join-Path $resourceRoot "runtime\llama.cpp\llama-server.exe"
}
$modelCandidates = @(
    (Join-Path (Resolve-Path "..").Path "models"),
    (Join-Path (Resolve-Path ".").Path "models"),
    (Join-Path (Resolve-Path ".").Path "..\models")
)
$modelsDir = $modelCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($modelsDir) {
    $env:JARVIS_MODELS_DIR = $modelsDir
}
if ($oldUpperPath -and $oldMixedPath) {
    [Environment]::SetEnvironmentVariable("PATH", $null, "Process")
}
$diagnosticLogDir = Join-Path (Resolve-Path ".").Path "tmp"
New-Item -ItemType Directory -Force -Path $diagnosticLogDir | Out-Null
$stdoutLog = Join-Path $diagnosticLogDir "diagnose-backend-$Port.out.log"
$stderrLog = Join-Path $diagnosticLogDir "diagnose-backend-$Port.err.log"
Remove-Item -LiteralPath $stdoutLog, $stderrLog -ErrorAction SilentlyContinue
$process = Start-Process -FilePath $backend.Path -ArgumentList @("--host", "127.0.0.1", "--port", [string]$Port, "--no-open") -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

try {
    $deadline = (Get-Date).AddSeconds(60)
    $status = $null
    do {
        Start-Sleep -Milliseconds 500
        try {
            $status = Invoke-Json -Method "GET" -Path "/api/status" -TimeoutSec 3
        } catch {
            $status = $null
        }
    } while ($null -eq $status -and (Get-Date) -lt $deadline)

    if ($null -eq $status) {
        throw "Packaged backend did not become ready on port $Port."
    }

    $html = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 10).Content
    $match = [regex]::Match($html, "__JARVIS_SESSION_TOKEN__\s*=\s*['""]([^'""]+)")
    if (-not $match.Success) {
        throw "Could not discover dashboard session token."
    }
    $headers = @{ "X-Jarvis-Session-Token" = $match.Groups[1].Value }

    Write-Host "status.version=$($status.version)"

    $readiness = Invoke-Json -Method "GET" -Path "/api/runtime/readiness" -Headers $headers -TimeoutSec 30
    Write-Host "readiness.llm=$($readiness.llm.backend) ready=$($readiness.llm.ready) model=$($readiness.llm.model)"
    Write-Host "readiness.tts=$($readiness.tts.engine) ready=$($readiness.tts.ready)"
    Write-Host "readiness.stt=$($readiness.stt.engine) ready=$($readiness.stt.ready)"

    $models = Invoke-Json -Method "GET" -Path "/api/models/list" -Headers $headers -TimeoutSec 60
    $llmCount = @($models.models | Where-Object { $_.kind -eq "llm" }).Count
    $sttCount = @($models.models | Where-Object { $_.kind -eq "stt" }).Count
    $ttsCount = @($models.models | Where-Object { $_.kind -eq "tts" }).Count
    Write-Host "models.total=$(@($models.models).Count) llm=$llmCount stt=$sttCount tts=$ttsCount"
    if (@($models.models).Count -gt 0) {
        $models.models | Select-Object -First 6 | ForEach-Object {
            Write-Host "model.$($_.kind)=$($_.id)"
        }
    }

    try {
        $telegram = Invoke-Json -Method "GET" -Path "/api/messaging/telegram/status" -Headers $headers -TimeoutSec 10
        Write-Host "telegram.configured=$($telegram.configured) running=$($telegram.running) connected=$($telegram.connected) username=$($telegram.username) error=$($telegram.error)"
    } catch {
        Write-Host "telegram.exception=$($_.Exception.Message)"
    }

    try {
        $localStart = Invoke-Json -Method "POST" -Path "/api/runtime/local/start" -Headers $headers -TimeoutSec 150
        Write-Host "local_runtime.ok=$($localStart.ok) endpoint=$($localStart.endpoint) error=$($localStart.error)"
        if ($localStart.log_tail) {
            Write-Host "local_runtime.log_tail=$($localStart.log_tail -join ' | ')"
        }
    } catch {
        Write-Host "local_runtime.exception=$($_.Exception.Message)"
        if ($_.Exception.Response) {
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Host "local_runtime.error_body=$($reader.ReadToEnd())"
        }
        throw
    }

    if (-not $SkipChat) {
        $chatResponse = Invoke-WebRequest -UseBasicParsing `
            -Method POST `
            -Uri "http://127.0.0.1:$Port/api/desktop/chat/stream" `
            -Headers $headers `
            -ContentType "application/json" `
            -Body (@{ prompt = "Reply with exactly: JARVIS online." } | ConvertTo-Json) `
            -TimeoutSec 240
        $chatText = [string]$chatResponse.Content
        $done = $chatText -match "event:\s*done"
        $tokens = $chatText -match '"input_tokens"\s*:\s*[1-9]'
        Write-Host "chat_sse.done=$done tokens=$tokens"
        if (-not $done -or -not $tokens) {
            $preview = $chatText
            if ($preview.Length -gt 1000) {
                $preview = $preview.Substring(0, 1000)
            }
            Write-Host "chat_sse.preview=$preview"
        }
    }

    if (-not $SkipVoice) {
        try {
            $tts = Invoke-Json -Method "POST" -Path "/api/voice/synthesize" -Headers $headers -Body @{ text = "Jarvis voice diagnostic." } -TimeoutSec 120
        } catch {
            Write-Host "tts.exception=$($_.Exception.Message)"
            if ($_.Exception.Response) {
                $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                Write-Host "tts.error_body=$($reader.ReadToEnd())"
            }
            throw
        }
        Write-Host "tts.success=$($tts.success) engine=$($tts.engine) provider=$($tts.provider) bytes=$($tts.audio_bytes) latency_ms=$($tts.latency_ms)"
        if (-not $tts.success) {
            Write-Host "tts.error=$($tts.error)"
            Write-Host "tts.fallback_from=$($tts.fallback_from) reason=$($tts.fallback_reason)"
        }
        if ($tts.success -and $tts.audio_base64) {
            $audioBytes = [Convert]::FromBase64String([string]$tts.audio_base64)
            try {
                $stt = Invoke-Json -Method "POST" -Path "/api/voice/transcribe" -Headers $headers -Body $audioBytes -ContentType "audio/wav" -TimeoutSec 240
            } catch {
                Write-Host "stt.exception=$($_.Exception.Message)"
                if ($_.Exception.Response) {
                    $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                    Write-Host "stt.error_body=$($reader.ReadToEnd())"
                }
                throw
            }
            Write-Host "stt.success=$($stt.success) provider=$($stt.provider) latency_ms=$($stt.latency_ms) transcript=$($stt.transcript)"
        }
    }
}
finally {
    try {
        if ($headers) {
            Invoke-Json -Method "POST" -Path "/api/runtime/local/stop" -Headers $headers -TimeoutSec 15 | Out-Null
        }
    } catch {
    }
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
    $env:JARVIS_RESOURCE_ROOT = $oldResourceRoot
    $env:JARVIS_LLAMA_SERVER_PATH = $oldLlamaServerPath
    $env:JARVIS_MODELS_DIR = $oldModelsDir
    if ($oldUpperPath) {
        [Environment]::SetEnvironmentVariable("PATH", $oldUpperPath, "Process")
    }
    if ($oldMixedPath) {
        [Environment]::SetEnvironmentVariable("Path", $oldMixedPath, "Process")
    }
}
