# Lane Feature Story: Packet Contract Lane

## Purpose
Establishes a stable and canonical identification structure (`packet_key`, `source_ref`, `feature_id`, `community_id`) across all retrieved packets, preventing mismatch drift between Postgres and the vector/graph mirrors.

## Owner
Parent Atlas Platform Team / Core Retrieval Engineers

## Expected Behavior
- Reads from the canonical `atlas_higher_hop_index` and `atlas_packets` tables in Postgres.
- Resolves any file path or query references to a normalized, unified packet namespace.
- Validates the packet schema contract via Zod runtime checks.
- Guarantees stable matching rates across downstream indexing steps.

## Primary Files
- [schema.ts](file:///c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/db/schema.ts)
- [validate-packet-contract.mjs](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/validate-packet-contract.mjs)
- [repair-packet-contract-mirrors.mjs](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/repair-packet-contract-mirrors.mjs)

## Contracts
Every packet must carry:
- `packet_key` (non-null unique string)
- `source_ref` (non-null relative file path)
- `feature_id` (non-null concept identifier)
- `community_id` (integer topology group)

## Cache/Traversal Surfaces
- **Canonical Datastore**: Postgres (`atlas_packets` ledger table).
- **Index Accelerator**: Postgres JSONB GIN indexes.

## Failure Modes
- Unnormalized paths or ambiguous packet references.
- Missing required fields, causing parsing/validation checks to reject records.
- Schema mismatches due to migrations.

## Proof Commands
```bash
npm run atlas:proto:audit
node scripts/atlas/validate-packet-contract.mjs
```

## Verdict
**PASS** — Stable packet keys and normalized structures have been validated across the primary ledger tables, with schema alignment confirmed.
