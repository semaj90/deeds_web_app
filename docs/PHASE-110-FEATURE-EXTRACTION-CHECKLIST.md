# Phase 110+ Feature Extraction Checklist

**Goal**: Align feature extraction with NES/CHROM97/Glyph architecture  
**Scope**: Layers 1–2 (Canonical envelope + Feature extraction)  
**Timeline**: Session 110–111 (4-6 hours)

---

## Checkpoint 1: Layer 1 — Canonical Envelope (1h)

**Status**: Exists in code, needs schema alignment

### Tasks

- [ ] **Audit `atlas_packets` schema**
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "SELECT column_name, data_type FROM information_schema.columns \
        WHERE table_name='atlas_packets' ORDER BY ordinal_position;"
  ```
  **Verify**: packet_key, source_ref, feature_id, topology_cluster, community_id present

- [ ] **Verify JSONB envelope structure**
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "SELECT envelope FROM atlas_packets LIMIT 1 \G"
  ```
  **Verify**: envelope JSON has identity + metadata + pointers

- [ ] **Check bytea blob columns**
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS latent64_blob bytea, \
        ADD COLUMN IF NOT EXISTS latent128_blob bytea;"
  ```
  **Verify**: columns created (idempotent if already exist)

- [ ] **Create glyph_records table** (if missing)
  ```sql
  CREATE TABLE IF NOT EXISTS glyph_records (
    id TEXT PRIMARY KEY,
    packet_key TEXT NOT NULL REFERENCES atlas_packets(packet_key),
    title TEXT NOT NULL,
    label TEXT NOT NULL,
    bitpack_hex TEXT NOT NULL,
    bitpack_fields JSONB,
    tags TEXT[],
    semantic_tags TEXT[],
    glyph_version TEXT,
    created_at TIMESTAMP,
    UNIQUE(packet_key)
  );
  ```

**Dry-run**:
```bash
npm run atlas:audit:envelope --dry-run
```

**Expected output**: 58,304 packets with valid envelope structure

---

## Checkpoint 2: Layer 2 — Feature Extraction (4h)

**Status**: Partially done (ast-grep phase 2A ~516 symbols, target >80%)

### Substep 2A: AST Symbol Extraction (DONE in Session 110)

- [x] **Phase 2A dry-run** → 5/5 files, 92 extracted
- [x] **Phase 2A apply** → exit code 0, 516 total symbols
- [ ] **Audit coverage**
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "SELECT 
      COUNT(*) total,
      COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) extracted,
      ROUND(100.0 * COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) / COUNT(*), 2) coverage_pct
    FROM atlas_packet_features;"
  ```
  **Target**: >80% (46,177+ rows with ast_symbols)

### Substep 2B: Lexical Feature Extraction + K-Means (READY TO IMPLEMENT)

- [ ] **Review script**: `scripts/atlas/phase2b-lexical-extraction-kmeans.mjs`
- [ ] **Dry-run**: Extract lexical features from 100 packets
  ```bash
  npm run atlas:phase2b:lexical-kmeans:dry --limit=100
  ```
  **Expected**: 100 packets with 20–200 features each, no errors

- [ ] **Apply**: Extract from all packets
  ```bash
  npm run atlas:phase2b:lexical-kmeans:apply
  ```
  **ETA**: 2–3 hours

- [ ] **Verify coverage**
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "SELECT 
      COUNT(CASE WHEN lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0 THEN 1 END) extracted
    FROM atlas_packet_features;"
  ```
  **Target**: ~7,343 packets (matching ast_symbols)

- [ ] **Verify topology schema**
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "SELECT 
      COUNT(CASE WHEN topolog_cluster IS NOT NULL THEN 1 END) clustered,
      COUNT(CASE WHEN topolog_confidence IS NOT NULL THEN 1 END) confidence_scored
    FROM atlas_packets;"
  ```
  **Target**: topolog_cluster and topolog_confidence populated for ~7,343 packets

### Substep 2C: Entity Extraction (LangExtract) (READY AFTER 2B)

- [ ] **Review script**: `scripts/atlas/phase2c-entity-extraction.mjs` (needs creation)
- [ ] **Implement**: Extract entities (EMAIL, DATE, STATUTE, NAME, ORG) using LangExtract
  ```
  Input: lexical_features from 2B
  Output: entities array, entity_types array
  Target coverage: >80%
  ```

### Substep 2D: Remaining Extractors (2D, READY AFTER 2C)

- [ ] **Review script**: `scripts/atlas/phase2d-remaining-extractors.mjs` (needs creation)
- [ ] **Implement**: Extract:
  - imports/exports (from ast_symbols)
  - functions/classes (from ast_kinds)
  - routes (if applicable, regex for HTTP paths)
  - permissions (regex + domain keywords)
  ```
  Target coverage: >80% for all 9 LAYER 2 fields
  ```

**All 2 scripts combined ETA**: 6–8 hours total

---

## Checkpoint 3: Schema Finalization (1h)

