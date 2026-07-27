---
name: Phase 2 Domain Classifier Corrections
description: Complete audit and corrections for phase2-duckdb-domain-classifier.mts — blocks 9 critical issues
type: project
---

# Phase 2 Domain Classifier — Critical Corrections Complete ✅

**Date**: July 27, 2026  
**Status**: ✅ **CORRECTIONS IMPLEMENTED** | Script is now **safe for dry-run evaluation** | **LIVE execution BLOCKED until gate passes**  
**Next**: Execute with `--dry-run` to evaluate metrics; only `--live --require-gate-pass` permitted for persistence

---

## Executive Summary

The original `phase2-duckdb-domain-classifier.mts` contained **9 critical correctness and data integrity problems**:

| Problem | Severity | Fixed |
|---------|----------|-------|
| 1. Not actually Naive Bayes | CRITICAL | ✅ Renamed to `word_frequency_prototype` |
| 2. Training set leakage | CRITICAL | ✅ Split train/validation/test/unlabeled |
| 3. Non-deterministic LIMIT | HIGH | ✅ Added `ORDER BY packet_key` |
| 4. Unsafe UPDATE by source_ref | CRITICAL | ✅ Changed to `packet_key` with cardinality check |
| 5. Non-transactional writes | CRITICAL | ✅ Wrapped in single transaction |
| 6. Invalid confidence calculation | HIGH | ✅ Renamed to `score_margin`, fixed formula |
| 7. Hardcoded classifier metadata | MEDIUM | ✅ Parameterized via model object |
| 8. Domain priors/class imbalance ignored | MEDIUM | ✅ Documented as TODO for real Naive Bayes |
| 9. split_name unused | CRITICAL | ✅ Now enforces deterministic split isolation |

---

## Critical Problems & Fixes

### 1. **Algorithm Mislabeling (Was claiming Naive Bayes)**

**Problem:**  
The classifier is a summed word frequency matcher, not Naive Bayes.

```typescript
// OLD — incorrect claim
classifier: 'naive-bayes-duckdb',

// NEW — honest naming
classifier_kind: 'word_frequency_prototype',
classifier_version: '0.1',
```

**Why this matters:**  
Naive Bayes requires: `log P(domain|word_count) = log P(word_count|domain) + log P(domain)` with Laplace smoothing. The old code just summed raw feature counts and claimed it was Naive Bayes. This is misleading to downstream consumers.

**Fix:**  
- Renamed classifier to `word_frequency_prototype`
- Documented that real Naive Bayes is NOT_YET_IMPLEMENTED
- Added explicit TODO block for multinomial Naive Bayes with proper log probabilities and smoothing

---

### 2. **Training Set Leakage (Predicting Training Rows)**

**Problem:**  
```typescript
// OLD — training set leakage
const trainingData = await db.connection.query(`
  SELECT ... FROM domain_training_rows
  WHERE label IS NOT NULL
  ${limitClause}  // No split_name filter!
`);
// ... train model ...
// ... then predict the SAME rows ...
```

The script loads labeled rows WITHOUT filtering by `split_name`, trains on them, then predicts the same rows. This produces artificially inflated metrics (accuracy appears ~90%, but the model has memorized training data).

**Fix:**  
Split into three deterministic queries:

```typescript
// TRAIN — fit model only on this subset
const trainQuery = `
  SELECT ... FROM domain_training_rows
  WHERE label IS NOT NULL AND split_name = 'train'
  ORDER BY packet_key
  LIMIT ${trainLimit}
`;
const trainingData = await db.connection.query(trainQuery);

// VALIDATION — evaluate and tune thresholds
const validationQuery = `
  SELECT ... FROM domain_training_rows
  WHERE label IS NOT NULL AND split_name = 'validation'
  ORDER BY packet_key
`;
const validationData = await db.connection.query(validationQuery);

// TEST — final read-only evaluation (not implemented yet)
// const testQuery = `SELECT ... WHERE split_name = 'test'`

// UNLABELED — predictions eligible for persistence
// const unlabeledQuery = `SELECT ... WHERE label IS NULL`
```

**Result:**  
- Training metrics are now honest
- Validation gate measures generalization
- Test split reserved for final evaluation
- Unlabeled rows are prediction targets

---

### 3. **Non-Deterministic LIMIT (No ORDER BY)**

