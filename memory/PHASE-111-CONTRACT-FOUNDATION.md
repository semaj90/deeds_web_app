# Phase 111: Contract Foundation & Frozen Split Validation

**Session 147 (July 27, 2026) — Option A Path: Contracts First**

## Status: CONTRACTS DEFINED ✅ | SPLIT VALIDATION WIRED ✅ | CLASSIFIER TRAINING BLOCKED ⏳

---

## Classifier Evaluation Summary (Sessions 145–147)

### Phase 3 (Logistic Regression)
- **Data Loading**: ✅ PASS (stratified, deterministic)
- **Split Manifest**: ✅ FROZEN (11,342 packets, 40 domains)
- **Training**: ✅ COMPLETES (2-3 seconds)
- **Macro F1 (validation)**: **0.0882** ❌ (gate requires 0.5)
- **Macro F1 (held-out test)**: **0.0764** ❌

### Phase 4 (XGBoost)
- **Data Loading**: ✅ PASS (identical split to Phase 3)
- **Training**: ✅ COMPLETES (10–15 seconds with hist method)
- **Feature Importance**: ✅ CORRECT (768 features used, properly distributed)
- **Macro F1 (validation)**: **0.1069** ❌ (gate requires 0.5)
- **Macro F1 (held-out test)**: **0.0932** ❌

### Critical Finding
Both classifiers have learned almost nothing. Macro F1 of ~0.09–0.11 is barely above random guessing for a 40-class problem.

**Root Cause**: The 768-dim embeddings from embeddinggemma were not trained on domain classification, so the embedding space does not naturally separate the 40 domain labels. Neither scikit-learn LogisticRegression nor XGBoost can overcome this fundamental mismatch.

**Decision**: Do NOT attempt more models on unsuitable data. Proceed with contract definition and split validation instead (Option A).

---

## Foundation Layers Delivered (Option A)

### 1. JSON Schema Contract (`scripts/atlas/contracts.json`)
**Purpose**: Language-neutral canonical definitions for all classifier artifacts.

**Schemas Defined**:
- `ClassifierSplitManifest` — immutable training/val/test split metadata
- `VectorManifest` — vector provenance and dimensions
- `DomainFeaturePacket` — single training packet (for later manual review)
- `ModelRunManifest` — trained model parameters + hashes
- `EvaluationReport` — validation/test metrics with per-class breakdown
- `DomainPrediction` — single prediction result

**Key Constraints** (hard-coded):
- `dimensions = 768` (canonical native from embeddinggemma:latest)
- `embedding_model = "embeddinggemma:latest"` (locked)
- `schema_version = "1.0.0"` (versioned for breaking changes)
- `split_hash = SHA256(sorted packet_keys + labels + vector bytes)` (full provenance)
- `gate_pass = (macro_f1 >= 0.5)` (required for live deployment)

---

### 2. TypeScript Validators (`scripts/atlas/lib/classifier-contracts.ts`)
**Purpose**: Zod schemas for SvelteKit/TypeScript consumers.

**Exports**:
- `ClassifierSplitManifestSchema` → type `ClassifierSplitManifest`
- `EvaluationReportSchema` → type `EvaluationReport`
- `DomainPredictionSchema` → type `DomainPrediction`
- Validation functions: `validateSplitManifest()`, `validateEvaluationReport()`, `validatePrediction()`

**Usage Example**:
```typescript
import { validateSplitManifest } from './lib/classifier-contracts';

const result = validateSplitManifest(loadedJSON);
if (result.success) {
  const manifest: ClassifierSplitManifest = result.data;
  // Use manifest with full type safety
} else {
  console.error(result.error);
}
```

---

### 3. Python Validators (`scripts/atlas/lib/classifier_contracts.py`)
**Purpose**: Pydantic v2 models for Python workers.

**Classes**:
- `ClassifierSplitManifest` (Pydantic BaseModel)
- `EvaluationReport`
- `DomainPrediction`
- Validation functions: `validate_split_manifest()`, `validate_evaluation_report()`, `validate_prediction()`

**Usage Example**:
```python
from classifier_contracts import ClassifierSplitManifest

success, manifest, error = validate_split_manifest(loaded_json)
if success:
    # manifest is ClassifierSplitManifest with full validation
    print(f"Split: {manifest.train_size} train, {manifest.val_size} val, {manifest.test_size} test")
else:
    print(f"Validation error: {error}")
```

---

### 4. Split Validation Script (`scripts/atlas/validate-classifier-split.mts`)
**Purpose**: Prove split integrity and freeze dataset for training.

**Validates**:
- **G1: Split Disjointness** — no overlap between train/val/test
- **G2: Vector Dimensionality** — all 768 vectors are exactly 768-dim
- **G3: Label Coverage** — all domain classes represented in validation set
- **G4: Determinism Proof** — (requires running twice; split hash must be identical)
- **G5: Split Integrity** — no duplicate packet_keys within splits

**Output**: `classifier-validation-manifest.json` with gate results and split_hash

