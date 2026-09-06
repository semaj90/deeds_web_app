## Memory/agent ownership update — 2026-09-05

This updates the existing ace-rlm-bitfrost-integration owner; no new OpenSpec change or control plane.
The accompanying design addendum and spec scenarios govern the new tasks; historical
findings below remain dated evidence, not a competing current execution queue.

The query-feature addition is an input to the existing ACE-FEATURE-SOURCE-OWNER-01
bridge, not a new compiler. Preserve ContextManifestV2 evidence, policy, and playbook
revisions and CandidateFeatureSnapshot admission. Query features must carry their
producer/corpus revisions; missing data cannot supply synthetic lineage.
Live wiring remains distinct from fixture validation. Exact prompt caches are owned
by the narrower cache-correctness change.

Impact: planning/spec/task reconciliation only. Runtime implementation and datastore
mutation are not performed by this update. See tasks.md for pending proof gates.

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
