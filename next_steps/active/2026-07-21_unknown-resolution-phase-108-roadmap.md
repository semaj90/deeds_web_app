# Unknown Resolution Architecture & Phase 108 Roadmap

**Date**: July 21, 2026  
**Phase**: 108–111+ (Post-Phase 107)  
**Status**: 🟢 ARCHITECTURE DEFINED, READY FOR PLANNING & IMPLEMENTATION  
**Milestone**: Knowledge Acquisition + Unknown-Aware Ingestion

---

## Executive Summary

**Current problem**: Packets without title_id, domain_class, or used_concepts are skipped or marked incomplete, losing valuable partial enrichment.

**Solution**: Treat unknowns as first-class observations, collect evidence for them, and promote them to canonical tables incrementally.

**Impact**: 100% packet ingestion, 80%+ auto-promotion rate, elimination of "skip" clauses in enrichment pipelines.

---

## Architecture Highlights

### 1. Full Ingestion Stack (9 layers)
```
Source → Identity → Lexical → Structural → Semantic → Classification → Unknown Resolution → Indexing → ACE
```

Each layer produces evidence, not immediate canonical facts.

### 2. Tool Responsibility Map
| Tool | Job | Input | Output |
|------|-----|-------|--------|
| **ripgrep** | Exact term search | Query string | Locations + confidence |
| **ast-grep** | Syntax shape match | AST pattern | Matches + metadata |
| **Tree-sitter** | Structural extraction | Source code | Symbol tree (immutable) |
| **LangExtract** | Grounded prose extraction | Documentation + schema | Extractions with charStart/charEnd |
| **Classifier** | Domain probability | Text features | `{ "primary": 0.93, ... }` |
| **LDR** | External research | Classifier gaps | Research results → unknown evidence |
| **Reranker** | Post-retrieval scoring | 50–100 candidates | Top 10–20 evidence packets |

### 3. Multi-Label Classification
- **Naive Bayes** (lexical baseline, fast, prod-ready)
- **Logistic regression** (non-linear, prod-ready)
- **XGBoost** (challenger, post-labeling)
- **PyTorch MLP** (learned, research phase)

**Output**: `{ primary_domain, domains: { domain: confidence } }`

### 4. Unknown Layer (5 new tables)
```
atlas_unknown_observations
  ├─ atlas_unknown_candidates (grounding)
  ├─ atlas_unknown_evidence (collection)
  ├─ atlas_unknown_resolution_runs (batch processing)
  └─ atlas_unknown_promotions (lifecycle)
```

### 5. Envelope Contract Change
**Before**: packet_key + title_id (required), used_concepts (required)  
**After**: packet_key + source_ref + content_hash (required), title/concepts/domain (unknown observations if missing)

---

## Phase 108: Unknown Infrastructure

### Timeline: 2–3 weeks
**Goal**: Make unknowns observable and traceable

#### Task 1: Schema & Migration (2 days)
- [x] Design 5 unknown tables
- [ ] Create Phase E migration (atlas_unknown_*.sql)
- [ ] Create Drizzle schema (schema-postgres.ts additions)
- [ ] Verify indexes on packet_key, unknown_kind, status
- [ ] Test migration on live DB (apply + rollback)

#### Task 2: Observation Creation (3 days)
- [ ] Implement `createUnknownObservation()` function
  ```typescript
  type CreateUnknownRequest = {
    packetKey: string;
    sourceRef: string;
    contentHash: string;
    unknownKind: 'term' | 'entity' | 'relation' | 'domain' | ...;
    observedValue: string;
    reason: 'no-glossary-match' | 'low-classification-confidence' | ...;
    confidence: number;
  };
  ```
- [ ] Wire into enrichment pipeline (no more "skip" on missing fields)
- [ ] Test: missing title → creates unknown observation
- [ ] Test: missing domain → creates unknown observation

#### Task 3: Integration (2 days)
- [ ] Update envelope validation logic:
  ```typescript
  type EnvelopeValidationResult = {
    identityValid: boolean;
    enrichmentComplete: boolean;
    unknownIds: string[];
    missingFields: string[];
    promotionEligible: boolean;
  };
  ```
