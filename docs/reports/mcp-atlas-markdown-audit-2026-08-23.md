# MCP and Atlas Markdown Truth Audit

> **Doc review (2026-09-04):** CURRENT — self-scoped 2026-08-23 audit with proper evidence/uncertainty
> labeling; referenced config files (`.opencode/opencode.jsonc`, `.mcp.json`) confirmed to still exist.

Date: 2026-08-23

## Scope

This is a bounded audit of Markdown documents that describe MCP, TRACE, Atlas, ACE, or agentic workflow wiring. The repository contains approximately 8,366 Markdown files, so this is not a claim that every Markdown file was reviewed.

The audit used the local TRACE MCP at `http://127.0.0.1:8788/mcp` and its ACE packet builder. No raw Postgres, Qdrant, Neo4j, or Redis access was performed by the audit script.

## Persisted ACE Packets

All packet builds returned `status: success`, `degraded: false`, and `ranked_card_count: 8`.

| Source Markdown | Packet ID | Feature ID |
|---|---|---|
| `DEEP-AUDIT-SUMMARY.md` | `05cbce293ed82729` | `DEEP-AUDIT-SUMMARY` |
| `ACE-TO-RETRIEVAL-COMPLETION-AUDIT.md` | `5d2b0dd3b3348598` | `ACE-TO-RETRIEVAL-COMPLETION-AUDIT` |
| `claude.md` | `c6ab22d553e00bdd` | `claude` |
| `AGENTIC-WORKFLOW-PLAN-SUMMARY.md` | `ce096ab159233de4` | `AGENTIC-WORKFLOW-PLAN-SUMMARY` |
| `ATLAS-STATUS-RECONCILIATION.md` | `da2cf9d95e7f9b4e` | `ATLAS-STATUS-RECONCILIATION` |
| `ACE-MATERIALIZATION-BLOCKER-1-FIXED.md` | `190f4d7fe8d99bdc` | `ACE-MATERIALIZATION-BLOCKER-1-FIXED` |

## Drift Findings

### High: active configuration and documentation disagree

`claude.md` states that six MCP servers are connected and identifies `.opencode/opencode.jsonc` as the source of truth. The active `.opencode/opencode.jsonc` currently contains `trace` and local `atlas-tools`; it does not contain the other four servers named by the document.

### High: tool counts are stale or scope-specific

The Markdown corpus contains claims of 29, 42, and 124 MCP tools. The live TRACE audit currently discovers 175 tools, with all seven runtime audit gates passing. These counts should be labeled with their date, server, and transport scope rather than presented as current global totals.

### Medium: historical blockers remain phrased as current blockers

`ACE-TO-RETRIEVAL-COMPLETION-AUDIT.md` reports no `:8788` registration and an unwired dispatcher. The current TRACE server is healthy on `:8788`, and its audit passes health, discovery, provenance, concurrency, idempotency, and domain-completeness gates. The document needs a historical-status header or a superseding verification link.

### Medium: Atlas readiness documents mix intended, created, and proven states

`ATLAS-STATUS-RECONCILIATION.md` and `ACE-MATERIALIZATION-BLOCKER-1-FIXED.md` contain useful TODO and blocker history, but their status language should be reconciled against current runtime evidence and packet IDs. The ACE packet builder found related source and audit cards, but packet persistence is not production proof of every claim in the source document.

## Current Proof

- TRACE health: healthy.
- TRACE tool discovery: 175 tools.
- TRACE audit: 7 passed, 0 failed.
- Local Atlas stdio mock smoke: 10 passed, 0 failed.
- Atlas mock outcome and graph smoke: 10 passed, 0 failed.
- ACE packet persistence: six source Markdown packets persisted successfully.

## Not Proven

- Every one of the 8,366 Markdown files has not been reviewed.
- The six-server configuration described in older Markdown is not present in the active Codex/OpenCode configs.
- Live Neo4j behavior for Atlas graph tools remains unproven; only deterministic mock behavior was exercised.
- `atlas.packet_search` returned zero rows for the broad audit summary query, so packet lookup is not a substitute for the successful ACE packet build results above.

## Recommended Follow-up

1. Add explicit dates and scope labels to historical MCP tool-count claims.
2. Mark superseded MCP blockers as historical and link the current TRACE audit.
3. Reconcile `.opencode/opencode.jsonc`, `opencode.json`, and `.mcp.json` into one documented source-of-truth policy.
4. Run a separate, bounded Markdown contradiction scan by directory before changing historical documents.
## Exact Claim References

| Document claim | Evidence |
|---|---|
| Six MCP servers all connected | `claude.md:378`, `claude.md:384`, `claude.md:462` |
| 29 tools live | `claude.md:3301` |
| 42 tools registered | `claude.md:3657`, `AGENTIC-WORKFLOW-PLAN-SUMMARY.md:182`, `AGENTIC-WORKFLOW-PLAN-SUMMARY.md:189` |
| 124 tools from POST `tools/list` | `claude.md:3722` |
| No `:8788` registration | `ACE-TO-RETRIEVAL-COMPLETION-AUDIT.md:23` |
| `/atlas.packet.*` not wired | `ACE-MATERIALIZATION-BLOCKER-1-FIXED.md:211` |

Current registrations are visible at `opencode.json:92-105`, `.opencode/opencode.jsonc:80-91`, and `.mcp.json:10-20`. The current TRACE runtime evidence is recorded above: 175 discovered tools, 7 audit gates passed, and breadth coverage 108/109.