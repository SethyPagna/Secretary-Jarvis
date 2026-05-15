# Reference Source Audit

Jarvis is the owned product shell. OpenClaw, Ruflo, and the additional Jarvis ZIPs are local references only.

## Imported Locally

- `vendor/reference/openclaw-main`
  - License found.
  - Useful patterns: local-first gateway, skill manifests, channel routing, guardrail framing.
- `vendor/reference/ruflo`
  - MIT license found.
  - Useful patterns: swarm coordination, task graph, agent health, worker/reviewer loops.
- `vendor/reference/jarvis-opensource/ada_v2-main`
  - License found.
  - Useful patterns: Python assistant backend, voice-oriented structure, auth hooks.
- `vendor/reference/jarvis-opensource/Mark-XXXIX-main`
  - No license file detected in ZIP.
  - Use for ideas only unless license is clarified.
- `vendor/reference/jarvis-opensource/Mark-XXXIX-OR-main`
  - No license file detected in ZIP.
  - Use for ideas only unless license is clarified.
- `vendor/reference/jarvis-opensource/OpenJarvis-main`
  - License found.
  - Useful patterns: community assistant organization, eval-oriented layout, tool modules.

## Adoption Rules

- Copy ideas, not product shells.
- Preserve license notices for any code copied verbatim.
- Wrap all adopted behavior behind Jarvis-owned interfaces.
- Every connector must go through the policy engine before it touches files, devices, apps, network, or social channels.
- Anything without a clear license is inspiration only.
