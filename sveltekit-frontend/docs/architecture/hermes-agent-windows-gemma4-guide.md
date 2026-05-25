---
name: Hermes Agent on Windows + WSL2 + local Gemma4
description: How to install Hermes Agent (Nous Research) as an optional research/dashboard/memory lane that points at this stack's existing local Gemma4 (Ollama or TurboQuant) and TRACE MCP read-only tools. Hermes complements Claude Code; it does not replace it.
type: project
tags:
  - hermes
  - wsl2
  - windows
  - ollama
  - turboquant
  - mcp
  - dashboard
  - optional
---

# Hermes Agent on Windows + WSL2 + local Gemma4

**Status**: optional lane, not in the critical path of any pipeline.
**Canonical role**: research / planning / persistent memory / agent
dashboard, pointed at the same local Gemma4 + TRACE MCP that the
synthesis loop already uses.

## TL;DR

```
Windows native:                     WSL2 (Ubuntu):
  Ollama         :11434              Hermes Agent dashboard  :9119
  TurboQuant llama-server :8090      Hermes Agent gateway    :8642
  TRACE MCP      :8788               (gateway only when you want
  gemma4-offload (stdio)              Open WebUI in front of Hermes)
  SvelteKit dev  :5173
  Claude Code (CLI + IDE ext.)
```

Hermes runs in WSL2. It points back at the Windows-hosted Ollama,
TurboQuant, and TRACE MCP via the WSL→Windows host IP. **Nothing
about the existing synthesis loop changes**; Hermes is an additional
front-end that can drive the same toolbox.

## When Hermes is the right tool

Use Hermes when you want:

- **An always-on research dashboard** (browser UI on `127.0.0.1:9119` per
  Hermes docs) that retains conversation memory across days/weeks.
- **A skill / job / memory layer** that sits *next to* Claude Code, not
  inside it — useful for "explore X for an hour and write up findings"
  workflows that don't need to land code.
- **An Open WebUI bridge** (via the Hermes OpenAI-compatible gateway on
  `127.0.0.1:8642`) so you can drive everything from a familiar chat UI
  without touching Claude Code at all.

Use the existing **gemma4-offload stdio MCP** (already shipped at
`scripts/mcp/gemma4-offload-mcp.mjs`) when you want:

- **Cheap local generation called from inside Claude Code** (drafting
  commit messages, summarising tool output, classifying chunks).
- **Token savings on a per-tool-call basis** for the active session.

Use the **synthesis loop** (`scripts/synth/run-loop.mjs`) when you want:

- **A markdown implementation brief** to hand off to Claude Code so it
  spends ~3-8 K tokens on the final edit instead of 30-80 K on
  discovery.

These are three distinct lanes. Hermes does **not** replace either.

## When Hermes is the wrong tool

- **Don't** run Hermes natively on Windows. The official-style docs
  describe Hermes as working best on Linux/macOS/WSL2; the embedded
  TUI chat features need POSIX/PTY support that Windows Python lacks
  cleanly. Use WSL2.
- **Don't** make Hermes the primary tool for editing code. Claude
  Code remains the implementation operator (per
  [claude-code-agent-os.md](claude-code-agent-os.md)).
- **Don't** expose write-side TRACE MCP tools to Hermes. Hermes is
  read-only against this stack's infrastructure.
- **Don't** treat Hermes as a canonical truth store. Anything Hermes
  generates that matters lands in the same Postgres / Obsidian /
  Karpathy lanes the rest of the stack uses (per
  [obsidian-neo4j-couchdb-alignment.md](obsidian-neo4j-couchdb-alignment.md)).

## Install (WSL2 + Hermes)

### 1. WSL2 Ubuntu (one-time, native Windows side)

```powershell
# PowerShell, as your user
wsl --install -d Ubuntu
wsl
```

### 2. Hermes prerequisites (inside WSL)

```bash
sudo apt update
sudo apt install -y curl git python3 python3-pip python3-venv nodejs npm
```

### 3. Install Hermes

The Hermes install method varies between releases. Two known forms:

```bash
# A) Official installer (per Hermes docs at hermes-agent.nousresearch.com)
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
source ~/.bashrc

# B) Or pip (if the installer URL is stale or moves)
pip install "hermes-agent[all]"
```

