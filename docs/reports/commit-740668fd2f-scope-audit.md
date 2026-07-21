# Commit 740668fd2f Scope Audit

Status: audit complete.

This commit is not pure Phase 107 materializer work. It mixes the required phase files with unrelated retrieval and orchestration files.

## PHASE_107_REQUIRED

- `scripts/atlas/phase-107-schema-audit.mts`
- `scripts/atlas/phase-107-backfill-joins.mts`
- `sveltekit-frontend/drizzle/0044_phase_107_feature_layer_schema.sql`

These files are directly required for the feature-layer schema alignment and the audit/backfill path.

## RELATED_BUT_SEPARATE

- `scripts/atlas/python-orchestrator.mjs`
- `sveltekit-frontend/src/lib/server/ace/ace-query-packet.spec.ts`
- `sveltekit-frontend/src/lib/server/retrieval/hmm-tool-selector.ts`
- `sveltekit-frontend/src/lib/server/retrieval/hmm-tool-selector.spec.ts`
- `sveltekit-frontend/src/routes/api/tools/search/+server.ts`

These files are adjacent to Atlas routing and orchestration, but they are not required to complete the Phase 107 materializer audit or the feature-fact rewrite.

## Notes

- `scripts/atlas/python-orchestrator.mjs` is especially important to keep out of the Phase 107 rewrite. It is a separate placeholder orchestration layer and should not be modified as part of the materializer audit.
- The retrieval and ACE files are relevant to tool selection and context packets, but they do not change the schema contract for the feature-layer materializer.

IMPLEMENTED
- Commit scope classified at file level.

PROVEN
- Phase 107 required files are limited to the schema audit, backfill, and migration SQL.

EXPECTED GAPS
- The unrelated files remain in the commit and should be split out later if the repo history needs cleanup.

UNRESOLVED
- None for scope classification.

UNSAFE CONSTRAINTS
- Do not rewrite history automatically.
- Do not modify `python-orchestrator.mjs` as part of Phase 107.

NOT YET PROVEN
- Whether the unrelated files were intentionally staged or accidentally included.

NEXT SAFE ACTION
- Keep Phase 107 work confined to the materializer audit and the normalized feature-fact rewrite.
