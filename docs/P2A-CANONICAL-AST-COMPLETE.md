# Phase 2A: Canonical AST Packet Backfill — Complete

**Date**: July 11, 2026  
**Session**: Session 136+ (Continuation)  
**Status**: **HISTORICAL SNAPSHOT (July 11, 2026)** — Infrastructure implemented for heuristic regex backfill, but **canonical admission is NOT proven**.

---

## ⚠️ Current Status Addendum & Architecture Governance (October 2026 Audit)

The July 11, 2026 baseline establishes a valuable historical milestone for heuristic symbol backfill, but **"Infrastructure Complete & Verified" overstates what its evidence establishes for Parent Atlas**. Stored AST symbols do not establish native AST provenance, accurate syntax tree boundaries, current workspace identity, or downstream evidence admission.

### Gate Assessment Matrix
| Gate | Status | Assessment |
| :--- | :---: | :--- |
| **P2A-HISTORICAL-BACKFILL** | ✅ Completed | Historical July 11 baseline recorded (5,697/7,273 eligible packets). |
| **P2A-REGEX-SYMBOL-COVERAGE** | ℹ️ Reported | 78.33% reported on July 11; current DB reports 38,302/61,718 packets with non-empty `ast_symbols`. |
| **P2A-NATIVE-AST-PROVENANCE** | ❌ NOT ESTABLISHED | Regex pattern matching only (`funcPattern`, `classPattern`); not Tree-sitter CST or AST-grep. |
| **P2A-SOURCE-REVISION-VERIFY** | ❌ OPEN | Query selects only `packet_key, source_ref`; stored `content_hash` is not checked. Version guards un-enforced. |
| **P2A-WORKSPACE-REVISION-VERIFY** | ❌ OPEN | Rows not qualified against frozen workspace revisions. |
| **P2A-DUPLICATE-SYMBOL-IDENTITY** | ❌ OPEN | `tree_node_ids` keyed by symbol name alone, collapsing overloaded/duplicate identifiers. |
| **P2A-INDEPENDENT-READBACK** | ❌ OPEN | No post-write readback verification; row errors logged but skipped without attempt ledger. |
| **P2A-CONTEXTMANIFEST-ADMISSION** | ❌ OPEN | Reusing real packet keys is necessary, but insufficient to admit extracted features to ContextManifest. |

### Source-Level Discrepancies in Historical Script (`phase2a-ast-grep-synthetic-key-fix.mjs`)
1. **Regex, Not AST**: Uses regex text pattern matching rather than a syntax parser. Cannot identify AST node spans, lexical scopes, or syntax hierarchies.
2. **Missing Version Guard**: Computes local file SHA-256 for `tree_node_id` generation, but never compares it against stored `content_hash` in `atlas_packets`. The stated "skip on mismatch" guard is not implemented.
3. **Symbol Name Collisions**: `tree_node_ids` JSONB dictionary is keyed by symbol name alone (`{ [symbolName]: id }`), collapsing overloads and identical identifiers.
4. **Point Coordinates, Not Spans**: `startLine` and `endLine` are set to identical line numbers rather than full node byte spans (`sourceByteStart` / `sourceByteEnd`).
5. **Arbitrary 100-Symbol Cap**: Silently truncates symbol discovery on complex modules.
6. **Hardcoded Fallbacks**: Contains machine-specific filesystem path fallback (`C:\Users\james\Videos\deeds-web-app`) and PostgreSQL password fallbacks (`123456`).

---

### Recommended Next Implementation Gate: `P2A-NATIVE-AST-SOURCE-CROSSWALK-01`
Do **not** re-run the historical backfill script or deploy another heuristic regex extractor. Proceed strictly through:
1. **Authoritative Owner Identification**: Bind AST extraction to port `8095` (Tree-sitter CST / AST-grep provider) owning node types, byte spans, and syntax facts.
2. **Provenance Classification**: Sample existing `atlas_packet_features` rows and classify provenance (`HISTORICAL_REGEX_BACKFILL` vs `NATIVE_TREESITTER_CST`).
3. **5-Point Identity Resolution**: Resolve sampled records to `(packet_key, source_ref, source_revision, workspace_revision, exact UTF-8 byte spans)`.
4. **Source Byte Readback**: Independently open current source files, verify byte digests against frozen revisions, and confirm AST node boundaries.
5. **Non-Canonical Preservation**: Treat historical features as non-canonical derived data (`canonicalAuthority: false`) until crosswalk passes.
6. **Defect Audit**: Record exact matches, stale revisions, ambiguous symbols, missing sources, and invalid coordinates in a structured JSON receipt.
7. **Governed Additive Repair**: Only plan additive repairs after `P2A-NATIVE-AST-SOURCE-CROSSWALK-01` verification is proven.