If both fail, the canonical reference is the
[Hermes Agent docs](https://hermes-agent.nousresearch.com/) — they
maintain the install instructions for the current release.

### 4. First-run config

```bash
hermes setup       # interactive: picks model provider + initial config
hermes model       # change model later — pick "Custom Endpoint" for our stack
hermes dashboard   # launches local web UI per Hermes docs
```

The dashboard binds to `127.0.0.1:9119` per Hermes docs by default.
Don't expose it outward.

## Wiring Hermes to local Gemma4

Hermes accepts any OpenAI-compatible endpoint. The two we expose:

### Option A — Ollama (simpler)

On Windows (PowerShell, kept native):

```powershell
# stop any previous instance
taskkill /IM ollama.exe /F   # if running
$env:OLLAMA_FLASH_ATTENTION = "1"
$env:OLLAMA_KV_CACHE_TYPE   = "q8_0"
ollama serve
```

In a second PowerShell:

```powershell
ollama list
ollama pull gemma4-rotorquant:latest   # or whatever model you've fine-tuned
```

If you need the long-context variant Hermes prefers (per Hermes docs
multi-step tool workflows want ~64 K context), build a Modelfile:

```text
# C:\…\Modelfile.gemma4-64k
FROM gemma4-rotorquant:latest
PARAMETER num_ctx 65536
```

```powershell
ollama create gemma4-rotorquant:latest -f C:\path\to\Modelfile.gemma4-64k
```

Then in **WSL Hermes**:

```bash
hermes model
# choose Custom Endpoint / OpenAI-compatible:
#   Base URL: http://<WINDOWS_HOST_IP>:11434/v1
#   Model:    gemma4-rotorquant:latest       (or gemma4-rotorquant:latest)
#   API key:  ollama
```

To find `<WINDOWS_HOST_IP>` from inside WSL:

```bash
cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
```

(Recent Windows builds also resolve `host.docker.internal` from WSL —
try that first; fall back to the resolv.conf IP if it fails.)

### Option B — TurboQuant llama-server (richer KV-cache control)

This repo's canonical generation backend lives on **port 8090** (per
[CLAUDE.md](../../../CLAUDE.md) "TRACE runtime split"; the operator
note in the parent message had this as 8080 — use 8090 here).

Start it on Windows the same way you would for the existing synthesis
loop:

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
$env:LLAMA_SERVER_PATH = "C:\Users\james\Videos\deeds-web-app\tools\llama-server\llama-server.exe"
$env:TURBO_PROFILE     = "turboquant"   # or "stock" — see CLAUDE.md profiles
$env:TURBO_CTX         = "65536"
npm run turbo:start:detached
```

Verify:

```powershell
curl http://127.0.0.1:8090/health
curl http://127.0.0.1:8090/v1/models
```

Wire Hermes to it (in WSL):

```text
Base URL: http://<WINDOWS_HOST_IP>:8090/v1
Model:    gemma4   (or whatever /v1/models returns)
API key:  local
```

**TurboQuant binary caveat for Gemma 4**: Gemma 4 attention has
`head_dim=256` on SWA layers and `head_dim=512` on global layers; most
TurboQuant prebuilts (TheTom's tqp-v0.1.1) ship `D=128`-only kernels
and **crash silently on Gemma 4**. For Gemma 4, build the test1111
fork per the CLAUDE.md "TurboQuant — Google ICLR 2026 Paper" section.
Stock `q8_0/q8_0` is always safe; Gemma 4 + `turbo3/turbo4` requires
the right binary.

## Wiring Hermes to TRACE MCP (read-only)

Hermes supports MCP per its docs. Add the TRACE server as a read-only
tool source:

```text
Server name: trace-readonly
Transport:   HTTP / SSE
URL:         http://<WINDOWS_HOST_IP>:8788/mcp
```

**Allow** Hermes to see only these tool name patterns (configure via
Hermes' tool allowlist or its skills layer):

| Allowed | Why |
|---------|-----|
| `trace.kag_search` | semantic search over chunks + cards |
| `trace.explain_retrieval` | shows the retrieval trace |
| `kb.hybrid_search` / `kb.search_pathways` | KB lane |
| `db.schema_overview` / `db.table_inspect` | read-only Drizzle inspection (Phase B) |
| `topology.search_4d` / `topology.search_som_neighborhood` | topology lookup |
| `graph.expand_neighborhood` / `graph.pagerank_top` | graph reads |
| `context.build_kv_packet` / `context.get_compressed_card` | ACE context cards |
| `trace.system_health` (if present) | dashboard widget |

**Block** these regardless of what Hermes' UI lets you toggle:

| Blocked | Why |
|---------|-----|
| `shell.*`, `bash.*`, `exec.*` | no shell from Hermes — that's Claude Code's job |
| `db.execute_write`, `db.run_migration`, anything matching `db.*write*` | DB writes go through SvelteKit + Drizzle, never an agent |
| `cache.delete_*`, `redis.flush*` | cache invalidation is operator-controlled |
| `rabbitmq.publish_*`, `queue.publish_*` | producers are typed services |
| `graph.materialize_pathway`, `topology.recompute*` | heavy jobs run from validated scripts |
| `kag.ingest_*` (write side) | ingestion is owned by the daily/heavy lanes |

If Hermes' MCP client doesn't support per-tool deny patterns, use a
narrower trace MCP URL that exposes only the read-only subset (e.g.
`http://...:8788/mcp/readonly` if/when we add a filtered transport).
Until then, treat Hermes as a *trusted operator* — same as the human
running it — and audit periodically.

