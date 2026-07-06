# Phase 106: Deterministic Packet Operating System

**Status**: Implementation in progress  
**Date**: July 5, 2026  
**Mission**: Implement Phase 106 as a deterministic packet OS using Session 105 architecture

## Current State

```
atlas_packet_features (feature extraction evidence):
  ✓ used_concepts: 100% (58,361/58,365)
  ◐ ast_symbols: 0.9% (516/58,304 extractable) — batch optimization in progress
  ◐ lexical_features: 2.4% (1,418/58,304 extractable) — ready to populate
  ✓ entities: populated (from LangExtract Phase 3)

atlas_packet_metrics (training surface):
  ⦸ empty — ready for Naive Bayes predictions

atlas_packets (canonical identity):
  ✓ 58,365 total packets with packet_key + source_ref
  ◐ 61 proto: refs (no source files to extract from)
  ✓ 58,304 extractable (non-proto refs)
```

## Implementation Order (Critical Path)

### Phase 106.1: Complete Feature Extraction (NOW)

**Stage 1: ast-grep (in progress)**
```
node scripts/atlas/phase1.5-ast-grep-extraction.mjs --apply
→ target: 55,440/58,304 (95%+) ast_symbols populated
→ ETA: ~30-60 min with batch optimization
```

**Stage 2: Lexical Extraction (after Stage 1 reaches 50%+)**
```
node scripts/atlas/phase1.5-lexical-extraction.mjs --apply
→ derive top-20 keywords per packet from ast_symbols + source code
→ target: 55,440/58,304 (95%+) lexical_features populated
→ ETA: ~30-40 min
```

**Stage 3: LangExtract Concepts (verify complete)**
```
Check if atlas_packet_features.used_concepts is already at 100%
If not: wire LangExtract Phase 3 to populate remaining
→ target: 58,361/58,361 (100%) — currently PASS
```

### Phase 106.2: Naive Bayes Classifier (after features 95%+)

**Create: `train-naive-bayes-packet-classifier.py`**

Input training data shape:
```json
{
  "packet_key": "...",
  "ast_symbols": ["function", "class", ...],
  "lexical_features": ["auth", "session", ...],
  "used_concepts": ["security", "validation", ...],
  "entities": ["User", "Session", ...],
  "source_ref": "src/lib/server/auth.ts",
  "title_id": "...",
  "domain_class": "computed from above"
}
```

Output predictions:
```json
{
  "domain_class": "auth | data | ui | infra | network | config | other",
  "feature_type": "core | utility | test | config | schema | migration",
  "likely_error_state": "StructureError | LexicalError | SemanticError | TopologyError | VectorError",
  "candidate_repair_lane": "ast_extraction | lexical_extraction | concept_extraction | embedding | topology"
}
```

**Create: `apply-naive-bayes-packet-classifier.mjs`**

Steps:
1. Load trained Naive Bayes model (pickle from Python)
2. Fetch `atlas_packet_features` rows with 95%+ feature coverage
3. Vectorize: ast_symbols + lexical_features + used_concepts → feature matrix
4. Predict: domain_class, feature_type, error_state, repair_lane
5. Upsert predictions into `atlas_packet_metrics` (NEW columns):
   ```sql
   ALTER TABLE atlas_packet_metrics ADD COLUMN
     naive_bayes_predictions JSONB;
   ```
6. Write telemetry to Postgres for audit trail

### Phase 106.3: HMM State Machine (wire to Naive Bayes)

Existing: `phase8.8-hmm-semantic-compiler.mjs` (already implemented)

Modifications needed:
1. **Consume Naive Bayes predictions** from `atlas_packet_metrics.naive_bayes_predictions`
2. **Emit repair recommendations** to `atlas_packet_metrics`:
   ```json
   {
     "hmm_state": "VectorError | StructureError | ...",
     "confidence": 0.85,
     "recommended_repair_lane": "ast_extraction | qdrant_bridge | ...",
     "recommended_tool_call": "atlas:phase1.5:ast-grep:apply | atlas:qdrant:payload:bridge | ...",
     "evidence": {...}
   }
   ```