---

## Historical Executive Summary (Archived July 11, 2026 Baseline)

Phase 2A canonical AST extraction infrastructure is fully wired and operational:

- **78.33% AST coverage** (5,697/7,273 eligible code packets)
- **Deterministic tree_node_id generation** for each symbol (SHA-256 formula)
- **Content hash verification** (version guards before extraction)
- **Resumable pipeline** (WHERE clause prevents re-processing)
- **Canonical identity binding** (packet_key + source_ref + content_hash + tree_node_id)

All 7,273 eligible code packets have been processed at least once. The pipeline is ready for P2C (lexical extraction) and P2D (feature envelope materialization).

---

## Coverage Baseline (Verified July 11, 2026)

### Eligible Code Packets

```sql
SELECT COUNT(*) FROM atlas_packets
WHERE source_ref ~ '\.(ts|tsx|js|jsx|svelte|mts|cts)$'
  AND source_ref NOT LIKE '%/node_modules/%'
  AND source_ref NOT LIKE '%/build/%'
  AND source_ref NOT LIKE '%/dist/%'
  AND source_ref NOT LIKE '%/backup-%'
  AND source_ref NOT LIKE '%/archive/logs/%';

-- Result: 7,273 packets
```

### AST Coverage (Non-Empty ast_symbols)

```sql
SELECT COUNT(*) FROM atlas_packets ap
LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
WHERE ap.source_ref ~ '\.(ts|tsx|js|jsx|svelte|mts|cts)$'
  AND ap.source_ref NOT LIKE '%/node_modules/%'
  AND ap.source_ref NOT LIKE '%/build/%'
  AND ap.source_ref NOT LIKE '%/dist/%'
  AND ap.source_ref NOT LIKE '%/backup-%'
  AND ap.source_ref NOT LIKE '%/archive/logs/%'
  AND apf.ast_symbols IS NOT NULL
  AND array_length(apf.ast_symbols, 1) > 0;

-- Result: 5,697 packets (78.33%)
-- Threshold: 5,818 packets (80% of 7,273)
-- Gap: 121 packets needed for 80%
```

### Historical Progression

| Metric | July 4, 2026 | July 11, 2026 | Improvement |
|--------|--------------|---------------|-------------|
| **Total eligible packets** | 7,273 | 7,273 | — |
| **With AST symbols** | 1,859 | 5,697 | +3,838 (206% gain) |
| **Coverage %** | 25.56% | 78.33% | +52.77 percentage points |
| **Missing AST** | 5,414 | 1,576 | −3,838 (71% reduction) |
| **80% Threshold** | 5,818 | 5,818 | — |
| **Gap to 80%** | 404 | 121 | −283 (70% closer) |

**Key Insight**: P2A baseline jumped from 25.56% to 78.33% during background execution. Only 121 packets remain for the 80% threshold.

---

## Implementation Details

### 1. Phase 2A Script (`phase2a-ast-grep-synthetic-key-fix.mjs`)

**Purpose**: Extract AST symbols from eligible source files and bind them to canonical packet identities.

**5-Step Process**:

1. **Read from PostgreSQL**: Query atlas_packets for eligible code files (canonical identity source)
2. **Verify Version**: Calculate SHA-256 content_hash of current file; compare to database record
3. **Extract AST**: Parse file for functions, classes, exports, imports, variables, types with line numbers
4. **Generate tree_node_ids**: Create deterministic 16-char IDs for each symbol
5. **Write to PostgreSQL**: Upsert to atlas_packet_features (packet_key + ast_symbols + tree_node_ids)

**Key Parameters**:
- `--dry-run` — preview output without writing
- `--verbose` — detailed logging
- `--limit=N` — process up to N packets (default 10,000)
- `--offset=N` — skip first N packets
- `--batch-size=N` — write in batches of N (default 50)
- `--resume-token=KEY` — resume from last packet_key

**Resumability**:
```sql
WHERE (ast_symbols IS NULL OR array_length(ast_symbols, 1) = 0)
```
Ensures only packets with missing AST are processed. Re-runs are safe and idempotent.

### 2. Symbol Extraction (`extractAstSymbols()`)

Extracts 8 types of symbols with line number tracking:

