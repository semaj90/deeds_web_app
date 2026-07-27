---
name: Phase 3 Step 7 Evidence Ledger Schema Migration (Pending)
description: Evidence ledger migration (drizzle/00xx_phase111_evidence_ledgers.sql) — schema definition only, NOT YET APPLIED. Tables: atlas_evidence_observations, atlas_observation_relationships, atlas_packet_domain_memberships, atlas_mutation_proposals, atlas_human_feedback
type: project
---

# Phase 3 Step 7: Evidence Ledger Schema Migration (PLANNED)

**Status**: ⏳ PENDING (Design phase complete, implementation queued)

## Overview

Phase 3 Step 7 will create a **Postgres migration file** (drizzle/00xx_phase111_evidence_ledgers.sql) defining 5 new tables for immutable evidence ledgers. This migration will NOT be applied yet—it serves as schema definition to be reviewed before execution.

## Migration Scope

### 5 New Tables

| Table | Purpose | Rows (Est.) | Dependencies |
|-------|---------|------------|--------------|
| `atlas_evidence_observations` | Immutable observation ledger | 4,900/snapshot | atlas_packets |
| `atlas_observation_relationships` | Cross-observation references | ~5K | atlas_evidence_observations |
| `atlas_packet_domain_memberships` | Domain assignment log | 61.6K | atlas_packets, domain_ontology |
| `atlas_mutation_proposals` | Proposed mutations with audit trail | 1K/snapshot | atlas_packets, atlas_evidence_observations |
| `atlas_human_feedback` | Human verification log | ~100 initially | atlas_packets, atlas_mutation_proposals |

### Schema Outline

**atlas_evidence_observations**
```sql
CREATE TABLE atlas_evidence_observations (
  observation_id TEXT PRIMARY KEY,  -- obs:[a-z0-9_-]+
  packet_key TEXT NOT NULL,         -- ace:packet:[a-z0-9_-]+
  observation_type VARCHAR(50),     -- enum: semantic_embedding, lexical_bm25, ...
  evidence_lane VARCHAR(50),        -- enum: semantic_embedding_qdrant, ...
  value JSONB NOT NULL,             -- polymorphic observation value
  confidence NUMERIC(3,2),          -- [0, 1]
  source VARCHAR(50),               -- enum: qdrant_dense_index, postgres_fts, ...
  observed_at TIMESTAMP,            -- ISO 8601
  metadata JSONB,                   -- optional observer, note, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key),
  UNIQUE (observation_id),
  INDEX (packet_key, observation_type),
  INDEX (evidence_lane),
  GIN INDEX (metadata)
);
```

**atlas_mutation_proposals**
```sql
CREATE TABLE atlas_mutation_proposals (
  proposal_id TEXT PRIMARY KEY,      -- mut:[a-z0-9_-]+
  packet_key TEXT NOT NULL,          -- ace:packet:[a-z0-9_-]+
  mutation_type VARCHAR(50),         -- enum: domain_membership_update, ...
  changes JSONB NOT NULL,            -- proposed changes
  justification TEXT NOT NULL,       -- reason for proposal
  status VARCHAR(30),                -- enum: proposed, under_review, approved, applied, rejected
  created_at TIMESTAMP,
  created_by TEXT,
  applied_at TIMESTAMP,              -- NULL until status = applied/rejected
  applied_by TEXT,                   -- NULL until status = applied/rejected
  metadata JSONB,
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key),
  UNIQUE (proposal_id),
  INDEX (packet_key, status),
  INDEX (created_at DESC),
  CONSTRAINT status_transition CHECK (
    -- state machine rules enforced at schema level
  )
);
```

**atlas_packet_domain_memberships**
```sql
CREATE TABLE atlas_packet_domain_memberships (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  domain_class VARCHAR(100) NOT NULL,
  probability NUMERIC(3,2),          -- [0, 1]
  observed_at TIMESTAMP DEFAULT NOW(),
  source VARCHAR(50),                -- feature_extraction, manual, classification
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key),
  UNIQUE (packet_key, domain_class, observed_at),
  INDEX (domain_class),
  INDEX (probability DESC)
);
```

