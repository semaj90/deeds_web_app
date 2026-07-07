# Gate 3: Symbol Resolver + Structural Edges — Specification & Execution Plan

**Date**: July 7, 2026  
**Status**: 🟡 **DESIGN_READY — AWAITING PATH A/B DECISION TO EXECUTE**  
**Scope**: Path-independent (execute immediately once user decides)  
**Owner**: Claude / Session 121+  

---

## Purpose

Build deterministic symbol resolution and extract structural graph edges to complement semantic edges (Phase 3b.1).

**Current State**:
- ✅ **Packets**: 58,365 packets exist
- ✅ **Symbols**: Function/class names in `codebase_chunk_index.chunk_type` + `title`
- ✅ **Semantic edges**: 106K edges from Phase 3b.1 (keyword overlap)
- ❌ **Structural edges**: CALLS, IMPORTS, USES, TESTED_BY missing

**Gate 3 delivers**: Deterministic symbol→packet resolution + 10K+ structural edges in Neo4j.

---

## System Design

### Component 1: Symbol Resolver (`symbol-resolver.ts`)

**Purpose**: Resolve symbol name → packet_key + confidence

**Input**: Symbol string (e.g., `auth.validateSession`, `Promise`, `useContext`)

**Output**: 
```typescript
SymbolResolution {
  packet_key: string;
  confidence: number;        // [0, 1]
  strategy: 'ast_match' | 'import_trace' | 'levenshtein' | 'fallback';
  candidates: SymbolCandidate[];
}
```

**Strategy Priority** (try in order):
1. **AST match** (highest confidence, 0.95)
   - Use `ast-grep` to find exact symbol definition
   - Result: Direct AST node → packet_key
   - Coverage: ~80-90% of symbols

2. **Import trace** (high confidence, 0.85)
   - Follow import chains: `auth.ts` imports from `session.ts` → link both
   - Result: Module relationship → packet_key
   - Coverage: ~60-70% of imported symbols

3. **Levenshtein distance** (medium confidence, 0.60-0.75)
   - String similarity on `codebase_chunk_index.title`
   - Threshold: distance ≤ 2 edits
   - Result: Fuzzy match → packet_key
   - Coverage: ~40-50% of misspelled/partial matches

4. **Fallback** (low confidence, 0.40)
   - Return top-3 Levenshtein candidates
   - Let downstream logic (HMM, reranking) choose
   - Coverage: 100% (always produces result)

**File**: `src/lib/server/graph/symbol-resolver.ts` (320 lines estimated)

---

### Component 2: Structural Edge Extraction (`extract-structural-edges.mjs`)

**Purpose**: Walk AST + imports to extract deterministic edges

**Edge Types**:

| Edge | Definition | Example | Cardinality |
|------|-----------|---------|------------|
| **CALLS** | Function A calls Function B | `login()` calls `validateSession()` | N:M |
| **IMPORTS** | Module A imports from Module B | `auth.ts` imports from `session.ts` | N:M |
| **USES** | Symbol A uses constant/type B | Code uses `ROLE_ADMIN` constant | N:M |
| **TESTED_BY** | Test file tests target function | `auth.test.ts` tests `validateSession()` | N:1 |

**Data Source**:
- **AST**: `ast-grep` or Node.js parser (tree-sitter)
- **Imports**: Static analysis of `import` statements
- **Tests**: Pattern matching on test file names + function references
- **Documentation**: JSDoc `@uses` annotations (optional)

**Algorithm** (12-step pipeline):
1. Load all 58,365 packets from Postgres
2. For each packet with `source_ref` (file path):
   - Parse source file with tree-sitter
   - Walk AST to find all function definitions, calls, imports
   - Extract symbol pairs (source_symbol, target_symbol)
3. For each symbol pair:
   - Resolve source_symbol → source_packet_key (via Symbol Resolver)
   - Resolve target_symbol → target_packet_key (via Symbol Resolver)