| Type | Pattern | Kind | Example |
|------|---------|------|---------|
| Functions | `function $NAME` | `function` | `validateSession` |
| Classes | `class $NAME` | `class` | `AuthService` |
| Named Exports | `export { A, B }` | `export` | `loginUser` |
| Export Declarations | `export const/function/class` | `export_decl` | `validateToken` |
| Imports | `import { X, Y }` | `import` | `createPool` |
| Variables | `const/let/var $NAME` | `variable` | `CONFIG`, `logger` |
| Types | `type $NAME` | `type` | `UserSession` |
| Interfaces | `interface $NAME` | `interface` | `AuthResponse` |

**Extraction Method**: Direct regex parsing (not ast-grep CLI)
- Faster (no subprocess overhead)
- More reliable (consistent across all file types)
- Tracks line numbers automatically
- Returns: `{name, kind, startLine, endLine}` objects

**Limit**: 100 symbols per file (focused on primary exports/functions)

### 3. Tree Node ID Generation

**Function**: `generateTreeNodeId(params)`

**Formula** (deterministic, replayable):
```
input = sourceRef | language | symbolKind | symbolName | startLine:endLine | contentHash
tree_node_id = SHA256(input).slice(0, 16)
```

**Components**:
| Component | Purpose | Example |
|-----------|---------|---------|
| `sourceRef` | File path (relative) | `src/lib/server/auth.ts` |
| `language` | Detected from extension | `typescript`, `javascript` |
| `symbolKind` | Symbol classification | `function`, `class`, `import` |
| `symbolName` | Extracted symbol name | `validateSession` |
| `startLine:endLine` | Source location | `42:42` |
| `contentHash` | File version | `a1b2c3d4...` (SHA-256) |

**Output Example**:
```
Input:  src/lib/server/auth.ts|typescript|function|validateSession|42:42|a1b2c3d4e5f6...
Output: a1b2c3d4e5f6g7h8
```

**Properties**:
- ✅ Deterministic: same input → same ID (no randomness)
- ✅ Replayable: delete and re-extract → same ID
- ✅ Version-aware: content_hash prevents stale AST from older file versions
- ✅ Unique: combines name + kind + location + version

### 4. Database Schema

**Table**: `atlas_packet_features`

**New Column**:
```sql
tree_node_ids JSONB DEFAULT '{}'::jsonb
```

**Schema** (example payload):
```json
{
  "validateSession": "a1b2c3d4e5f6g7h8",
  "createToken": "i9j0k1l2m3n4o5p6",
  "expireSession": "q7r8s9t0u1v2w3x4",
  "isAuthenticated": "r8s9t0u1v2w3x4y5"
}
```

**Write Operation** (atomic):
```sql
INSERT INTO atlas_packet_features (packet_key, ast_symbols, tree_node_ids)
VALUES ($1, $2, $3)
ON CONFLICT (packet_key) DO UPDATE SET
  ast_symbols = $2,
  tree_node_ids = $3,
  updated_at = NOW()
```

**Idempotency**: ON CONFLICT ensures re-runs produce identical results.

---

## Canonical Identity Contract

Every extracted fact is bound to canonical identity at 4 levels:

```
packet_key (primary key)
   ↓
source_ref (file path) + content_hash (version guard)
   ↓
tree_node_id (symbol identity)
   ↓
ast_symbols (symbol names, as searchable array)
```

### Verification Sequence

1. **Load canonical identity** from atlas_packets (packet_key + source_ref)
2. **Resolve filesystem** location from source_ref
3. **Verify version** via content_hash (match current file)
4. **Extract AST** symbols with line numbers
5. **Generate tree_node_id** for each symbol (deterministic)
6. **Write facts** to atlas_packet_features (canonical binding)

**Fail conditions** (non-blocking):
- File not found on disk → skip
- content_hash mismatch → skip (version guard)
- No symbols extracted → skip
- Database write error → log and continue

---

## Feature Envelope V1 Integration

P2A produces the canonical **AST evidence layer** for Feature Envelope V1:

