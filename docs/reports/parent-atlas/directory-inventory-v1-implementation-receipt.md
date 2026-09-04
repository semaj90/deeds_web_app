# Parent Atlas directory inventory v1 — implementation receipt

Date: 2026-09-04

Status: `IMPLEMENTED_AWAITING_EXECUTION_PROOF`

OpenSpec change: `parent-atlas-canonical-directory-ingestion-fabric`

## Existing-owner evidence

The implementation deliberately extends rather than replaces two existing owners:

1. `scripts/atlas/stage1-incremental-file-inventory.mjs` already enumerates repository files, hashes bytes with SHA-256, classifies them, and sorts by normalized path. It also writes Stage-1 snapshots, so it is not used as the new read-only proof boundary.
2. `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.ts` already defines `SourceSelectionBindingV1` with `sourceRef`, `codeSourceRevision`, `contentHash`, and `byteLength`. Its coordinator explicitly requires callers to supply already-computed source bindings rather than scanning/hashing inside the ledger writer.

## Implementation

Added `packages/parent-atlas/src/core/source-artifact-v1.ts`.

`SourceArtifactV1` records:

- `sourceRef`
- `relativePath`
- `contentHash`
- `sourceRevision`
- `byteLength`
- `workspaceRevision`
- `parserRevision`
- `producerRevision`
- `revisionAuthority`
- optional language/extension/MIME metadata
- optional `diagnosticMtime`

Two revision modes are explicit and fail closed:

- `EXISTING_CANONICAL_OWNER`: adapts an existing Graphify source-selection binding and preserves `codeSourceRevision` exactly.
- `CONTENT_SHA256`: permitted only for a directory/document namespace without a pre-existing canonical revision owner; `sourceRevision === contentHash` over immutable bytes.

`diagnosticMtime` is intentionally omitted from the inventory replay checksum.

## Inventory policy

`atlas.directory-inventory-policy.v1` is versioned and currently admits selected roots:

- `docs`
- `openspec`
- `memory`
- `packages`
- `sveltekit-frontend/src`
- `scripts/atlas`

It excludes generated/vendor/cache/model/archive paths including `.git`, `.venv`, `node_modules`, `dist`, `build`, `.cache`, `coverage`, `models`, and `deeds_labs/archive`. Symlink following is frozen off. Path normalization rejects repository escapes.

The policy is intentionally narrower than the historical Stage-1 whole-repository enumeration. Additional roots/extensions require a policy revision rather than implicit expansion.

## Replay proof fixture

Added `packages/parent-atlas/test/source-artifact-v1.test.mjs` with six read-only cases:

1. existing canonical source revision is preserved;
2. content-owned document revision derives only from immutable bytes;
3. changing only mtime does not change inventory checksum;
4. reversed enumeration order produces the same sorted source refs and inventory checksum;
5. admitted/excluded path policy is enforced;
6. repository escape paths fail closed.

The test imports the compiled package output and performs no database, Qdrant, Neo4j, Valkey, network, or filesystem mutation.

## Gate status

- `DIR-INDEX-01A`: implementation present; execution/typecheck proof pending.
- `DIR-INDEX-01B`: implementation + fixture present; execution proof pending.
- `DIR-INDEX-01C`: implementation present; execution proof pending.
- `DIR-INDEX-01D`: replay fixture present but **not marked PASS** until the package is compiled and the test actually runs successfully.

Do not mark `DIR_SOURCE_IDENTITY_PASS` from this receipt alone.

## Safe validation command

```bash
cd packages/parent-atlas
node ../../node_modules/typescript/bin/tsc -p tsconfig.json
node --test ./test/source-artifact-v1.test.mjs
```

Expected only after real execution: six passing tests and zero writes. If compilation or any test fails, keep DIR-INDEX-01 unchecked and repair the bounded contract/fixture before proceeding to DIR-INDEX-02.
