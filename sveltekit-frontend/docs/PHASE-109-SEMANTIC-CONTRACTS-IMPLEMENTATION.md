# Phase 109: Semantic Contracts Infrastructure — Complete Implementation

**Status**: ✅ **COMPLETE END-TO-END IMPLEMENTATION**  
**Date**: 2026-07-27  
**Scope**: JSON Schema contracts, Zod bindings, PostgreSQL registry, Naive Bayes classifier

---

## Summary

Phase 109 implements the foundational semantic contracts infrastructure for domain classification, vector management, and ontology reasoning.

### What Was Delivered

#### 1. **JSON Schema Contracts (5 files)**
- `vector-manifest.schema.json` — Vector identity and provenance
- `semantic-packet.schema.json` — Canonical packet identity (v2.0.0)
- `domain-feature-packet.schema.json` — Feature vectors for classification
- `domain-prediction.schema.json` — Non-canonical predictions (staging table)
- `ontology-proposal.schema.json` — Evidence-backed relation proposals

**Design principle**: Language-neutral JSON Schema Draft 2020-12 as the canonical contract definition. Zod and Pydantic bind to this single source of truth.

#### 2. **Zod TypeScript Bindings (5 files)**
- `vector-manifest.ts` — VectorManifestSchema + hashVectorManifest()
- `semantic-packet.ts` — SemanticPacketSchema + hashSemanticPacketIdentity() + authorizedUpdateDomainClass()
- `domain-feature-packet.ts` — DomainFeaturePacketSchema + hashFeatureVocabulary()
- `domain-prediction.ts` — DomainPredictionSchema + authorizedPromotePrediction()
- `ontology-proposal.ts` — OntologyProposalSchema + authorizedApproveProposal()

**Key feature**: Authorization gates enforce that models CANNOT directly mutate canonical state. Only authorized services may promote predictions or approve ontology relations.

#### 3. **Canonical Hashing (`canonical-hashing.ts`)**
- `canonicalHashJSON()` — Deterministic SHA256 of JSON (sorted keys, no whitespace)
- `verifyCanonicalHash()` — Verification function
- `messagePackHash()` — Transport-level hashing
- `arrowIPCHash()` — Batch export hashing

**Guarantees**: Same JSON value always produces the same hash. Round-trip safe via canonical JSON ↔ MessagePack ↔ Arrow IPC.

#### 4. **PostgreSQL Registry Tables (`0500_atlas_semantic_contracts.sql`)**

| Table | Purpose | Rows | Keys |
|-------|---------|------|------|
| `atlas_vector_registry` | Vector identity across all stores | canonical join key | packet_key, vector_name, model_revision |
| `atlas_model_runs` | Training/evaluation runs | batch tracking | run_id (UUID) |
| `atlas_domain_predictions` | Non-canonical predictions (staging) | ~5K-10K per run | run_id, packet_key (UNIQUE) |
| `atlas_ontology_relation_proposals` | Evidence-backed relations | ~1K+ proposals | subject_key, predicate, object_key (UNIQUE) |
| `atlas_feature_label_proposals` | Unseen label proposals | ~100-500 | feature_id, packet_key, proposed_label (UNIQUE) |
| `atlas_domain_classification_runs` | Run metadata summary | 1 per run | classification_run_id (UUID) |

**Safety**: All tables use UNIQUE constraints to prevent duplicates. Foreign keys on `atlas_model_runs` enforce referential integrity.

#### 5. **Multinomial Naive Bayes Classifier (`phase2b-naive-bayes-classifier.mts`)**

**Algorithm**: Real Naive Bayes with Laplace smoothing (alpha=1.0), class priors, log-space probability calculations.

**Key improvements over Stage A (word frequency prototype)**:
- ✅ Class priors P(domain) boost minority classes
- ✅ Laplace smoothing prevents zero-frequency collapse
- ✅ Log-space arithmetic handles underflow on long documents
- ✅ Proper conditional probabilities P(token|domain)
- ✅ Confidence calibration via sigmoid transformation
- ✅ Vocabulary hash for reproducibility

**Execution**:
```bash
# Dry-run (no writes)
npx tsx scripts/atlas/phase2b-naive-bayes-classifier.mts --dry-run --train-limit=5000

# Live (requires gate pass: macro F1 >= 0.5)
npx tsx scripts/atlas/phase2b-naive-bayes-classifier.mts --live --train-limit=5000
```

**Output**:
- Per-domain F1, precision, recall
- Confidence distribution (min/max/mean/median/Q25/Q75)
- Confusion matrix
- Classification run metadata in `atlas_domain_classification_runs`
- Prediction ledger in `atlas_domain_predictions` (non-canonical, staging only)

---

## Architecture Decisions

