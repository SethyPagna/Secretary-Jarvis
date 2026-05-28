# Jarvis-Agent PR #30035 — Bitwarden Secrets Manager Integration

## Hero
**ONE TOKEN, EVERY KEY**
Rotate once. Every Jarvis process picks it up on next start.
`secrets.bitwarden.override_existing: true` (default)

## Cells

### Lazy Install
- `bws v2.0.0` pinned
- Downloaded into `~/.jarvis/bin/bws`
- SHA-256 verified vs GitHub Releases checksum file
- No apt, no brew, no sudo
- Cross-platform: linux gnu+musl, macos universal, windows x86_64+arm64

### CLI Surface
- `jarvis secrets bitwarden setup`     wizard
- `jarvis secrets bitwarden status`    diagnose
- `jarvis secrets bitwarden sync`      dry-run / --apply
- `jarvis secrets bitwarden install`   binary only
- `jarvis secrets bitwarden disable`   off switch

### Source of Truth
- Bitwarden WINS on every Jarvis start
- BSM values overwrite stale `.env` lines
- Rotate a key once → all your machines reload it
- Bootstrap token `BWS_ACCESS_TOKEN` is the lone exception (never overwritten)

### Never Blocks Startup
- Missing binary → warn + continue
- Bad token → warn + continue
- Checksum mismatch → refuse install + warn
- No network → warn + continue
- Timeout → 30s ceiling, warn + continue

### Tests
- 26/26 passing, hermetic
- subprocess + urllib mocked
- Platform matrix tested (linux, macos, windows × x86_64, arm64)
- Cache hit/miss, auth fail, non-JSON, timeout, override behavior

### Config
```yaml
secrets:
  bitwarden:
    enabled: true
    project_id: <uuid>
    override_existing: true   # NEW DEFAULT
    cache_ttl_seconds: 300
    auto_install: true
```

## Footer
PR #30035 · commit 7f9b05668 · JARVISProject/jarvis-agent

10 files changed · +1743 / -1 · agent/secret_sources/ · jarvis_cli/secrets_cli.py · tests · docs