### Phase 106.4: ACP Dispatcher (consume HMM recommendations)

**Create: `acp-repair-dispatcher.mjs`**

Steps:
1. Fetch `atlas_packet_metrics` rows with HMM recommendations
2. Filter by confidence ≥ 0.7
3. Enqueue RabbitMQ job or dry-run action based on `recommended_tool_call`
4. Execute bounded job (with limits on scope to prevent cascade failures)
5. Validate output (check that repair lane executed successfully)
6. Record telemetry/reward (for RL training feedback loop)

## Routing Contract (Required Architecture)

```
atlas_packet_features
  ├─ 95%+ feature coverage (ast_symbols, lexical_features, used_concepts)
  └─→ Naive Bayes
      └─ predicts: domain_class, feature_type, error_state, repair_lane
         └─→ WRITE to atlas_packet_metrics.naive_bayes_predictions

atlas_packet_metrics
  ├─ Naive Bayes predictions (input)
  └─→ HMM
      └─ infers: state, confidence, recommended_repair_lane, tool_call
         └─→ WRITE to atlas_packet_metrics.hmm_recommendations

HMM recommendations
  └─→ ACP dispatcher
      └─ executes: ast-grep | lexical | LangExtract | embedding | topology
         └─→ WRITE telemetry + validate output
```

## Acceptance Criteria (MUST PASS)

1. **Feature Extraction**: ast_symbols ≥ 95%, lexical_features ≥ 95%, used_concepts = 100%
2. **Naive Bayes**: Predictions written to `atlas_packet_metrics.naive_bayes_predictions` for 50,000+ packets
3. **HMM**: Consumes Naive Bayes predictions, outputs state + confidence + tool_call recommendation
4. **ACP**: Enqueues repair jobs via RabbitMQ or dry-run
5. **No BitFrost warming** until feature/vector/Qdrant gaps resolved
6. **No breaking changes** to `atlas_packets` identity fields
7. **Phase 8.8 dry-run shows mixed repair recommendations** (StructureError → ast-grep, VectorError → qdrant-bridge, etc.)

## Risk Mitigation

- **Proto refs (61 packets)**: Expected to have 0% coverage (no source files) — gate uses extractable denominator
- **Feature extraction timeout**: Optimized batch updates (UNNEST) instead of row-by-row
- **Naive Bayes cascade failures**: Use confidence threshold (≥ 0.7) to filter weak predictions before ACP execution
- **HMM state conflicts**: Priority detection prevents single-signal dominance (Phase 8.8 already fixed)
- **ACP runaway**: Bound each repair job scope (max 100 packets per tool call)

## Measurement (Progress Tracking)

After each phase:
```
npm run atlas:validate:phase106:coverage
→ feature_id: 100%
→ domain_class: N% (from Naive Bayes)
→ tree_node_id: 65% (deferred)
→ hmm_state: N% (from HMM)
→ repair_lane: N% (from ACP)
→ BitFrost: PENDING (deferred until features ≥ 95%)
```

## Next Immediate Actions

1. ✅ Optimize ast-grep batch updates (IN PROGRESS)
2. ⏳ Monitor extraction progress: `docker exec legal-ai-postgres psql ... atlas_packet_features`
3. ⏳ Once ast_symbols reaches 50%+: Start lexical_features population
4. ⏳ Once features reach 95%+: Create Naive Bayes training script
5. ⏳ Wire Naive Bayes predictions → HMM
6. ⏳ Implement ACP dispatcher
7. ⏳ Run Phase 106 smoke test: dry-run with 1,000 packets

**Estimated Total Time**: 4-6 hours (extraction 1.5-2h + Naive Bayes 1.5-2h + HMM/ACP wiring 1-2h)
