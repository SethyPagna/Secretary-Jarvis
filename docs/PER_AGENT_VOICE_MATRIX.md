# Per-Agent Voice Matrix

Jarvis now exposes each named soul through `/api/voice/agent-matrix`. The endpoint joins the soul, voice profile, sample asset, engine preference, runtime readiness, and a short local test phrase.

## Current Behavior

- The HUD Voice panel shows all eight souls as compact voice chips.
- Clicking a soul sends a local `/api/audio/tts` request with that soul's `agentId`, `voiceProfileId`, and test phrase.
- If Piper is not installed, ready profiles use the current local fallback path, such as Windows SAPI or the supplied Jarvis voice sample.
- Staged profiles are still distinct in personality, routing, and metadata; they become richer spoken voices after Piper voices or future cloned voice assets are installed.

## Voice Personalities

| Soul | Intended Sound | Purpose |
| --- | --- | --- |
| Jarvis | Calm, cinematic, concise command voice | Manager voice for owner-facing summaries |
| Friday | Warm, efficient, secretary-like | Daily operations, scheduling, briefings |
| Daedalus | Precise, technical, focused | Coding, architecture, repo reasoning |
| Argus | Quiet, alert, observational | Vision, screen, OCR, sensor context |
| Mnemosyne | Soft, reflective archivist | Memory, timeline, consolidation |
| Sentinel | Firm, careful, security-oriented | Safety review and approvals |
| Vulcan | Grounded, mechanical, systems-focused | Local services, scripts, device control |
| Hermes | Smooth, diplomatic, communication-first | Email, social drafts, messaging |

## Runtime Contract

Use this request to test any soul:

```json
{
  "agentId": "sentinel",
  "voiceProfileId": "voice-profile-sentinel",
  "text": "Approval is required before I allow that action."
}
```

Send it to:

```text
POST /api/audio/tts
```

The response includes the effective `voiceProfile`, `agent`, `engine`, `audioPath` when available, and an interruptible flag.

## Future Upgrade Path

Install Piper plus separate ONNX voice pairs for the staged souls, or add future cloned local voices. The existing matrix endpoint and HUD chips are already wired, so new voice assets can plug into the profile records without changing the UI flow.
