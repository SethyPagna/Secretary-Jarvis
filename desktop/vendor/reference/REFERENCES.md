# Vendor References

Jarvis is its own product. These projects are references and potential MIT-licensed source imports after review.

## OpenClaw

- Local source: `vendor/reference/openclaw-main`
- Original archive: `../openclaw-main.zip`
- Upstream: https://github.com/openclaw/openclaw
- License: MIT, preserved in `vendor/reference/openclaw-main/LICENSE`
- Relevant ideas: gateway, local-first assistant control plane, skills, memory, channels, companion UI patterns, local model routing.
- Import rule: copy only reviewed modules into Jarvis-owned packages with attribution and tests.

## Ruflo

- Local source snapshot: `vendor/reference/ruflo`
- Upstream: https://github.com/ruvnet/ruflo
- License: MIT, preserved in `vendor/reference/ruflo/LICENSE`
- Relevant ideas: swarm orchestration, MCP coordination, worker roles, self-learning loops, memory-backed agent workflows.
- Import rule: the full clone attempted to pull large Git/LFS content, so this snapshot keeps README, package metadata, and license. Pull deeper code only for a specific reviewed component.