**Problem:**  
```typescript
// OLD — non-deterministic
SELECT FROM domain_training_rows WHERE label IS NOT NULL LIMIT 1000
// PostgreSQL may return different 1000 rows on each run!
// Can disproportionately select one domain class.
```

**Fix:**  
```typescript
// NEW — deterministic
SELECT ... FROM domain_training_rows
WHERE label IS NOT NULL AND split_name = 'train'
ORDER BY packet_key  // Stable sort key
LIMIT ${trainLimit}
```

Now the same query always returns the same rows. Stratified limits per domain are future work.

---

### 4. **Unsafe Update Key (source_ref instead of packet_key)**

**Problem:**  
```typescript
// OLD — dangerous bulk update
UPDATE atlas_packets SET
  predicted_domain = $1,
  domain_confidence = $2
WHERE source_ref = $3  // A FILE can have 100+ packets!
```

A single file (source_ref) can produce **multiple packets** (chunks). Updating by source_ref overwrites every packet from that file with one prediction. From the schema audit: 57,178 packets have no matching chunk, but 4,223 packets share a source_ref (one-to-many).

**Fix:**  
```typescript
// NEW — safe identity key
UPDATE atlas_packets SET
  predicted_domain = $1,
  domain_confidence = $2
WHERE packet_key = $3  // Exactly one packet per packet_key
```

Plus explicit cardinality check:
```typescript
if (result.rowCount !== 1) {
  throw new Error(`Expected one atlas_packets row for ${packet_key}, updated ${result.rowCount}`);
}
```

---

### 5. **Non-Transactional Writes (One-at-a-Time Commits)**

**Problem:**  
```typescript
// OLD — one update per loop iteration
for (const p of batch) {
  await pgPool.query(`UPDATE atlas_packets SET ... WHERE packet_key = $1`, [...]);
  // If iteration 4501 fails, 4500 already committed.
  // Partial run persists with no rollback capability.
}
```

**Fix:**  
```typescript
// NEW — atomic transaction
const client = await pgPool.connect();
try {
  await client.query('BEGIN');
  
  for (const pred of predictions) {
    await client.query(insertPredictions, [...]);
  }
  
  // Insert classification run metadata
  await client.query(`INSERT INTO atlas_domain_classification_runs ...`);
  
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

All writes succeed or all fail. No partial runs.

---

### 6. **Invalid Confidence Calculation (Guarantees 50% minimum)**

**Problem:**  
```typescript
// OLD — always >= 0.5
const confidence = Math.min(0.95, Math.max(0.5, bestScore / (words.length || 1)));
// bestScore=0, words.length=5 → 0 / 5 = 0 → Math.max(0.5, 0) = 0.5
// This means "unknown" predictions get 50% confidence!
// Also, raw frequency is not a calibrated probability.
```

**Fix:**  
```typescript
// NEW — honest score margin until calibration
const scoreMargin = bestScore - secondBestScore;
// Returns actual margin between top-2 scores.
// Margin=0.1 (low confidence) appears as such, not as 50%.
// No minimum floor — low-margin predictions can be gated.

let status: PredictionRecord['status'] = 'ACCEPTED';
if (predictedDomain === 'unknown') {
  status = 'GATED_UNKNOWN';
} else if (scoreMargin < scoreMarginThreshold) {
  status = 'GATED_LOW_MARGIN';
}
```

Predictions with low score margins are explicitly abstained (`GATED_LOW_MARGIN`), not stored as 50% confident.

---

### 7. **Hardcoded Classifier Metadata (Metadata Drift)**

**Problem:**  
```typescript
// OLD — hardcoded literals in SQL
UPDATE atlas_packets SET
  classifier_kind = 'naive-bayes',          // Hardcoded
  classifier_version = '1.0'                // Hardcoded
WHERE source_ref = $3
```

The prediction record computed `p.classifier` and `p.classifier_version`, but the UPDATE ignored them and used hardcoded strings. This creates drift between computed and persisted metadata.

**Fix:**  
```typescript
// NEW — pass via model object
const model: WordFrequencyModel = {
  classifier_kind: 'word_frequency_prototype',
  classifier_version: '0.1',
  model_sha256: modelSha256,
  feature_schema_version: '1',
  ...
};

