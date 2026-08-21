# Revision owner proof

## Purpose

Prove the canonical origins of `workspace_revision` and `source_revision` before GPH-18 controlled persistence or GPH-19 owner acceptance.

This proof is read-only. It does not authorize canonical writes, backfills, Qdrant payload repair, or revision synthesis.

## Authority rule

A revision surface is canonical only when all of the following are true:

1. the surface is an `ORIGIN_CANDIDATE` rather than a pass-through/defaulted/projection sink;
2. a production writer is identified;
3. that writer creates the revision rather than accepting it from a caller;
4. meaningful values are populated in the canonical store;
5. the owner contract is appropriate to Graphify/code-source freshness.

Column presence, `NOT NULL`, indexes, defaults, content hashes, and projection payloads do not satisfy this rule.

## Current repository observations to verify on the workstation

- `atlas_packets.workspace_revision` is `NOT NULL DEFAULT 0`; `semantic-packet-writer.ts` does not assign it. Treat as `DEFAULTED_SINK`.
- `atlas_ast_nodes.source_revision` is nullable and historically required re-analysis. Treat as `UNPOPULATED_SINK` or `PASS_THROUGH_SINK` depending on live coverage, never origin by itself.
- `atlas_symbol_versions.workspace_revision` and `.source_revision` are written from `StructuralSymbolNominationV1`. The symbol registry is a pass-through persistence owner, not revision origin.
- `atlas_source_refs.commit_sha` and `.corpus_version` are plausible source-revision origin candidates, but no production origin writer has yet been identified. They remain unproven even if values exist.
- native structural dry-run can observe Git HEAD / `ATLAS_WORKSPACE_REVISION`, but this is not yet a canonical stored workspace-revision owner.
- `semantic_signals.workspace_revision` has lifecycle provenance for semantic signals; it does not automatically own Graphify/code-source revisions.
- Qdrant payloads and projection workers are projections, never revision origins.

## Commands

From `sveltekit-frontend`:

```bash
npx vitest run src/lib/server/atlas/indexing/revision-owner-proof-v1.spec.ts
npx tsx scripts/atlas/prove-revision-owner.mts
npx tsx scripts/atlas/verify-revision-owner.mts
```

The collector intentionally exits non-zero while ownership remains unproven. A healthy blocked result is:

```text
proof.status               REVISION_OWNER_NOT_PROVEN
workspaceRevisionOwner     null
sourceRevisionOwner        null
canonicalWriteAttempted     false
readOnly                    true

verifier:
REVISION_OWNER_BLOCK_VERIFIED
```

## Promotion dependency

```text
GPH-18 persistence owner/readback
        |
        +-- storage/readback proof may pass
        |
        +-- revision-owner proof must also pass
                    |
                    v
          controlled write/readback canary
                    |
                    v
             GPH-19 acceptance
```

Do not set `ATLAS_SOURCE_REVISION_OWNER_PROVEN=1`, enable `GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1`, or backfill revisions merely to make this proof green.
