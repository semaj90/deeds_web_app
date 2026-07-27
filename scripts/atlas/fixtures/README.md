# Phase 111 Fixture Contracts

This directory contains cross-language validation fixtures for Phase 111 MCP tools.

## Files

### evidence_observation_valid.json
Canonical example of an **EvidenceObservation** record - one append-only agent observation with full identity and provenance.

**Contract:**
- observation_id: UUID-like identifier matching pattern `obs:[a-z0-9_-]+`
- packet_key: Reference to canonical packet, matching pattern `ace:packet:[a-z0-9_-]+`
- observation_type: One of the 8 observation types (semantic_embedding, lexical_bm25, structural_ast, etc.)
- evidence_lane: Which of the 5 lanes this observation belongs to
- value: Polymorphic JSON - structure depends on observation_type
- confidence: [0, 1] single-source confidence score
- source: Source system that generated this observation
- observed_at: ISO 8601 timestamp
- metadata: Optional context (query_timestamp, lane_version, validation_status, etc.)

**Usage:** Validate this shape against `atlas_validate_evidence_observation` tool.

### mutation_proposal_valid.json
Canonical example of a **MutationProposal** record - describes a requested canonical change but does NOT perform it.

**Contract:**
- proposal_id: UUID-like identifier matching pattern `mut:[a-z0-9_-]+`
- packet_key: Reference to packet being mutated
- mutation_type: One of 6 mutation types (domain_membership_update, label_correction, identity_refinement, etc.)
- changes: JSONB object describing what to change
- justification: Text explanation of why this mutation is proposed
- observations_supporting: Array of observation IDs that support this mutation
- status: State machine value (proposed, under_review, approved, applied, rejected)
- created_at: When the proposal was created
- created_by: Who/what created it (agent:classifier-v1, human:reviewer, etc.)
- metadata: Additional context (confidence_score, supporting_evidence_count, etc.)

**Usage:** Validate this shape against `atlas_validate_contracts` tool with contract_type='mutation_proposal'.

### mutation_proposal_unauthorized.json
Example of a **MutationProposal** that is GATED and will FAIL policy validation.

**Why it fails:**
- observations_supporting is EMPTY (no evidence)
- status is 'applied' (attempted to apply without authorization)
- applied_by is 'unknown:untrusted-source' (no auth context)
- force_override is true (explicit breach attempt)
- metadata.requires_authorization=true but no authorization_token present

**Usage:** Test authorization gating with `atlas_apply_mutation` tool (will be rejected).

### Fixture Manifest (SHA256)

Used for cross-language validation. Each fixture has:
```
filename: sha256-digest
evidence_observation_valid.json: {hash}
mutation_proposal_valid.json: {hash}
mutation_proposal_unauthorized.json: {hash}
```

Generate with:
```bash
cd scripts/atlas/fixtures
sha256sum *.json > SHA256MANIFEST.txt
```

## Validation Rules

### All Valid Fixtures Must Pass:
1. **Contract schema validation** (Zod, TypeScript)
2. **Cross-language validation** (TypeScript ↔ Python/Go)
3. **Identity proof** (packet_key resolves to canonical identity)
4. **Reference validation** (observation IDs exist in database)

### Authorization-Gated Fixtures Must FAIL:
1. `atlas_apply_mutation` rejects without authorization_token
2. `atlas_write_canonical_memberships` rejects without authorization_token
3. `atlas_create_qdrant_collection` rejects without authorization_token
4. Detailed rejection reason logged (e.g., "UNAUTHORIZED_MUTATION")

## MCP Tool Integration

These fixtures are used by:
- `atlas_validate_contracts` - validate fixture data against schemas
- `atlas_validate_evidence_observation` - validate evidence shape
- `atlas_propose_mutation` - accept or reject mutation proposals
- `atlas_apply_mutation` - authorization gating test

## Cross-Language Notes

**TypeScript** (Zod):
```typescript
import { EvidenceObservationSchema, MutationProposalSchema } from './mcp-schemas.mts';
const obs = EvidenceObservationSchema.parse(fixtureData);
```

**Python** (Pydantic):
```python
from models import EvidenceObservation, MutationProposal
obs = EvidenceObservation(**fixture_data)
```

**Go** (protobuf):
```go
obs := &pb.EvidenceObservation{}
json.Unmarshal(fixtureBytes, obs)
```

All three implementations must agree on the fixture shapes.
