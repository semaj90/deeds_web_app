# Gemma4 Retrieval Loop Hook Harness Tasks - 2026-07-30

## 1. Hook contract

- [ ] 1.1 Confirm the hook writes local JSONL rows to `.tmp/atlas-retrieval-loop.jsonl`
- [ ] 1.2 Confirm the row preserves `query`, `sourceRefs`, `selectedCardIds`, `rerankScore`, `tool`, `outcome`
- [ ] 1.3 Confirm the hook is dry-run safe by default

## 2. Smoke coverage

- [ ] 2.1 Run `scripts/opencode/smoke-retrieval-loop-hook.mjs`
- [ ] 2.2 Validate that one append succeeds and the last row contains required keys
- [ ] 2.3 Verify the smoke path does not require remote writes

## 3. Documentation

- [ ] 3.1 Link the hook harness to `docs/architecture/gemma4-retrieval-loop-hook.md`
- [ ] 3.2 Record the current hook ownership and safety boundary in the OpenSpec change

## 4. Final validation

- [ ] 4.1 Re-run the smoke script after any implementation edits
- [ ] 4.2 Confirm no Qdrant, Redis publish, or production mutation paths were introduced
