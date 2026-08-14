# AST incremental extraction proof

- status: **BOUNDED_PROVEN**
- unchanged skip: PASS
- changed re-extraction: PASS
- deletion tombstone: PASS
- production Graphify wiring: PENDING

- src/incremental-unchanged.ts: SKIP_UNCHANGED PASS
- src/incremental-changed.ts: REEXTRACT_CHANGED PASS
- src/incremental-deleted.ts: DELETE_TOMBSTONE PASS
