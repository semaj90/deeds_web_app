# Phase 85 P5: Feature Label Extraction — Implementation Plan

**Objective**: Extract feature labels from packets using existing AST logic + Gemma4 synthesis

**Effort**: 2-3 hours | **Status**: Ready to execute

---

## 📋 Discovery: Extractable Code

### Existing Functions (READY TO USE)

**1. feature-builder.ts (94 lines, pure logic)**
```typescript
export function buildFeatureLabels({
  trace,
  files,
  symbols,
}: {
  trace: unknown;
  files?: string[];
  symbols?: Record<string, string[]>;
}): FeatureLabel[]
```
✅ Pure function, no dependencies, extractable to atlas-core
✅ Maps trace rows → FeatureLabel[] with symbol deduplication
✅ Handles missing fields gracefully

**2. feature-extraction.ts (200+ lines, pure logic)**
```typescript
export function extractQueryFeatures(query: string): QueryFeatures
```
✅ Intent classification (debug/refactor/explain/search/general)
✅ Entity extraction (class/function/file/variable/error)
✅ Keyword matching against 50+ programming concepts
✅ Phrase extraction for semantic search

**Interface**:
```typescript
export interface FeatureLabel {
  path: string;
  feature: string;
  labels: string[];
  summary: string;
  symbols: string[];
  score: number;
  protocols?: string[];
  languages?: string[];
  sourceRefs?: string[];
}
```

---

## 🏗️ P5 Architecture

```
Packet (packet_key, source_ref, feature_id)
  ↓
Extract from context:
  ├─ Source file path (source_ref)
  ├─ Feature ID (feature_id)
  ├─ Code snippet / summary
  └─ Any parsed AST (if available)
  ↓
Run feature extraction logic:
  ├─ buildFeatureLabels() — symbol extraction
  ├─ extractQueryFeatures() — intent + keywords
  └─ Merge results
  ↓
Optional Gemma4 synthesis:
  ├─ For ambiguous cases (confidence < 0.5)
  ├─ Ask: "What feature category does this code belong to?"
  └─ Fallback: Use extracted feature_id as default
  ↓
Store to atlas_artifacts:
  ├─ artifact_type = 'feature_labels'
  ├─ content_hash = sha256(labels JSON)
  ├─ status = 'generated'
  └─ gan_validation_score = confidence
```

---

## 📝 Implementation Steps

### Step 1: Create P5 Audit Script (30 min)
**File**: scripts/phase85/p5-feature-label-extraction.mjs

**Purpose**: 
- Count packets with extractable features
- Test feature-builder on sample packets
- Report coverage gaps

### Step 2: Create Feature Labels Extractor (1h)
**File**: sveltekit-frontend/src/lib/server/generation/feature-label-extractor.ts

**Functions**:
- Main pipeline: extractPacketFeatures()
- Pure extraction: extractFeaturesFromContext()
- Optional synthesis: synthesizeFeatureLabelIfNeeded()

### Step 3: Create API Endpoint (15 min)
**File**: sveltekit-frontend/src/routes/api/atlas/feature-labels/+server.ts

**Endpoint**: POST /api/atlas/feature-labels

### Step 4: Wire into Packet Summary Pipeline (30 min)
**File**: sveltekit-frontend/src/lib/server/generation/packet-summary-pipeline.ts

**Location**: After QA validation (Step 5)

### Step 5: Create Batch Backfill Script (30 min)
**File**: scripts/phase85/p5-backfill-feature-labels.mjs

**Usage**:
- npm run atlas:p5:backfill:dry-run
- npm run atlas:p5:backfill:apply
- npm run atlas:p5:backfill:verify

---

## ✅ Success Criteria

### P5 Complete When:
- Feature extraction audit script runs without errors
- Feature labels extracted for >10,000 packets (>60% coverage)
- Average confidence score > 0.7
- Gemma4 synthesis used for <20% of packets (ambiguous cases)
- 0 hard errors during backfill
- 100% identity preservation (packet_key/source_ref match)

### Data Quality:
- No empty label arrays
- Symbol extraction covers >50% of packets with code context
- Confidence scores properly distributed
- Feature label counts < 100K (not duplicate explosion)

### Performance:
- Batch processing < 5 min for 1000 packets
- Gemma4 synthesis < 2 sec per ambiguous packet
- API endpoint response < 500ms

---

## 📊 Metrics to Track

| Metric | Target | Status |
|--------|--------|--------|
| Packets with labels | >15,000 (85%) | TBD |
| Average confidence | 0.7-0.9 | TBD |
| Symbol coverage | >50% | TBD |
| Gemma4 usage | <20% | TBD |
| Hard errors | 0 | TBD |
| Backfill time | <1h | TBD |

---

## 🚀 Execution Timeline

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Create audit script | 30 min |
| 2 | Implement extractor | 1h |
| 3 | Wire API endpoint | 15 min |
| 4 | Integrate pipeline | 30 min |
| 5 | Create backfill | 30 min |
| 6 | Run dry-run | 15 min |
| 7 | Execute backfill | 30 min |
| 8 | Verify results | 15 min |
| | **TOTAL** | **3-4h** |

---

## 🔍 Code to Promote (Post-P5)

**Tier 1 (Pure Logic)**:
- feature-builder.ts → packages/atlas-core/src/features/builder.ts
- feature-extraction.ts → packages/atlas-core/src/features/extraction.ts

**Tier 2 (Validation)**:
- feature-label-extractor.ts → packages/atlas-core/src/features/extractor.ts

**Tier 3 (Infrastructure)**:
- feature-labels/+server.ts → SvelteKit route only (HTTP boundary)

---

**Owner**: Phase 85 P5  
**Last Updated**: June 28, 2026  
**Next**: P6 GAN Validation (1.5-2h)