4. Create edge: `(source_packet_key) -[EDGE_TYPE]-> (target_packet_key)`
5. Write to Neo4j with deterministic merge (idempotent)
6. Write to Postgres audit table (structural_edges)
7. Collect statistics (edge_count, resolve_success_rate)
8. Generate report

**Execution Script**: `scripts/atlas/extract-structural-edges.mjs` (450 lines estimated)

**npm script**: `atlas:gate3:extract:structural-edges:{dry,apply}`

---

### Component 3: Neo4j Sync (`sync-structural-edges-to-neo4j.mjs`)

**Purpose**: Merge semantic edges (Phase 3b.1) + structural edges into hybrid graph

**Operation**:
1. Read structural edges from Postgres `structural_edges` table
2. For each edge:
   - Create or update Neo4j relationship
   - Preserve metadata: edge_type, confidence, created_at, extraction_method
3. Verify no broken references (both source + target exist as nodes)
4. Build indices on common traversals (CALLS, IMPORTS, SIMILAR_TO)

**Result**: Neo4j now has:
- SIMILAR_TO edges (semantic, Phase 3b.1) — 106,085 edges
- CALLS edges (structural, Gate 3) — ~5K-10K edges
- IMPORTS edges (structural, Gate 3) — ~3K-5K edges
- USES edges (structural, Gate 3) — ~1K-3K edges
- TESTED_BY edges (structural, Gate 3) — ~100-500 edges

**Execution Script**: `scripts/atlas/sync-structural-edges-to-neo4j.mjs` (200 lines estimated)

**npm script**: `atlas:gate3:sync:neo4j:{dry,apply}`

---

## Execution Checklist

### Phase 1: Symbol Resolver Implementation (4 hours)

- [ ] Create `src/lib/server/graph/symbol-resolver.ts`
  - [ ] AST-grep integration (spawn process, parse results)
  - [ ] Import trace logic (follow `import` statements)
  - [ ] Levenshtein distance implementation (or npm package)
  - [ ] Confidence weighting per strategy
  - [ ] Caching (Redis L1, in-memory L0)
- [ ] Create `src/lib/server/graph/__tests__/symbol-resolver.spec.ts`
  - [ ] Test 20 common symbols (Promise, useContext, auth, session, etc.)
  - [ ] Verify confidence ∈ [0, 1]
  - [ ] Test fallback path (unknown symbol → candidates)
- [ ] **npm script**: `atlas:gate3:symbol-resolver:test`

### Phase 2: Structural Edge Extraction (6 hours)

- [ ] Create `scripts/atlas/extract-structural-edges.mjs`
  - [ ] Load all packets (58K)
  - [ ] Parse each source file (AST walk)
  - [ ] Extract CALLS, IMPORTS, USES, TESTED_BY edges
  - [ ] Resolve symbols via Symbol Resolver
  - [ ] Deduplicate edges
  - [ ] Write to Postgres `structural_edges` table
  - [ ] Generate statistics + report
- [ ] Create Postgres table: `structural_edges`
  ```sql
  CREATE TABLE structural_edges (
    id SERIAL PRIMARY KEY,
    source_packet_key VARCHAR NOT NULL,
    target_packet_key VARCHAR NOT NULL,
    edge_type VARCHAR(20) NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    extraction_method VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_packet_key, target_packet_key, edge_type)
  );
  ```
- [ ] **npm script**: `atlas:gate3:extract:structural-edges:dry`

### Phase 3: Integration Tests (3 hours)

- [ ] Test Symbol Resolver on 100 real symbols
  - [ ] Verify 80%+ resolve to correct packet_key
  - [ ] Verify confidence ∈ [0, 1]
  - [ ] Verify fallback returns candidates
- [ ] Test Edge Extraction on 3 sample files
  - [ ] Verify CALLS edges found correctly
  - [ ] Verify IMPORTS edges found correctly
  - [ ] Verify TESTED_BY edges found correctly