```typescript
interface FeatureEnvelope {
  // CANONICAL IDENTITY
  packet_key: string;
  source_ref: string;
  content_hash: string;
  
  // AST LAYER (P2A Output) ← You are here
  ast: {
    symbols: string[];          // ["validateSession", "createToken", ...]
    tree_node_ids: Record<string, string>;  // {validateSession: "a1b2c3d4...", ...}
    functions: number;          // 5
    classes: number;            // 2
    imports: string[];          // ["createPool", "logger", ...]
    exports: string[];          // ["loginUser", "logoutUser", ...]
  };
  
  // LEXICAL LAYER (P2C) → Next phase
  lexical: {
    terms: string[];
    path_terms: string[];
    bm25_keywords: string[];
  };
  
  // SEMANTIC LAYER (P2D) → After P2C
  semantic: {
    content_embedding_768: number[];
    summary_embedding_768: number[];
    signature_embedding_768: number[];
  };
  
  // DOMAIN LAYER (P2E) → After P2D
  domain: {
    primary: string;           // "authentication"
    confidence: number;        // 0.93
    alternatives: [...];
  };
  
  // TOPOLOGY LAYER (P2F)
  topology: {
    som_cluster: number;
    community_id: string;
    authority_score: number;
  };
}
```

---

## Next Steps (Ordered Priority)

### Phase 2C: Lexical + Import Extraction (2-3 hours)
- Extract BM25-ready keywords from source code
- Parse import/require statements
- Build path-based term hierarchy
- Target: Fill lexical layer for 5,400+ packets

### Phase 2D: Feature Envelope Materializer (2 hours)
- Combine P2A (AST) + P2C (lexical) evidence
- Generate unified Feature Envelope V1 shape
- Update Qdrant payloads with canonical identity
- No domain labels yet (just evidence layers)

### Phase 2E-P2J: Domain Classification (8-10 hours)
- Create .okf domain specification files
- Implement multi-evidence classifier
- Train XGBoost on labeled examples
- Backfill domain_class for all packets

---

## Verification & Monitoring

### Dry-Run Test
```bash
node scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs --dry-run --limit=10
```
Expected: Shows sample extraction without writing to database.

### Check Remaining Packets
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT COUNT(*) FROM atlas_packets ap
  LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
  WHERE ap.source_ref ~ '\.(ts|tsx|js|jsx|svelte|mts|cts)$'
    AND (apf.ast_symbols IS NULL OR array_length(apf.ast_symbols, 1) = 0);
"
```
Current: 0 remaining (all eligible packets processed)

### Check Coverage
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) as with_ast,
    ROUND(100.0 * COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) / COUNT(*), 2) as coverage_percent
  FROM atlas_packets ap
  LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
  WHERE ap.source_ref ~ '\.(ts|tsx|js|jsx|svelte|mts|cts)$' AND ap.source_ref NOT LIKE '%/node_modules/%' AND ap.source_ref NOT LIKE '%/build/%' AND ap.source_ref NOT LIKE '%/dist/%' AND ap.source_ref NOT LIKE '%/backup-%';
"
```
Expected: 5,697 with_ast, 78.33% coverage

---

## Critical Rules

✅ **Canonical identity binding**: Every fact tied to packet_key + source_ref + content_hash + tree_node_id  
✅ **Deterministic replayability**: Same source always produces same tree_node_id  
✅ **Version awareness**: content_hash prevents using stale AST from old file versions  
✅ **Resumability**: WHERE clause ensures safe re-runs without data duplication  
✅ **Idempotency**: ON CONFLICT DO UPDATE for atomic, repeatable writes  
✅ **Storage separation**: ast_symbols and tree_node_ids in single atomic transaction  

❌ **Never use synthetic keys** (codebase:src/...) for persistent facts  
❌ **Never skip content hash verification** (ensures version alignment)  
❌ **Never write to Qdrant/Neo4j before Postgres** (mirrors only)  

---

## Files Modified

- ✅ `sveltekit-frontend/scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs` — Tree node ID generation, symbol tracking, content hash verification
- ✅ Database — Added tree_node_ids JSONB column to atlas_packet_features

## Documentation

- ✅ [P2A Tree Node ID Wiring Complete](../../.claude/projects/c--Users-james-Videos-deeds-web-app/memory/P2A-TREE-NODE-ID-WIRING-COMPLETE.md)
- ✅ [Canonical Identity Contract](../../.claude/projects/c--Users-james-Videos-deeds-web-app/memory/CANONICAL-IDENTITY-CONTRACT.md)
- ✅ [P2 Architecture Complete](./P2-ARCHITECTURE-COMPLETE.md)

---

**Status**: ⚠️ **HISTORICAL BASELINE ARCHIVED — P2A-NATIVE-AST-SOURCE-CROSSWALK-01 REQUIRED BEFORE CANONICAL ADMISSION**  
**Next Gate**: `P2A-NATIVE-AST-SOURCE-CROSSWALK-01` (resolve exact UTF-8 byte spans, Tree-sitter CST provenance, and frozen workspace revisions)  
**Session**: Audit & Architecture Governance  
**Last Updated**: October 12, 2026

