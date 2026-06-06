# Engram Adapter Decision

- **decision**: HINT_ONLY_ADAPTER
- **hintOnly**: true
- **firstClass**: false
- **repoReportAnswer**: true
- **legacyGemma**: true
- **engramEmbedExists**: true
- **evidenceCount**: 5

## Evidence

- local-engram adapter: `src\lib\server\memory\local-engram-memory-adapter.ts` — getRoutingHints/recordTransition/recordWorkflowMemory and low_hint trust only
- engram memory store: `src\lib\server\ai\engram-memory.ts` — Redis-backed bigram transition memory with low-trust hints
- OpenCode prompt gating: `opencode.json` — repo evidence first and repo_report_answer preferred
- Gemma4 handoff docs: `docs\architecture\gemma4-to-claude-code-handoff.md` — repo-audit-only and report snippets, not generic chat
- legacy gemma boundary: `scripts\mcp\gemma4-offload-mcp.mjs` — legacy gemma route still present but should remain deprecated

## Decision

Engram stays a hint-only adapter. It contributes low-trust routing hints and Redis-backed transition memory, while repo-audit and report-answer routing stays on `repo_report_answer`.

## Finish Line

- keep `repo_report_answer` as the repo-audit path
- keep `gemma4_chat` deprecated
- keep Engram opt-in and low-trust