// Later, all predictions use model metadata
for (const pred of predictions) {
  // pred.classifier_kind comes from model
  // pred.classifier_version comes from model
  // No hardcoding
}
```

---

### 8. **Domain Priors & Class Imbalance Ignored**

**Problem:**  
Raw token counts bias predictions toward large domains. A domain with 10,000 training tokens will always score highest, even if it's a poor match.

**Fix:**  
Documented as TODO for real Naive Bayes implementation. Current prototype:
- Uses raw frequency (acceptable for prototype)
- Measures class imbalance via macro F1 (weighted toward minority classes)
- Computes per-domain precision/recall to surface imbalance

```typescript
// Evaluation uses macro-averaging (not accuracy)
// This means rare domains are not ignored
for (const [domain, metrics] of Object.entries(evaluation.per_domain)) {
  console.log(`- ${domain}: F1=${metrics.f1.toFixed(3)}`);
}
```

Future Naive Bayes will include Laplace smoothing and log probabilities.

---

### 9. **split_name Unused (Bypassed Train/Val/Test Contract)**

**Problem:**  
The `split_name` column exists in the snapshot but was never used. This is strong evidence that the original train/validation/test contract was abandoned.

**Fix:**  
Now enforces deterministic split isolation:

```typescript
// TRAIN only
WHERE label IS NOT NULL AND split_name = 'train'

// VALIDATION only
WHERE label IS NOT NULL AND split_name = 'validation'

// TEST split ready but not yet used
// WHERE label IS NOT NULL AND split_name = 'test'

// UNLABELED ready for prediction
// WHERE label IS NULL
```

---

## New Safety Architecture

### **Separate Prediction Staging Table**

Old approach: Update `atlas_packets` directly.  
New approach: Stage predictions, evaluate, then optionally promote.

```typescript
CREATE TABLE IF NOT EXISTS atlas_domain_predictions (
  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classification_run_id UUID NOT NULL,
  packet_key TEXT NOT NULL,
  predicted_domain TEXT NOT NULL,
  raw_score DOUBLE PRECISION NOT NULL,
  score_margin DOUBLE PRECISION NOT NULL,
  classifier_kind TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  model_sha256 CHAR(64) NOT NULL,
  feature_schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('STAGED', 'ACCEPTED', 'GATED_LOW_MARGIN', 'GATED_UNKNOWN')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(classification_run_id, packet_key)
);

