# OpenCode Routing Guardrails (2026-06-05)

**Date**: 2026-06-05  
**Scope**: OpenCode routing and MCP boundary for the root repo and `sveltekit-frontend`

## What Was Fixed

The OpenCode workspace config was still broad enough to allow repo questions to drift into generic Gemma-style chat behavior. I tightened both config surfaces so repo work is routed through evidence first:

- `C:\Users\james\Videos\deeds-web-app\opencode.json`
- `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\opencode.json`

The same pass also made the agents prefer ACE hits and Bitfrost-backed cache evidence when the question is about repeated or semantic retrieval.

## Current Routing Contract

- `engram-embed` is stdio-only and embeddings-only.
- `gemma4-offload` is repo-audit-only.
- `antigravity`, `hermes-ace`, `trace-audit`, and `audit` are evidence-first.
- `workspace-bootstrap` now loads ACE hits, Parent Atlas recommendations, and Bitfrost cache health before work starts.
- `repo_report_answer` is the preferred path for report snippets, file snippets, and command output.
- Generic chat, identity text, model recommendation text, and tutorial output are rejected at the tool boundary.

## Why This Mattered

The root workspace in OpenCode was still attached to broader prompts and stale routing state. That caused repo-task prompts to be handled like generic chat instead of report-grounded audit work.

The fix narrows routing so repo tasks must use:

1. `recommendations.md`
2. Parent Atlas / ACE evidence
3. MCP tools only as needed for the question

## Validation

- `node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('opencode.json','utf8')); console.log('root opencode.json valid')"`
- `node scripts/cache/verify-bifrost-cache.mjs`
- `node scripts/smoke/bifrost-trace-smoke.mjs`
- `node sveltekit-frontend/scripts/mcp/audit-sidecar-transports.mjs`
- `node sveltekit-frontend/scripts/smoke-opencode-mcp-sidecars.mjs`

## Operational Note

OpenCode must be restarted to reload `opencode.json`. Until restart, the UI can keep the old routing policy in memory and continue showing stale behavior.

## Current Smoke Result

- Bitfrost Redis exact-hit smoke: pass
- Bitfrost trace smoke: pass
- TRACE MCP smoke: pass
- Qdrant health: pass
- Ollama health: pass
- OpenCode routing now points repo-task prompts at ACE hits before model-only answers

## Next Remaining Issue

If OpenCode still shows `trace Failed to get tools` or stale generic model output after restart, the remaining problem is client-side reload / MCP handshake state, not the underlying TRACE or Bitfrost services.
