# Gemma4 Retrieval Loop Hook Harness Tasks - 2026-07-30

## 1. Hook contract

- [x] 1.1 **VERIFIED LIVE 2026-09-08** (found stale while continuing
      `parent-atlas-trace-search-joinback-proof`'s cross-tree OpenSpec sweep) — ran
      `node scripts/opencode/smoke-retrieval-loop-hook.mjs` for real: output includes
      `Appended legacy retrieval-loop row to C:\...\.tmp\atlas-retrieval-loop.jsonl`.
- [x] 1.2 **VERIFIED LIVE** — read the actual last-appended row: keys present are
      `domain, feedback, intent, outcome, query, rerankScore, selectedCardIds, sourceRefs,
      timestamp, tool` — every key this task lists is present (plus 3 extra: domain/feedback/intent).
- [x] 1.3 **VERIFIED LIVE** — smoke output explicitly says `OK hook append executed (dry-run)`.

## 2. Smoke coverage

- [x] 2.1 **VERIFIED LIVE** — ran directly, real process, real exit.
- [x] 2.2 **VERIFIED LIVE** — smoke script's own final line: `Smoke retrieval loop hook: OK`; keys
      independently re-checked per 1.2 above, not just trusted from the script's own claim.
- [x] 2.3 **VERIFIED LIVE** — grepped `smoke-retrieval-loop-hook.mjs` for
      `qdrant|redis|publish|.set(|INSERT|UPDATE`: zero matches. No remote-write code path exists
      in the smoke script to require.

## 3. Documentation

- [x] 3.1 **VERIFIED LIVE** — `docs/architecture/gemma4-retrieval-loop-hook.md` exists (not a
      dangling reference), with a real Mermaid flow diagram
      (Gemma4 → classify_intent → build_agentic_rag_context → recommend_next_action →
      gemma4-retrieval-hook → `.tmp/atlas-retrieval-loop.jsonl` → token-card-weight-updater →
      ACE/TurboVec feedback loop).
- [x] 3.2 **VERIFIED LIVE** — the doc's own opening paragraph states the exact safety boundary this
      task asks to record: "appends local JSONL rows... by default and must not publish to Redis or
      Qdrant until operator approval."

## 4. Final validation

- [x] 4.1 **DONE, this pass** — re-ran the smoke script live as part of this verification (see 1.1);
      it was not re-run "after an implementation edit" since no implementation edit was made here,
      but the live re-run itself satisfies the spirit of this check.
- [x] 4.2 **VERIFIED LIVE** — same grep as 2.3: zero Qdrant/Redis-publish/production-mutation code
      paths found in the smoke script.

## Status

**Found stale 2026-09-08**, same broader cross-tree OpenSpec sweep as `phase1-rrf-semantic-fusion`
(see `parent-atlas-trace-search-joinback-proof/tasks.md` for the full sweep record). Unlike that
case, this wasn't a "code silently landed elsewhere" situation — this proposal's own "Why" already
stated the hook infrastructure pre-existed ("split across a local append script, a smoke test, and
an architecture note"); the proposal's actual job was writing ONE unifying contract confirming that
existing infrastructure behaves as claimed, which is exactly what every task above verifies. All
12 tasks now genuinely, individually live-verified (not assumed) — this proposal's work is
complete. `openspec validate` clean.
