## Why

ACE and BitFrost now have revisioned cache contracts and test-proven adapters,
but the live retrieval path still has no server-owned feature snapshot producer.
Without that bridge, ACE admission cannot safely bind query results to a stable
candidate ordinal map and complete lineage.

## What Changes

- Add a governed ACE feature snapshot producer contract.
- Require an existing server-owned `CandidateOrdinalMapV1` and complete
  revision-qualified feature rows before ACE admission.
- Preserve SearchRuntime, feature compilation, ACE admission, and BitFrost as
  separate owners.
- Reject timestamp-derived, client-provided, missing, or synthetic lineage.
- Keep the initial path read-only and preserve existing cache behavior until a
  later explicit live-admission gate.

## Capabilities

### New Capabilities

- `ace-feature-snapshot-producer`: Revision-safe server-owned feature snapshot
  production and ACE admission.

### Modified Capabilities

- None.

## Impact

- Affects the ACE/BitFrost OpenSpec task ledger and the server retrieval-to-ACE
  adapter boundary.
- No database, Qdrant, Neo4j, Valkey, or production mutation is introduced by
  this planning change.