- [ ] Test Neo4j Sync
  - [ ] Verify relationships created
  - [ ] Verify no broken references
  - [ ] Verify indices built
- [ ] **npm script**: `atlas:gate3:integration:test`

### Phase 4: Apply Extraction (2 hours)

- [ ] Run structural edge extraction on full codebase
  - [ ] `npm run atlas:gate3:extract:structural-edges:apply`
  - [ ] Monitor logs for errors
  - [ ] Collect final statistics
- [ ] Sync to Neo4j
  - [ ] `npm run atlas:gate3:sync:neo4j:apply`
  - [ ] Verify indices built
  - [ ] Query sample paths (CALLS → IMPORTS → SIMILAR_TO)

### Phase 5: Validation Gates (2 hours)

- [ ] **Gate 3.1**: Resolve 95%+ symbols to packet_keys
  - [ ] Query: `SELECT COUNT(*) FROM structural_edges WHERE confidence >= 0.60`
  - [ ] Target: >5000 resolved edges
- [ ] **Gate 3.2**: Extract 10K+ structural edges
  - [ ] Query: `SELECT COUNT(DISTINCT source_packet_key, target_packet_key, edge_type) FROM structural_edges`
  - [ ] Target: >10,000
- [ ] **Gate 3.3**: Neo4j contains both edge types
  - [ ] Query: `MATCH ()-[r:SIMILAR_TO]->() RETURN COUNT(r) as semantic_edges`
  - [ ] Query: `MATCH ()-[r:CALLS]->() RETURN COUNT(r) as calls_edges`
  - [ ] Verify both types present
- [ ] **Gate 3.4**: Graph traversal uses both signals
  - [ ] Test query: "Find all files that call this function, then find similar files"
  - [ ] Verify hybrid path works (CALLS → SIMILAR_TO)
- [ ] **npm script**: `atlas:gate3:validate:all`

---

## Success Criteria

✅ **Gate 3 passes when:**
1. Symbol resolution succeeds on 95%+ of symbols (confidence ≥ 0.60)
2. Structural edge extraction finds 10K+ edges (CALLS, IMPORTS, USES, TESTED_BY)
3. Neo4j graph contains both semantic (106K SIMILAR_TO) + structural (10K+) edges
4. Graph traversal queries work across edge types
5. No broken references (all source + target packets exist)

**Target**: Hybrid graph with ~116K total edges (semantic + structural).

---

## Blocking Dependencies

✅ **Gate 3 is independent**:
- Does NOT require Path A (autoencoder)
- Does NOT require Path B (multi-vector lanes)
- Does NOT require Gate 2 (confidence normalization)
  - Gate 3 normalizes edge confidence internally
- Does NOT require Gate 4 (Go API contract)

**Can execute immediately once user decides Path A or B.**

---

## Timeline

- **Symbol Resolver**: 4 hours (implement + test)
- **Edge Extraction**: 6 hours (extract + persist)
- **Integration Tests**: 3 hours
- **Apply + Validate**: 4 hours
- **Total**: ~15-17 hours (2 days)

**Target**: Complete by end of Session 121 (parallel with Gate 2).

---

## Reference

- **SYSTEM-ARCHITECTURE-BLUEPRINT.md** — Gate 3 spec
- **SESSION-120-PRODUCTION-ROADMAP.md** — Timeline
- **PRODUCTION-ARCHITECTURE-REFINED.md** — Layer 1 (Go Retrieval) uses hybrid graph

---

## Next Steps

1. **User decides**: Path A or Path B
2. **Execute in parallel**: Gate 2 (confidence norm) + Gate 3 (symbol resolver)
3. **Session 121**: Start both gates
4. **Session 122**: Complete both gates, begin Gate 4 (Go API contract)
5. **Session 123**: Complete Gate 4, begin Gate 5 (dispatcher routing)

---

**Status**: READY TO EXECUTE — Awaiting user decision on Path A vs B.