### 1. **Vector Manifest — Explicit Declarations**

Every vector must declare:
- `vectorName` (canonical across all stores)
- `model` + `modelRevision` (reproducibility)
- `dimensions` (384 canonical, 768 legacy supported)
- `distance` metric (Cosine, Dot, Euclid, Manhattan)
- `normalized` flag (required for Cosine)
- `contentSha256` (source content hash)
- `workspaceRevision` (corpus version)

**Never**:
- ❌ Compare 384-dim and 768-dim vectors directly
- ❌ Average or concatenate vectors of different dimensions
- ❌ Assume normalization without explicit flag

### 2. **Semantic Packet Identity — Immutable Cross-Store Join Key**

`packetKey` is the single immutable identity across:
- Postgres `atlas_packets`
- Qdrant point payload
- Redis cache keys
- Neo4j node ID
- Cold storage manifests

**Never**:
- ❌ Join on `source_ref` (one-to-many)
- ❌ Join on `feature_id` alone (ambiguous)
- ❌ Use `qdrant_point_id` as primary identity (mirrors only)

### 3. **Domain Classification — Staged Predictions, Gated Promotion**

Flow:
1. **Classifier generates predictions** → `atlas_domain_predictions.status = PREDICTED`
2. **Evaluation gate filters** → status = GATED_* or ACCEPTED
3. **Authorization required** → only authorized service → status = APPROVED
4. **Canonical mutation** → update `atlas_packets.domain_class` (NEVER by model directly)

**Never**:
- ❌ Write to `atlas_packets.domain_class` from a model
- ❌ Skip the evaluation gate
- ❌ Auto-promote predictions without authorization

### 4. **Ontology Relations — Evidence-Backed, Non-Canonical**

Flow:
1. **Proposal system generates relation** → `atlas_ontology_relation_proposals.status = PROPOSED`
2. **Evidence evaluation** → status = GATED_* or ACCEPTED
3. **Authorization required** → status = APPROVED
4. **Promotion** → write to canonical `atlas_ontology` table (separate)

**Never**:
- ❌ Assume PROPOSED relations are canonical
- ❌ Merge ontology_proposals into neo4j without approval
- ❌ Use proposalSource='human_annotation' as high-confidence (evidence matters, not source)

### 5. **Authorization Gates — Enforce Separation of Concerns**

Three classes of services:

| Service Class | Can | Cannot |
|---------------|-----|--------|
| Model workers | Read packets, generate predictions | Mutate packets, approve relations |
| Evaluators | Read predictions, compute metrics | Approve without authorization |
| Authorized gates | Approve predictions/relations | Train models, generate predictions |

**Zod enforcement**: `authorizedUpdateDomainClass()`, `authorizedPromotePrediction()`, `authorizedApproveProposal()` require explicit `authorizedBy` string.

---

## Files Delivered

### Packages
```
packages/semantic-contracts/
├── src/
│   ├── vector-manifest.ts
│   ├── semantic-packet.ts
│   ├── domain-feature-packet.ts
│   ├── domain-prediction.ts
│   ├── ontology-proposal.ts
│   ├── canonical-hashing.ts
│   └── index.ts (barrel export)
├── schemas/
│   ├── vector-manifest.schema.json
│   ├── semantic-packet.schema.json
│   ├── domain-feature-packet.schema.json
│   ├── domain-prediction.schema.json
│   └── ontology-proposal.schema.json
├── package.json
└── tsconfig.json
```

### Migrations
```
drizzle/manual/0500_atlas_semantic_contracts.sql
```

### Scripts
```
scripts/atlas/phase2b-naive-bayes-classifier.mts
```

### Documentation
```
docs/PHASE-109-SEMANTIC-CONTRACTS-IMPLEMENTATION.md (this file)
```

---

## Usage Examples

### Vector Manifest
```typescript
import { createVectorManifest, hashVectorManifest } from '@atlas/semantic-contracts';

const manifest = createVectorManifest({
  vectorName: 'dense_384',
  model: 'embeddinggemma:latest',
  modelRevision: '1.0',
  dimensions: 384,
  representation: 'dense',
  distance: 'Cosine',
  normalized: true,
  contentSha256: 'abc123...',
  workspaceRevision: 'v2.1.0'
});

const hash = hashVectorManifest(manifest); // SHA256
```

### Semantic Packet
```typescript
import { createSemanticPacket, authorizedUpdateDomainClass } from '@atlas/semantic-contracts';

const packet = createSemanticPacket({
  schemaId: 'atlas:semantic:packet',
  schemaVersion: '2.0.0',
  packetKey: 'packet:auth:001',
  sourceRef: 'src/lib/server/auth.ts',
  featureId: 'auth.sessions',
  featureLabel: 'Authentication Sessions',
  workspaceRevision: 'v2.1.0',
  contentSha256: 'def456...',
  domainClass: null,
  evidenceState: 'ACTIVE_VERIFIED'
});

// Only authorized gate may update domain class
const updated = authorizedUpdateDomainClass(packet, 'infrastructure', 'system:promotion-gate');
// → mutationAuthorizedBy = 'system:promotion-gate'
// → mutationTimestamp = ISO 8601
```

