# Agent Surface Decision Matrix — Local Gemma4 + TRACE MCP Stack

**Date**: 2026-05-09 · **Status**: canonical decision doc · **Supersedes**: any earlier "Cline wins / Hermes is a TUI toy / OpenCode is CLI-only" framing.

This is the cross-surface comparison. Sister docs:
- [`claude-code-agent-os.md`](./claude-code-agent-os.md) — Claude Code internals (skills, subagents, hooks, channels)
- [`hermes-agent-windows-gemma4-guide.md`](./hermes-agent-windows-gemma4-guide.md) — Hermes Agent specifics on Windows + Gemma4 wiring
- [`trace-runtime-split.md`](./trace-runtime-split.md) — runtime boundary rule (Gemma4 → MCP only)
- [`trace-kag-web-development-guide.md`](./trace-kag-web-development-guide.md) — 20-section practical web-dev guide
- [`mcp-ecosystem-survey-2026.md`](./mcp-ecosystem-survey-2026.md) — adopt-vs-build matrix for MCP servers
- [`gemma4-to-claude-code-handoff.md`](./gemma4-to-claude-code-handoff.md) — handoff brief format

## Verdict in one line

**Local Gemma4 plans through TRACE MCP → durable evidence bundle into the KAG pipeline → Claude Code only for the final implementation jump.** Agent-surface choice (Cline / OpenCode / Hermes) is now genuinely interchangeable at the planning layer — pick by editor ergonomics, not by capability gap.

## Corrections to earlier framing

The old summary "Cline wins because OpenCode is CLI-only and Hermes has no MCP" no longer holds. The corrected facts as of 2026-05-09:

| Earlier claim | Now-correct claim | Source |
|---------------|-------------------|--------|
| OpenCode is CLI-only | OpenCode ships terminal app + desktop app + web app + IDE extension; exposes JS/TS SDK + OpenAPI server | opencode.ai docs |
| Hermes Agent has no MCP | Hermes has built-in MCP, web dashboard, Open WebUI integration, ACP editor integration, skills with progressive disclosure | hermes-agent.nousresearch.com/docs |
| Cline is closed-source | Cline is open-source Apache-2.0; multi-surface (terminal + desktop + web + VS Code + Cursor + Windsurf + JetBrains) | cline.bot |
| Codex MCP support is immature | Codex supports MCP in BOTH CLI and IDE with shared config (stdio + streamable HTTP) | OpenAI Codex docs |
| Local model = Ollama only | All 4 surfaces support OpenAI-compatible endpoints — TurboQuant `:8090` / llama-server is a first-class provider, not a hack | per-surface provider docs |

## Comparison matrix (current state)