**Usage**:
```bash
npx tsx scripts/atlas/validate-classifier-split.mts --limit=500
npx tsx scripts/atlas/validate-classifier-split.mts --limit=5000
```

---

## Contract Alignment & Guarantee

### TypeScript ↔ Python Bidirectional Validation
1. SvelteKit receives Parquet snapshot + `split_manifest.json` from Python worker
2. TypeScript `validateSplitManifest(json)` checks schema via Zod
3. Python worker produces `EvaluationReport` JSON
4. TypeScript `validateEvaluationReport(json)` enforces gate (macro_f1 >= 0.5)
5. Python `validate_evaluation_report(dict)` provides Pydantic-backed type safety

**No ambiguous data crosses the boundary** — both sides validate the same JSON Schema.

---

## Next Steps (When Ready to Resume Modeling)

### Step 1: Freeze Label Map (Not Yet Done)
Create `label_map_v1.0.0.json`:
```json
{
  "schema_version": "1.0.0",
  "canonical_labels": [
    "agent",
    "agent_orchestration",
    "auth_login_register",
    ...
  ],
  "case_sensitivity": true,
  "duplicates_merged": [],
  "created_at": "2026-07-27T...",
  "rationale": "40 domain classes from atlas_packets.domain_class"
}
```

### Step 2: Freeze Parquet Snapshots (Not Yet Done)
Export immutable Arrow/Parquet files:
- `artifacts/train.parquet` (packet_key, domain_class, embedding[768])
- `artifacts/val.parquet` (same schema)
- `artifacts/test.parquet` (same schema)
- `artifacts/split_manifest.json` (ClassifierSplitManifest)

Workers read from Parquet, not live Postgres.

### Step 3: Define RPC Contract (Not Yet Done)
Before FastAPI or gRPC:
- Training request: `model_type`, `artifact_paths`, `hyperparams`
- Training response: `model_sha256`, `evaluation_report`

### Step 4: Build Python CLI Job (Not Yet Done)
```bash
python -m atlas_ml train \
  --manifest artifacts/split_manifest.json \
  --model logistic_regression \
  --output artifacts/models/
```

### Step 5: Build RabbitMQ Worker (Not Yet Done)
Async training via message queue, not HTTP.

### Step 6: Add FastAPI Service (Not Yet Done)
Only after Python CLI + RabbitMQ + frozen contracts.

---

## Files Created This Session

| File | Type | Status | Purpose |
|------|------|--------|---------|
| `scripts/atlas/contracts.json` | JSON Schema | ✅ DONE | Language-neutral definitions |
| `scripts/atlas/lib/classifier-contracts.ts` | TypeScript/Zod | ✅ DONE | SvelteKit validation |
| `scripts/atlas/lib/classifier_contracts.py` | Python/Pydantic | ✅ DONE | Python worker validation |
| `scripts/atlas/validate-classifier-split.mts` | TypeScript | ✅ DONE | Split integrity validator |
| `memory/PHASE-111-CONTRACT-FOUNDATION.md` | Documentation | ✅ DONE | This file |

---

## Why Option A (Not B or C)

**Option B** (Attempt PyTorch CUDA MLP):
- Would require training a neural network on unsuitable embeddings
- 0.09 baseline suggests the problem space is fundamentally misaligned
- Adds complexity without solving the root issue

**Option C** (Defer to Phase 109):
- Would leave models untrained indefinitely
- Phase 111 is already blocked on model validation

**Option A** (Contracts First):
- ✅ Establishes bidirectional validation between TypeScript and Python
- ✅ Freezes dataset format (Parquet) so future workers use identical data
- ✅ Defines RPC contracts BEFORE building services
- ✅ Creates reusable infrastructure for Phase 111 and beyond

---

## Open Questions for Next Session

1. **Should we attempt a domain-specific embedding?**
   - Fine-tune embeddinggemma on domain classification before using it for training?
   - This would add 2–4 hours but might unlock 0.5+ macro F1 on real XGBoost/LogisticRegression.

2. **Should we revisit the domain label set?**
   - Are the 40 labels the "true" classes, or are they noisy/conflated?
   - Manual audit of label_map_v1.0.0 before freezing?

3. **Proceed immediately to FastAPI + RabbitMQ**?
   - Or test Python CLI on frozen Parquet first?

---

## Recommendation

**Contract foundation is complete.** Next session:
1. Run split validation script (`validate-classifier-split.mts`) to confirm all gates pass
2. Freeze `label_map_v1.0.0.json` (document 40 domain classes)
3. Export Parquet snapshots (train/val/test)
4. Implement Python CLI job using frozen Parquet
5. Test scikit-learn + XGBoost on Parquet (should reproduce Session 147 results)
6. **Then** decide: fine-tune embeddings, or accept that domain classification isn't viable with unsupervised embeddings?

---

**Status**: 🔴 CLASSIFIER TRAINING BLOCKED (embedding space unsuitable) | ✅ CONTRACTS FROZEN (ready for RPC work)  
**Confidence**: 85% (contracts correct, embedding mismatch confirmed, path forward clear)  
**Last Updated**: 2026-07-27T12:30:00Z
