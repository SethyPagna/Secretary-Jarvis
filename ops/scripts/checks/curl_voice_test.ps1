param(
  [string]$BaseUrl = "http://127.0.0.1:8765",
  [string]$AudioPath = ""
)

$html = Invoke-WebRequest -UseBasicParsing -Uri $BaseUrl
if ($html.Content -notmatch "__JARVIS_SESSION_TOKEN__\s*=\s*['""]([^'""]+)['""]") {
  throw "Could not discover JARVIS session token from $BaseUrl"
}
$token = $Matches[1]
$headers = @{ "X-Jarvis-Session-Token" = $token }

if (-not $AudioPath) {
  $tts = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/voice/synthesize" -Headers $headers -ContentType "application/json" -Body (@{ text = "Jarvis voice curl test." } | ConvertTo-Json)
  if (-not $tts.success) { throw "TTS failed: $($tts.error)" }
  $AudioPath = Join-Path $env:TEMP "jarvis-voice-curl-test.wav"
  [IO.File]::WriteAllBytes($AudioPath, [Convert]::FromBase64String($tts.audio_base64))
}

Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/voice/transcribe" -Headers $headers -ContentType "audio/wav" -InFile $AudioPath