| Tool | Current reality | Best role in this stack |
|------|-----------------|-------------------------|
| **[Cline](https://cline.bot/)** | Open-source Apache-2.0; runs in VS Code, Cursor, Windsurf, JetBrains, and the CLI; supports Ollama, LM Studio, and OpenAI-compatible providers; supports MCP over local stdio AND remote SSE/streamable HTTP; exposes a TypeScript ACP-compatible SDK | **Most mature editor-first local coding loop** for Gemma4 + TRACE MCP if priority is interactive editing, approvals, diffs, and a strong IDE experience |
| **[OpenCode](https://opencode.ai/)** | Open-source MIT; terminal + desktop + web + IDE extension; supports local + remote MCP; built-in Build/Plan primary agents + subagents; exports sessions as JSON + Markdown; JS/TS SDK + OpenAPI server; supports llama.cpp, LM Studio, Ollama directly | **Most flexible open/local planner-harness today.** Strongest if you want a Gemma-first workflow that emits plan artifacts and is scriptable from TypeScript |
| **[Hermes Agent](https://hermes-agent.nousresearch.com/docs/)** | Open-source MIT; built-in MCP; local web dashboard; Open WebUI integration; ACP editor integration (VS Code, Zed, JetBrains); skills with progressive disclosure; local-model support via Ollama, vLLM, llama.cpp, SGLang, OpenAI-compatible endpoints | **Always-on research, memory, automation, knowledge-hub layer.** Has crossed into "agent operating system" territory — less editor-centric than Cline/OpenCode for tight implementation loops, but the only one with first-class persistent-agent + cron + messaging |
| **Codex (OpenAI)** | Open-source Rust; CLI + IDE + desktop; MCP in CLI AND IDE with shared config; stdio + streamable HTTP; OpenAI provider with `openai_base_url` override; custom providers; local OSS-provider modes | Stronger than older "MCP immature" characterization. Still a more natural fit for shops centered on ChatGPT/Codex than for a Gemma-first local stack |
| **Claude Code** | Premium implementation surface with plugin marketplaces, lazily loaded skills, context-isolated subagents, deterministic hooks, channels for MCP-pushed events, desktop GUI | **Implementation + review layer AFTER local Gemma/Hermes/OpenCode planning has already compressed the context.** The handoff target, not the research surface |

## Operating model — recommended stack

```
┌─────────────────────────────────────────────────────────────────┐
│ Local Gemma4 / Qwen runtime — split lanes                       │
│                                                                  │
│   Baseline:    Ollama :11434                                    │
│   Performance: TurboQuant llama-server :8090 (Q4_K_M + KV)      │
│                                                                  │
│   Both expose OpenAI-compatible endpoints.                       │
│   Pin per-tool to the right lane via openai_base_url override.   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ TRACE MCP (port 8788, 75 tools as of 2026-05-09)                │
│                                                                  │
│   The ONLY thing every agent surface is allowed to touch.        │
│   Read-only by default. Operator-gated for ops.* writes.         │
│   Adopted MCPs (.claude/mcp.json):                               │
│     neo4j NEO4J_READ_ONLY=true | qdrant search-only |            │
│     postgres-readonly | redis-readonly | obsidian-vault |        │
│     ts-lsp | context7 (hosted)                                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
    │ Cline (IDE)      │ │ OpenCode     │ │ Hermes Agent     │
    │ approval-first   │ │ plan/build   │ │ memory/cron/     │
    │ implementation   │ │ planner      │ │ Open WebUI       │
    │ loop             │ │ harness      │ │ research hub     │
    └─────────┬────────┘ └──────┬───────┘ └────────┬─────────┘
              │                 │                  │
              └────────┬────────┴──────────────────┘
                       │ compact handoff: evidence.json + plan.md + handoff.md
                       ▼
            ┌─────────────────────────────────────┐
            │ Claude Code (premium executor)      │
            │ skills + subagents + hooks +        │
            │ channels + desktop GUI              │
            │                                     │
            │ Sees ONLY the compressed brief      │
            │ — never the raw retrieval           │
            └─────────────────────────────────────┘
```

**Cost model:** Local Gemma4 lanes spend zero Claude tokens. Claude Code only consumes tokens for the compressed handoff (plan.md + evidence.json + handoff.md) plus the actual implementation diff. Per the synthesis-loop plan, this saves **~75-90% Claude tokens per implementation cycle** vs. having Claude Code re-discover everything.

## Decision rules — which surface to pick

| Goal | Pick | Why |
|------|------|-----|
| Smoothest IDE-native approval flow on Windows | **Cline** | Mature VS Code integration, diff-by-diff approvals, multi-IDE portable |
| Maximum openness + plan/build separation + TypeScript scripting | **OpenCode** | JS/TS SDK + session export + first-party desktop/web — emits the cleanest handoff artifacts |
| Always-on research agent with memory + cron + messaging | **Hermes** | Distinctive strengths: persistent agent on a server, knowledge hub feel, Open WebUI front |
| Already standardized on ChatGPT / Codex | **Codex** | Now genuinely MCP-capable; not a downgrade if your team is there |
| Final implementation + premium review | **Claude Code** | Skills + hooks + channels are designed for executor role, not researcher |

**Don't make this an "either/or" decision.** All four planning surfaces can sit on the **same TRACE MCP** + **same local runtime lanes**. Choose by ergonomics per workflow; the contract underneath is unchanged.

## Privacy / fully-local caveats

| Surface | Caveat |
|---------|--------|
| **OpenCode** | Some helper behavior may default to a small Zen-hosted model unless `small_model` is overridden. Sharing feature syncs to OpenCode servers. **For fully-local: pin both `model` and `small_model`, disable sharing.** |
| **Cline** | Simple — point directly at local endpoint, no hosted helpers |
| **Hermes** | Requires ≥64K context window for reliable multi-step tool calls. Less compelling as deep-reasoning coding agent if the local Gemma4 lane can't expose that |
| **Codex** | Hosted OpenAI default unless `openai_base_url` override is set + `--oss` mode used |
| **Claude Code** | Hosted by design (Anthropic API). Use only for the final compressed handoff |

## Evidence-bundle handoff contract

The compact bundle that flows from Cline/OpenCode/Hermes → Claude Code:

```
handoff/<TS>_<slug>/
├── evidence.json     raw MCP results + citations + chunk ids
├── graph.ndjson      Neo4j-bound nodes + edges (one JSON per line)
├── plan.md           human-readable plan
└── handoff.md        exact implementation brief Claude Code reads
```

Optimized for: OpenCode's session export semantics + Claude Code's skills/subagents context isolation. **Claude Code reads `handoff.md` only**; the other files are referenced by path so Claude can pull them on demand without burning tokens.

## What this changes vs. earlier work

- ✅ TRACE MCP repair (z.record + z.object unwrap pass) — already shipped, 75 tools enumerated
- ✅ `.claude/mcp.json` — 7 official MCPs wired (Neo4j / Qdrant / Postgres / Redis / Obsidian / TS-LSP / Context7)
- ✅ Browser Context Lane — operator's browser snapshot via the same MCP boundary
- ⏳ Mount + smoke the 7 official MCPs (~30 min)
- ⏳ Phase C synth loop CLI — operationalizes the handoff bundle
- ⏳ External Corpus Phase 1 (llms.txt registry) — feeds the Karpathy blend with external doc corpus
- ⏳ Choose primary agent surface for daily use (Cline vs OpenCode vs Hermes) — this is now a UX call, not a capability call

## Sources (verified 2026-05-09)

- Cline: https://cline.bot/
- OpenCode: https://opencode.ai/
- Hermes Agent: https://hermes-agent.nousresearch.com/docs/
- Claude Code: https://code.claude.com/docs/en/
- Codex: https://platform.openai.com/docs/codex
- TRACE MCP runbook: `next_steps/active/2026-05-09_mcp-tools-list-bisect.md` ("Resolution" section)