## Optional — Open WebUI in front of Hermes

Per Hermes docs, enabling the Hermes OpenAI-compatible gateway gives
Open WebUI a backend to talk to:

```bash
# in WSL, ~/.hermes/.env or equivalent
API_SERVER_ENABLED=true
API_SERVER_KEY=your-secret-key
```

```bash
hermes gateway   # listens on 127.0.0.1:8642 per docs
```

Open WebUI then connects to `http://<WINDOWS_HOST_IP>:8642/v1` with
the secret key. The chat goes:

```
Open WebUI  →  Hermes  →  Gemma4 (Ollama or TurboQuant)
                       →  TRACE MCP read-only tools
```

This is the cleanest "I want a chat UI that knows my codebase but
isn't Claude Code" setup. It's still optional.

## Recommended workflow (where Hermes fits)

```
Hermes Agent (WSL2 dashboard or Open WebUI)
  → broad research / planning question
  → calls TRACE MCP read tools (kag_search, db.table_inspect, …)
  → drafts plan.md / evidence.json into a shared folder

Synthesis loop (scripts/synth/run-loop.mjs)
  → if the plan needs implementation, the operator can pipe Hermes'
    output into the loop's --query, OR write a brief manually
  → loop produces memory/implementation-briefs/<ts>_<slug>.md

Claude Code
  → reads ONE markdown brief
  → uses .claude/skills/* + .claude/agents/* + hooks
  → edits files, runs smoke, archives result

TRACE / KAG
  → ingests result back into pathway cards / wiki / Neo4j / CouchDB
```

The token math from
[the synthesis-loop plan](../../../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md)
is unchanged — Hermes' lane is upstream of the brief, not a substitute
for the brief.

## Minimal install checklist

1. WSL2 Ubuntu installed (`wsl --install -d Ubuntu`).
2. Hermes installed in WSL.
3. Ollama or TurboQuant running on Windows with the Gemma 4 model loaded.
4. `<WINDOWS_HOST_IP>` discoverable from WSL (`cat /etc/resolv.conf | grep nameserver`).
5. Hermes pointed at the Windows OpenAI-compatible endpoint via `hermes model`.
6. Hermes dashboard launched (`hermes dashboard`, opens `127.0.0.1:9119` per Hermes docs).
7. TRACE MCP added to Hermes as a read-only tool source, allowlisted to the read-only tool patterns above.
8. (Optional) Hermes gateway enabled, Open WebUI pointed at `127.0.0.1:8642` per Hermes docs.

## Cross-references

- [2026 MCP ecosystem survey](mcp-ecosystem-survey-2026.md) — placed Hermes in the "not what we need as a planner" row; this guide is the "but it can still be useful as an optional dashboard" answer to the same question.
- [Synthesis loop plan](../../../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md) — Phase G evaluation matrix for local-deep-research / LangGraph applies the same logic Hermes does.
- [Gemma4 → Claude Code handoff](gemma4-to-claude-code-handoff.md) — explains why the brief.md is the cost-saving artifact, regardless of which agent wrote it.
- [Claude Code agent-OS](claude-code-agent-os.md) — clarifies Claude Code remains the implementation operator; Hermes is operator-adjacent, not operator-replacing.

## Verification facts (verified 2026-05-09)

The earlier [MCP ecosystem survey](mcp-ecosystem-survey-2026.md) row
on Hermes Agent was: "Real product, not a desktop UI for codebase
ingestion → implementation planner. It's a self-improving conversational
agent (Python + agentic loop) with a TUI and a codebase introspection
skill, but it's not a design tool or implementation planner."

That conclusion still holds for the *implementation* path — Claude
Code stays the operator. This guide adds the missing nuance: Hermes
is a perfectly fine *research / dashboard / memory* lane if the
operator wants a persistent agent UI on top of the same local Gemma 4
+ TRACE MCP that everything else uses.

Port conventions, dashboard URL, gateway URL, and "needs ~64 K
context" claim all come from Hermes' own docs; verify against the
current Hermes release before committing time to this lane.