**atlas_observation_relationships**
```sql
CREATE TABLE atlas_observation_relationships (
  id SERIAL PRIMARY KEY,
  source_obs_id TEXT NOT NULL,        -- obs:[a-z0-9_-]+
  target_obs_id TEXT NOT NULL,        -- obs:[a-z0-9_-]+
  relationship_type VARCHAR(50),      -- enum: corroborates, contradicts, refines, supersedes
  confidence NUMERIC(3,2),            -- [0, 1]
  evidence_text TEXT,                 -- optional: why related
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (source_obs_id) REFERENCES atlas_evidence_observations(observation_id),
  FOREIGN KEY (target_obs_id) REFERENCES atlas_evidence_observations(observation_id),
  INDEX (relationship_type),
  INDEX (created_at DESC)
);
```

**atlas_human_feedback**
```sql
CREATE TABLE atlas_human_feedback (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  feedback_type VARCHAR(50),          -- enum: domain_correction, feature_label_fix, identity_fix
  feedback_text TEXT NOT NULL,
  reviewer_id TEXT,                   -- human:name or agent:name
  reviewed_at TIMESTAMP DEFAULT NOW(),
  approved BOOLEAN DEFAULT FALSE,
  corresponding_proposal_id TEXT,     -- nullable, links to mutation_proposal
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key),
  FOREIGN KEY (corresponding_proposal_id) REFERENCES atlas_mutation_proposals(proposal_id),
  INDEX (feedback_type),
  INDEX (approved, created_at DESC)
);
```

## Implementation Checklist

- [ ] Create SQL migration file (drizzle/00xx_phase111_evidence_ledgers.sql) with all 5 table definitions
- [ ] Add Drizzle ORM table schemas to src/lib/server/db/schema-postgres.ts
- [ ] Test migration in dry-run mode (drizzle-kit check)
- [ ] Review schema for performance (indexes, constraints, GIN/B-tree tuning)
- [ ] Validate that Drizzle generates correct SQL (compare generated vs manual)
- [ ] Create integration tests for table relationships (FOREIGN KEY integrity)
- [ ] Document schema versioning (which step/phase introduced each table)
- [ ] DO NOT APPLY YET — wait for Phase 3 Step 8+ approval

## Dependencies (Already Complete)

✅ Phase 3 Step 5 — Control Snapshot built (1K packets, 4,900 observations)
✅ Phase 3 Step 6 — Fixtures validated (29 examples, 100% contract parity)
✅ EvidenceObservationSchema (Zod + JSON Schema)
✅ MutationProposalSchema (Zod + JSON Schema)

## Next Actions (After This Step)

**Step 8**: Wire cs_domain_hierarchy_v1.json into control snapshot builder
- Use existing artifact (no replacement)
- Ensure domain_memberships align with hierarchy

**Step 9**: Add identity resolver script
- Resolve tree_node_id, source_ref, content_hash combinations
- Mark result states: RESOLVED, FEATURE_ID_MISSING, TREE_NODE_ID_MISSING, SOURCE_HASH_MISMATCH, AMBIGUOUS_JOIN

**Step 10**: Add Parquet + Arrow IPC exporters
- Deterministic row ordering (primary key sort)
- Logical row hashing (not raw byte hashing)
- Round-trip validation

**Step 11**: Add determinism validator
- Run snapshot twice, compare
- Verify identity fields, label memberships, split assignment, logical hashes
- Expected status: CONTROL_SNAPSHOT_GENERATED → SPLIT_ISOLATION_PASS → LOGICAL_HASH_PASS → PARQUET_ROUNDTRIP_PASS → ARROW_ROUNDTRIP_PASS → DETERMINISM_PASS

**Step 12+**: Add independent feature lane materializers
- AST observations, lexical observations, vector references, topology features, clustering features
- ONLY after 1K snapshot passes all gates (Phases 7-11 complete)

---

**Queued for execution after semantic-contract-kit review and user approval.**