### Domain Prediction
```typescript
import { createDomainPrediction, authorizedPromotePrediction } from '@atlas/semantic-contracts';

const prediction = createDomainPrediction({
  schemaId: 'atlas:domain:prediction',
  schemaVersion: '1.0.0',
  classificationRunId: 'run-123',
  packetKey: 'packet:auth:001',
  predictedDomain: 'infrastructure',
  rawScore: 0.95,
  scoreMargin: 0.45,
  calibratedConfidence: 0.88,
  classifierKind: 'naive_bayes',
  classifierVersion: '1.0',
  modelSha256: '...',
  featureSchemaVersion: '1',
  sourceSnapshotSha256: '...',
  ontologyVersion: 'v2.1.0',
  status: 'ACCEPTED',
  createdAt: new Date().toISOString()
});

// Only authorized gate may promote
const promoted = authorizedPromotePrediction(prediction, 'system:promotion-gate');
// → status = 'SUPERSEDED'
// → authorizedBy = 'system:promotion-gate'
// → authorizedAt = ISO 8601
```

### Canonical Hashing
```typescript
import { canonicalHashJSON, verifyCanonicalHash } from '@atlas/semantic-contracts';

const data = { b: 2, a: 1 };
const hash = canonicalHashJSON(data); // {"a":1,"b":2}

// Verification
const verified = verifyCanonicalHash(data, hash); // true
const verified2 = verifyCanonicalHash({ a: 1, b: 2 }, hash); // true (same value)
```

---

## Next Steps (Phase 110+)

1. **Implement Zod 4 to Pydantic 2 binding layer** (Python workers)
2. **Migrate existing domain predictions** to new staging table schema
3. **Wire authorization gates** in API routes
4. **Implement full model ladder** (Stage C: logistic regression, Stage D: XGBoost)
5. **Add K-means and SOM feature materialization** using deterministic feature packets
6. **Integrate Redis centroid warming** from trained models
7. **Build ACE packet assembly** with bounded context and retrieval provenance
8. **Generate OpenSpec and OKF exports** from validated predictions and ontology relations

---

## Testing

Run contract validation tests:
```bash
cd packages/semantic-contracts
npm run build
npm run test
```

Validate classifier against training split:
```bash
npx tsx scripts/atlas/phase2-classifier-dry-run.mts --train-limit=5000
npx tsx scripts/atlas/phase2b-naive-bayes-classifier.mts --dry-run --train-limit=5000
```

Verify PostgreSQL migrations:
```bash
cd sveltekit-frontend
npx drizzle-kit migrate
```

---

## Safety Gates

✅ **G1**: Zod validation enforces schema compliance (parse fails on invalid input)
✅ **G2**: Authorization gates require explicit `authorizedBy` parameter (throws if missing)
✅ **G3**: Canonical hashing is deterministic (JSON.stringify with sorted keys)
✅ **G4**: Split isolation enforces train/validation/test separation (DuckDB query `WHERE split_name = 'train'`)
✅ **G5**: Evaluation gate blocks live writes if macro F1 < 0.5 (process.exit(1))
✅ **G6**: Unique constraints prevent duplicate vector manifests and predictions
✅ **G7**: Foreign key on `atlas_domain_predictions.run_id` ensures referential integrity
✅ **G8**: Transaction-wrapped writes ensure atomicity (BEGIN...COMMIT or ROLLBACK)
✅ **G9**: Prediction ledger is non-canonical (separate from `atlas_packets.domain_class`)
✅ **G10**: Model artifacts have SHA256 hashes for reproducibility

---

## References

- [Vector Manifest Schema](../packages/semantic-contracts/schemas/vector-manifest.schema.json)
- [Semantic Packet Schema](../packages/semantic-contracts/schemas/semantic-packet.schema.json)
- [Domain Feature Packet Schema](../packages/semantic-contracts/schemas/domain-feature-packet.schema.json)
- [Domain Prediction Schema](../packages/semantic-contracts/schemas/domain-prediction.schema.json)
- [Ontology Proposal Schema](../packages/semantic-contracts/schemas/ontology-proposal.schema.json)
- [PostgreSQL Migrations](../drizzle/manual/0500_atlas_semantic_contracts.sql)
- [Naive Bayes Classifier](../scripts/atlas/phase2b-naive-bayes-classifier.mts)