- [ ] Modify skip-list → unknown-creation logic
- [ ] Update materializer to handle unknown rows (don't fail)

#### Task 4: Verification (1 day)
- [ ] Dry-run full pipeline with intentionally incomplete packets
- [ ] Verify unknowns created for each missing field
- [ ] Verify packet is NOT skipped
- [ ] Count unknowns: expected ~500–1000 on 61K packets

---

## Phase 109: Glossary Matching & Promotion

### Timeline: 2–3 weeks
**Goal**: Auto-promote high-confidence unknowns to canonical tables

#### Task 1: Glossary Integration (2 days)
- [ ] Load .okf glossary into Postgres (okf_glossary_concepts table)
- [ ] Implement glossary lookup for unknown terms
- [ ] Create `promoteUnknownToGlossary()` function
  ```typescript
  type PromotionResult = {
    unknownId: string;
    promotedTo: 'glossary' | 'ontology' | 'domain-class' | ...;
    targetId: string;
    confidence: number;
    reason: 'exact-match' | 'fuzzy-match' | 'classifier-agreement' | ...;
  };
  ```

#### Task 2: Candidate Grounding (3 days)
- [ ] Implement candidate generation (ripgrep + ast-grep evidence)
- [ ] Implement candidate grounding (charStart/charEnd for prose, symbol_name for code)
- [ ] Create `atlas_unknown_candidates` entries
- [ ] Wire into unknown observation lifecycle

#### Task 3: Auto-Promotion Rules (2 days)
- [ ] Rule: exact glossary match + confidence > 0.95 → auto-promote
- [ ] Rule: classifier output + high agreement → auto-promote
- [ ] Rule: multiple evidence sources → increase confidence
- [ ] Rule: user correction → immediate promotion + feedback to classifier

#### Task 4: Verification (1 day)
- [ ] Run glossary-match batch on Phase 108 unknowns
- [ ] Measure promotion rate (target: 60–70% of unknowns promoted)
- [ ] Verify promoted values appear in canonical tables
- [ ] Test user-correction workflow (manual promotion)

---

## Phase 110: Classification-Driven Research

### Timeline: 3–4 weeks
**Goal**: Use classifier gaps to trigger LDR research

#### Task 1: Classifier ↔ LDR Wiring (2 days)
- [ ] Update LDR to accept `LdrResearchRequest` type
- [ ] Implement decision logic:
  ```
  if classifier_confidence < 0.6:
    → trigger LDR research
  if unresolved_terms.length > 0:
    → constrain research sources to matching domains
  if external_evidence_required reason:
    → escalate to LDR with high priority
  ```
- [ ] Wire LDR results back to `atlas_unknown_evidence` table

#### Task 2: External Source Ingestion (2 days)
- [ ] Define external source schema:
  ```typescript
  type ExternalSource = {
    url: string;
    retrievedAt: timestamp;
    contentHash: string;
    publisher: string;
    authority: 'official' | 'github' | 'community' | 'blog';
    license: string;
  };
  ```
- [ ] Implement source registration workflow
- [ ] Link research results to unknown evidence

#### Task 3: Evidence-Driven Promotion (2 days)
- [ ] Auto-promote if: `ldr_sources >= 2 AND confidence > 0.75`
- [ ] Auto-promote if: `ldr_official_source + agreement > 0.85`
- [ ] Implement promotion-eligibility scoring
- [ ] Create auto-promotion job (daily batch)

#### Task 4: Verification (1 day)
- [ ] Pick 50 high-unknown-count packets
- [ ] Trigger LDR research on external-evidence-required unknowns
- [ ] Measure promotion rate (target: 80%+ of researched unknowns)
- [ ] Verify external sources captured with provenance

---

## Phase 111+: Learning & Iteration

### Timeline: Ongoing
**Goal**: Close feedback loop, improve classifier, refine promotion rules

#### Activities
- [ ] Collect user corrections (manual promotions)
- [ ] Retrain classifier on new labels (monthly)
- [ ] Evaluate promotion accuracy (weekly metrics)
- [ ] Adjust confidence thresholds based on false-positive rate
- [ ] Export .okf corpus with grown glossary (weekly)

---

## Blocked Dependencies

| Dependency | Blocks | Impact | Mitigation |
|---|---|---|---|
| Phase 107 completion | Phase 108 start | Unknown schema requires stable identity | Run Phase D validation, then start Phase 108 in parallel with Phase E/F |
| Phase E migration | Phase 108 apply | Table creation required for data | Use dry-run only until Phase E migration landed |
| Classifier implementation | Phase 110 start | Need domain probability output | Use Naive Bayes baseline (2–3 days) while learned model trains |
| Glossary build | Phase 109 apply | Need .okf corpus to match against | Use existing ~200 terms, grow incrementally |

---

## Key Metrics (Phase 108–111+)

| Metric | Current | Phase 108 | Phase 109 | Phase 110 | Phase 111 |
|---|---|---|---|---|---|
| % packets with title_id | 95% | → 100% (unknowns) | → 100% (promoted) | → 100% | 100% |
| % unknowns observed | — | 100% | 100% | 100% | 100% |
| % unknowns promoted | — | <5% | 60–70% | 80%+ | 85%+ |
| Glossary coverage | ~200 | ~200 | ~500–1K | 2K–3K | 5K+ |
| External research % | — | — | — | <10% | <5% |
| User correction rate | 0% | 0% | <5% | <3% | <2% |

---

## Quick Reference: What's Next

### Immediate (after Phase 107 D/E/F)
1. **Phase 108 Planning**: Break down 5 schema tasks, assign effort
2. **Glossary Inventory**: Count existing .okf terms, plan growth path
3. **Classifier Baseline**: Implement Naive Bayes multi-label (2–3 days)

### Phase 108 Start
1. Create migration + schema
2. Implement observation creation
3. Wire into pipeline (no more skip)
4. Dry-run + verify unknown count

### After Phase 108
1. Run glossary promotion batch
2. Measure promotion rate
3. Plan Phase 109 (2–3 week sprint)

---

## Cross-References

- **Architecture**: `memory/UNKNOWN-RESOLUTION-ARCHITECTURE.md` (full design)
- **Phase 107**: Feature Layer Schema Alignment (identity foundation)
- **Phase 8**: Current envelope contract (to be updated)
- **LDR**: Local Deep Research (classifier gap → research)
- **.okf**: Knowledge corpus export (unknown promotion sink)

---

## Confidence: 🟢 HIGH

Architecture is orthogonal to Phase 107, can proceed in parallel or immediately after.

**Recommendation**: Prioritize Phase 108 (infrastructure) over optional Phase 4 (external model work). Unknown resolution is a foundational capability for all downstream enrichment.

