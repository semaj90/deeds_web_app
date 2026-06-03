# OpenCode Context Window Configuration

## Problem

OpenCode (antigravity agent) reports 32k context. The actual running llama-server at `:8090` was launched with `n_ctx: 16384` — confirmed via `GET /slots` returning `"n_ctx": 16384`.

## Two separate caps — both must be set

| Layer | Where | Controls |
|---|---|---|
| **Server-side** | llama-server `-c` flag | KV cache allocation — how many tokens the server can hold in context at once |
| **Client-side** | `opencode.jsonc` model `contextLength` / `limit.context` | How many tokens OpenCode will send per request |

If either is too small, context is silently truncated at that layer.

## What is `/slots`?

`GET http://127.0.0.1:8090/slots` is a llama-server diagnostic endpoint. Each slot represents one parallel inference context — with `--parallel 4` there are 4 slots, each holding its own KV cache for a concurrent request. The `n_ctx` field on each slot is the **actual allocated context size the server was launched with** (the `-c` flag value), not the model's trained maximum (`n_ctx_train` from `/v1/models`). It is the ground truth for "what context window is the server running right now."

```powershell
# Verify running context size — should be 65536
(Invoke-RestMethod http://127.0.0.1:8090/slots)[0].n_ctx
```

Compare with `/v1/models` which returns `meta.n_ctx_train: 131072` — that is the model architecture's trained maximum, not what was allocated at launch.

## Root cause analysis (verified 2026-06-02)

`GET http://127.0.0.1:8090/slots` returned:
```json
{ "n_ctx": 16384 }
```

The server was **not** launched via `launch-turboquant.ps1` (which defaults `-c 65536`). It was started by some other process or shortcut that didn't load `.env` or passed `-c 16384` directly.

`.env` has `TURBO_CTX=65536` and `LLM_CONTEXT_SIZE=65536` — these are correct but only take effect when launching via the script.

## Fix — server side (required)

Restart llama-server via the canonical launcher so `.env` is loaded:

```powershell
# From repo root
.\scripts\launch-turboquant.ps1
# or detached:
.\scripts\launch-turboquant.ps1 -Detached
```

Verify after restart:
```powershell
curl http://127.0.0.1:8090/slots | ConvertFrom-Json | Select-Object -ExpandProperty n_ctx
# Should return 65536
```

## Fix — client side (already applied)

`opencode.jsonc` (repo root) uses the `limit.context` format for the `turboquant` provider:

```jsonc
"models": {
  "gemma4-legal.gguf": {
    "name": "Gemma4 Legal IQ4_XS (merged rotorquant, canonical)",
    "limit": {
      "context": 65536,
      "output": 4096
    }
  }
}
```

`~/.config/opencode/opencode.jsonc` uses the `contextLength` format:

```jsonc
"models": {
  "gemma4": {
    "name": "Gemma4 RotorQuant",
    "contextLength": 65536
  }
}
```

Both formats are supported by OpenCode — use whichever matches your config schema version.

## `launch-turboquant.ps1` context resolution chain

```
LLM_CONTEXT_SIZE  →  TURBO_CTX  →  LLAMA_SERVER_CTX  →  OLLAMA_CONTEXT_LENGTH  →  65536 (hardcoded default)
```

All four env vars are checked in order. `.env` sets `LLM_CONTEXT_SIZE=65536` and `TURBO_CTX=65536` so the script always wins — but only if the script is used to launch the server.

## Rule

Always start llama-server via `launch-turboquant.ps1`. Launching the exe directly (e.g. from a shortcut, VS Code task, or bare terminal command) will skip `.env` loading and use whatever `-c` value was hardcoded in that invocation. If the shortcut/task doesn't pass `-c`, llama-server defaults to 512 or its own internal default — not 65536.

After any restart, verify with:
```powershell
(curl http://127.0.0.1:8090/slots | ConvertFrom-Json)[0].n_ctx
```

---

## `ROTORQUANT_KV_ENABLED` — dead env var (2026-06-02)

`.env` line 123 sets `ROTORQUANT_KV_ENABLED=true`. This variable has **no effect** — `launch-turboquant.ps1` never reads it.

**Canonical sourceref:** [`scripts/launch-turboquant.ps1`](../../scripts/launch-turboquant.ps1) — this is the only place KV cache types are resolved. It reads:

```
TURBO_PROFILE  →  TURBO_KV_K / TURBO_KV_V  (explicit overrides)
```

The current server was launched with `-ctk q8_0 -ctv q8_0` (stock baseline). If `ROTORQUANT_KV_ENABLED` was meant to activate a different KV profile (e.g. `turboquant` → `-ctv turbo3`), it needs to be wired into the launcher explicitly — or replaced with `TURBO_PROFILE=turboquant` which the launcher already understands.

Until then `ROTORQUANT_KV_ENABLED` is inert and can be removed without consequence.

---

## Resolution log — 2026-06-02

**Symptom:** OpenCode antigravity agent showed 32k context window.

**Confirmed via `/slots`:** server was running at `n_ctx: 16384`.

**Root causes found (two issues):**

1. **`.env` model path was stale** — `ROTORQUANT_MODEL_PATH` and `TURBO_MODEL_PATH` pointed at `vendor/models/gemma4-legal.gguf` which doesn't exist. The actual model is at `C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs-direct.gguf`. This caused `launch-turboquant.ps1` to throw before it could even start the server, so something else (likely a bare shortcut or old task) had launched the server at 16k.

2. **OpenCode client config missing `contextLength`** — `~/.config/opencode/opencode.jsonc` model entries had no context cap set, causing OpenCode to fall back to its internal default.

**Fixes applied:**

- `.env` lines 104–105: `ROTORQUANT_MODEL_PATH` and `TURBO_MODEL_PATH` updated to `C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs-direct.gguf`
- `~/.config/opencode/opencode.jsonc`: added `"contextLength": 65536` to all model entries
- Server restarted directly with correct flags (`-c 65536 -ngl 99 -fa on -ctk q8_0 -ctv q8_0`) — verified `n_ctx = 65536` via `/slots`

**`launch-turboquant.ps1` now works** — model path resolves, `.env` is loaded, script launches with `-c 65536`. Use it for all future restarts.