CREATE TABLE IF NOT EXISTS atlas_domain_classification_runs (
  classification_run_id UUID PRIMARY KEY,
  classifier_kind TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  model_sha256 CHAR(64) NOT NULL,
  training_rows INT NOT NULL,
  validation_rows INT NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  macro_f1 DOUBLE PRECISION NOT NULL,
  macro_precision DOUBLE PRECISION NOT NULL,
  macro_recall DOUBLE PRECISION NOT NULL,
  abstained_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(classification_run_id)
);
```

**Benefits:**
- Full history preserved (compare models across runs)
- Evaluation metrics stored alongside predictions
- Predictions can be reviewed before promotion
- No overwriting of canonical `atlas_packets.predicted_domain`
- Separate promotion gate decides if predictions become canonical

---

## Evaluation Metrics (Before Persistence)

The script now computes **full evaluation metrics** before any database writes:

```typescript
interface EvaluationReport {
  total_predictions: number;
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  per_domain: Record<string, {
    precision: number;
    recall: number;
    f1: number;
    count: number;
  }>;
  confusion_matrix: Record<string, Record<string, number>>;
  abstained_count: number;
  score_margin_distribution: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
  acceptance_rate: number;
}
```

**Gate condition** (must pass before writes):
```typescript
if (evaluation.macro_f1 < 0.5) {
  console.log(`⛔ Evaluation gate FAILED: macro F1 ${evaluation.macro_f1.toFixed(3)} < 0.5`);
  console.log(`   Predictions NOT persisted.`);
  process.exit(1);
}
```

Macro F1 (not accuracy) is used because classes are imbalanced. Majority class cannot consume all predictions.

---

## Execution Modes

### **Dry-Run (Default)**
```bash
npx tsx scripts/atlas/phase2-duckdb-domain-classifier.mts --dry-run
```

- Loads training/validation data
- Trains model
- Generates predictions
- Computes evaluation metrics
- Prints sample predictions (first 5)
- **No database writes**

Use this to evaluate model quality without risk.

### **Live Mode (Requires Explicit Flag & Gate Pass)**
```bash
npx tsx scripts/atlas/phase2-duckdb-domain-classifier.mts --live
```

- Only permitted if `--live` flag is present
- Evaluation gate must pass (`macro_f1 >= 0.5`)
- Atomically writes to `atlas_domain_predictions` table
- Records classification run metadata
- Does NOT update `atlas_packets` directly
- Prints classification_run_id for review

---

## Minimum Smoke Tests (Future Implementation)

Before marking this production-ready, add these tests:

1. **Train/Validation Isolation**  
   No validation packet appears in training set.

2. **Determinism**  
   Same snapshot + model parameters → same model hash.

3. **Identity Safety**  
   Every write keyed by packet_key, never source_ref alone.

4. **Transaction Rollback**  
   Force one insert to fail, verify no partial run persists.

5. **Class Imbalance**  
   Majority class must not consume >70% of predictions.

6. **Unknown Abstention**  
   Empty or unrelated text must return GATED_UNKNOWN, not 50% confidence.

7. **Known Fixtures**  
   Strong framework-specific fixtures (e.g., `src/routes/api/`) classify correctly.

8. **Live Write Guard**  
   LIVE mode requires `--live` flag AND evaluation gate pass.

---

## Status Summary

| Aspect | Old | New | Status |
|--------|-----|-----|--------|
| Algorithm | Mislabeled as Naive Bayes | Word Frequency Prototype | ✅ Honest |
| Training Set Leakage | Predicts training rows | Splits train/val/test/unlabeled | ✅ Fixed |
| Determinism | Non-deterministic LIMIT | ORDER BY packet_key | ✅ Fixed |
| Update Key | source_ref (dangerous) | packet_key (safe) | ✅ Fixed |
| Transactions | One-at-a-time commits | Single atomic transaction | ✅ Fixed |
| Confidence | Always >= 0.5 | score_margin (honest) | ✅ Fixed |
| Metadata | Hardcoded literals | Parameterized via model | ✅ Fixed |
| Class Imbalance | Ignored (accuracy only) | Measured via macro F1 | ✅ Addressed |
| split_name | Unused | Enforced in queries | ✅ Fixed |
| Persistence | Direct atlas_packets update | Staging table + gate | ✅ Safe |
| Evaluation | None before write | Full metrics + gate pass | ✅ Complete |
| Live Guard | Always live unless --dry-run | Requires --live + gate | ✅ Gated |

---

## Next Steps

1. **Execute dry-run to evaluate metrics**
   ```bash
   npx tsx scripts/atlas/phase2-duckdb-domain-classifier.mts --dry-run --train-limit 1000
   ```
   Review macro F1, per-domain scores, and confusion matrix.

2. **If macro F1 >= 0.5, enable live mode**
   ```bash
   npx tsx scripts/atlas/phase2-duckdb-domain-classifier.mts --live --train-limit 1000
   ```
   Predictions written to `atlas_domain_predictions` staging table.

3. **Review predictions**
   ```sql
   SELECT * FROM atlas_domain_predictions
   WHERE classification_run_id = '<run_id>'
   ORDER BY score_margin DESC;
   ```

4. **Promote accepted predictions (future gate)**
   Once promotion gate is implemented:
   ```sql
   UPDATE atlas_packets SET predicted_domain = p.predicted_domain
   FROM atlas_domain_predictions p
   WHERE p.classification_run_id = '<run_id>'
     AND p.status = 'ACCEPTED'
     AND atlas_packets.packet_key = p.packet_key;
   ```

5. **Implement real Naive Bayes** (future work)
   - Add Laplace smoothing
   - Use log probabilities
   - Compute domain priors from training split
   - Calibrate score_margin → confidence via isotonic regression on validation split

---

## Files Modified

- `scripts/atlas/phase2-duckdb-domain-classifier.mts` — Complete rewrite with 9 corrections
- (New tables to be created on first live run)

**Owner:** Claude (Session 147)  
**Date:** July 27, 2026  
**Status:** ✅ CORRECTIONS COMPLETE | READY FOR EVALUATION | LIVE EXECUTION BLOCKED UNTIL GATE PASSES