- [ ] **Verify all columns exist** in `atlas_packet_features`:
  ```sql
  CREATE TABLE IF NOT EXISTS atlas_packet_features (
    packet_key TEXT PRIMARY KEY,
    ast_symbols TEXT[],
    ast_kinds TEXT[],
    lexical_features TEXT[],
    entities TEXT[],
    entity_types TEXT[],
    imports TEXT[],
    exports TEXT[],
    functions TEXT[],
    classes TEXT[],
    routes TEXT[],
    permissions TEXT[],
    domain_patterns JSONB,
    nesting_depth SMALLINT,
    complexity_score NUMERIC(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  ```

- [ ] **Create GIN indexes** for fast tag search:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_ast_symbols ON atlas_packet_features USING GIN (ast_symbols);
  CREATE INDEX IF NOT EXISTS idx_lexical_features ON atlas_packet_features USING GIN (lexical_features);
  CREATE INDEX IF NOT EXISTS idx_entities ON atlas_packet_features USING GIN (entities);
  CREATE INDEX IF NOT EXISTS idx_imports ON atlas_packet_features USING GIN (imports);
  ```

- [ ] **Audit coverage**:
  ```bash
  npm run atlas:layer2:coverage:report
  ```
  **Expected**: 
  ```
  Tier 1 (Identity):  100% (packet_key, source_ref, feature_id)
  Tier 2 (Features):  >80% (ast_symbols, lexical, entities, imports, ...)
  Tier 3 (Topology):  >80% (topolog_cluster, community_id, pagerank)
  Tier 4 (Retrieval): 7.32% (qdrant_point_id, only for embedded chunks)
  ```

---

## Checkpoint 4: Integration Check (30min)

- [ ] **Verify LAYER 1 + LAYER 2 pipeline works end-to-end**:
  ```bash
  npm run atlas:e2e:layers-1-2:validate
  ```
  **Expected**: 
  - 58,304 packets with valid canonical envelope
  - >80% coverage on all 9 LAYER 2 fields
  - All foreign keys valid (packet_key → atlas_packets)

- [ ] **Smoke test retrieval** with enriched features:
  ```bash
  npm run atlas:retrieval:feature-enriched:smoke
  ```
  **Expected**: Top-10 results include feature tags in ranking signals

---

## Checkpoint 5: Readiness for Layer 3 (30min)

- [ ] **Audit latent vector pointers** (for Phase 111):
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "SELECT 
      COUNT(*) total_packets,
      COUNT(CASE WHEN latent64_blob IS NOT NULL THEN 1 END) has_latent64,
      COUNT(CASE WHEN latent128_blob IS NOT NULL THEN 1 END) has_latent128
    FROM atlas_packets;"
  ```
  **Expected after Phase 111**: Both columns populated for >80% of packets

- [ ] **Verify autoencoder weights** (will be ready Phase 111):
  ```bash
  ls -lh models/latent_autoencoder*.pt
  ```
  **Expected**: Files exist with autoencoder trained weights

---

## Running the Full Checklist

```bash
# Session 110
npm run atlas:audit:envelope --dry-run
npm run atlas:phase2a:ast-grep-fix:apply        # Already done
npm run atlas:audit:layer2-coverage

# Session 111 (after Phase 2B/2C/2D scripts are ready)
npm run atlas:phase2b:lexical-kmeans:dry --limit=100
npm run atlas:phase2b:lexical-kmeans:apply
npm run atlas:phase2c:entity-extraction:apply
npm run atlas:phase2d:remaining-extractors:apply

# Final validation
npm run atlas:layer2:coverage:report
npm run atlas:e2e:layers-1-2:validate
npm run atlas:retrieval:feature-enriched:smoke
```

---

## Success Criteria (MUST ALL PASS)

| Criteria | Metric | Pass/Fail |
|----------|--------|-----------|
| **Layer 1 Envelope** | All 58,304 packets have valid JSONB | — |
| **Layer 1 Pointers** | All columns (latent64_id, latent128_id, glyph_id) populated | — |
| **Layer 2 AST** | >80% of packets have ast_symbols (≥46K rows) | — |
| **Layer 2 Lexical** | >80% of packets have lexical_features (≥46K rows) | — |
| **Layer 2 Entities** | >80% of packets have entities (≥46K rows) | — |
| **Layer 2 Imports** | >80% of packets have imports (≥46K rows) | — |
| **Layer 2 Exports** | >80% of packets have exports (≥46K rows) | — |
| **Layer 2 Functions** | >80% of packets have functions (≥46K rows) | — |
| **Layer 2 Classes** | >80% of packets have classes (≥46K rows) | — |
| **Layer 2 Routes** | >80% of packets have routes (≥46K rows) | — |
| **Layer 2 Permissions** | >80% of packets have permissions (≥46K rows) | — |
| **Topology** | topolog_cluster + community_id populated for >80% | — |
| **Schema** | All 9 LAYER 2 fields exist + indexed | — |
| **Integration** | Retrieval uses feature tags in ranking | — |

**Status**: 🟢 READY TO EXECUTE (Phase 110B → Phase 111)

