# OpenWiki Knowledge Format (OKF) Implementation Guide

**Version:** 1.0.0  
**Last Updated:** July 29, 2026  
**Reference:** `docs/.okf/schema.yaml`

## Overview

This guide aligns the deeds-web-app codebase with Google's **OpenWiki Knowledge Format (OKF)** — a machine-readable specification for structured knowledge bases covering:

- **Code Intelligence:** AST extraction, domain classification, concept detection
- **Architectural Hints:** Directory-level cards, feature responsibility mapping
- **Audit Gates:** Validation checkpoints (G1-G47+) for quality assurance
- **Semantic Embeddings:** canonical EmbeddingGemma `semantic_768`, with derived MRL prefix views (`512/256/128`) and a separate nested latent family (`latent_256/128/64`); `384` is legacy only

## Architecture

### Three-Layer Storage Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ L1: Redis (Hot Cache) — 24h TTL                                │
│   - okf:directory:{path} → DirectoryCard JSON                  │
│   - okf:directory:index (hash) → fast lookup                   │
│   - corpus:centroids (hash) → domain centroid vectors          │
│   - corpus:concepts (hash) → feature:domain → OKFOntologyEntry │
└──────────────────────────────────────────────────────────────────┘
                            ↓ Cache Miss
┌──────────────────────────────────────────────────────────────────┐
│ L2: CouchDB (Durable Wiki) — persistent                         │
│   - karpathy_wiki database                                      │
│   - Views: by_feature_key, by_domain                            │
│   - Historical versions (audit trail)                           │
└──────────────────────────────────────────────────────────────────┘
                            ↓ Fallback
┌──────────────────────────────────────────────────────────────────┐
│ L3: Postgres (Canonical Truth) — atomic transactions            │
│   - atlas_packets table (OKFEntry with JSONB spec + topology) │
│   - directory_scope JSONB for directory-level data              │
│   - Full audit trail + validation gate history                 │
└──────────────────────────────────────────────────────────────────┘
```

### Key Data Structures

**OKF Entry (Postgres atlas_packets)**
```typescript
{
  id: UUID,
  version: "1.0.0",
  kind: "Directory" | "Feature" | "Domain" | "Concept" | "Responsibility",
  metadata: { created_at, updated_at, source, confidence, tags },
  spec: {
    domain: "AUTH" | "DATA" | "API" | "UI" | "SHARED",
    responsibility: "What this entity does",
    concepts: [{ name, pattern, domain, priority, confidence }],
    related_entities: [{ id, relation }],
    topology: { x, y, z, w },
    embedding: { model, dimension, vector? },
    audit: { status, gates, last_validated, violations }
  },
  directory_scope?: { path, summary, feature_keys, activity_score, recommendations }
}
```

**OKF Ontology Entry (Redis corpus:concepts)**
```typescript
{
  feature: "validateSession" | "dbQuery" | "apiRoute",
  domain: "AUTH" | "DATA" | "API" | "UI",
  responsibility: "Handles user session validation",
  concepts: ["authentication_check", "async_coordination"],
  relatedFeatures: ["lucia.validateSession", "getSession"],
  confidence: 0.85
}
```

**Domain Centroid (Redis corpus:centroids)**
```typescript
{
  AUTH: [0.12, 0.45, -0.33, ...], // revision-qualified semantic_768-derived centroid
  DATA: [0.08, 0.22, 0.61, ...],
  API: [0.41, 0.19, -0.28, ...],
  UI: [-0.15, 0.52, 0.33, ...]
}
```

## Code Intel Service Integration

The `code-intel-service.ts` now:

1. **Extracts Concepts** via AST-grep patterns (8 concept types)
2. **Chunks Semantically** via TreeChunker (functions, classes, types)
3. **Indexes Ontology** via OKF KV pairs (feature:domain → responsibility)
4. **Classifies Domains** using semantic + lexical ensemble (0.3·keyword + 0.7·embedding)
5. **Assigns 4D Coordinates** (temporal, structural, semantic, authority)
6. **Generates Embeddings** via EmbeddingGemma (`semantic_768`), then derives optional MRL prefix views (`512/256/128`) and nested latent views (`latent_256/128/64`) under their own revisions
7. **Materializes to Stores** (Postgres truth, Qdrant search, Redis cache)

**Pipeline Output:**

```json
{
  "indexed": 285,      // files processed
  "errors": 3,         // processing errors
  "facts": 1847,       // AST nodes extracted
  "nodes": 1847,       // CodeIntelNode objects created
  "concepts": 4290,    // concept patterns matched
  "ontology_entries": 892  // OKF KV pairs indexed
}
```

## OKF Context Source Integration

The `agents-context-source.ts` now implements:

### Public API (OKF-aligned)

```typescript
// Fetch OKF entries for file paths (Redis L1 → CouchDB L2 → Postgres L3)
getOKFEntriesForPaths(paths: string[]): Promise<OKFDirectoryCard[]>

// Fetch ontology concepts by feature key (Redis corpus:concepts hash)
getOKFConceptsByFeature(featureKey: string): Promise<Record<string, any>[]>

// Fetch domain centroids (Redis corpus:centroids hash)
getOKFDomainCentroids(): Promise<Record<'AUTH' | 'DATA' | 'API' | 'UI', number[]>>

// Format OKF entries for LLM context (includes validation gates + domains)
formatOKFContext(entries: OKFDirectoryCard[]): string
```

### Backward Compatibility

All legacy functions still work (aliases to OKF methods):
- `getCardsForPaths()` → `getOKFEntriesForPaths()`
- `getCardsByFeature()` → `getOKFConceptsByFeature()` (with CouchDB fallback)
- `formatCardsContext()` → `formatOKFContext()`

## Concept Patterns (OKF-defined)

Eight concept types extracted via AST-grep:

| Concept | Patterns | Domain | Priority |
|---------|----------|--------|----------|
| `authentication_check` | lucia.validateSession, getSession, requireAuth | AUTH | 8 |
| `database_query` | db.select, db.insert, query(), execute() | DATA | 8 |
| `api_route_handler` | +server.ts, export async function GET/POST | API | 7 |
| `component_render` | export default, $state, $derived, svelte:self | UI | 7 |
| `error_handling` | try {}, catch (), throw, Promise.reject | SHARED | 5 |
| `async_coordination` | async function, await, Promise.all, Promise.race | SHARED | 6 |
| `type_validation` | z.object, z.string, z.number, validate(), parse() | SHARED | 4 |
| `import_dependency` | import {, from ", require( | SHARED | 3 |

## Validation Gates (G1-G47+)

Each OKF entry tracks validation status via `audit.gates`:

| Gate | Name | Severity | Status |
|------|------|----------|--------|
| G1 | Static ESM imports | ERROR | Check entry is imported by consumers |
| G2 | Dynamic ESM imports | WARNING | Verify dynamic import() usage |
| G3 | Domain confidence | WARNING | Ensure confidence >= 0.5 |
| G4 | Concept coverage | INFO | At least one concept pattern |
| G5 | Embedding dimension | ERROR | Verify dimension in [512, 768, 384, 64] |
| G6 | Topology coordinates | WARNING | 4D coords within expected ranges |
| G7 | Audit trail completeness | INFO | audit.status + last_validated set |

Status levels:
- ✅ **PASS** — Gate satisfied
- ⚠️ **WARN** — Potential issue, non-blocking
- ❌ **FAIL** — Gate violation, blocks promotion

## Usage Examples

### Fetch Directory Authority for ACE Context

```typescript
import { getOKFEntriesForPaths, formatOKFContext } from '$lib/server/agents/agents-context-source';

// Get OKF entries for current search files
const entries = await getOKFEntriesForPaths([
  'src/lib/server/auth.ts',
  'src/lib/server/db/queries.ts',
  'src/routes/api/users/+server.ts'
]);

// Format as LLM context
const context = formatOKFContext(entries);
// Includes: directory summaries, domain classifications, validation gates, recommendations
```

### Retrieve Domain Centroids for Semantic Similarity

```typescript
import { getOKFDomainCentroids } from '$lib/server/agents/agents-context-source';

// Fetch revision-qualified semantic_768-derived centroids
const centroids = await getOKFDomainCentroids();

// Use for semantic similarity scoring
const authCentroid = centroids.AUTH; // canonical 768-dim-derived vector
const similarity = cosineSimilarity(queryEmbedding, authCentroid);
```

### Query Feature Responsibility via OKF Ontology

```typescript
import { getOKFConceptsByFeature } from '$lib/server/agents/agents-context-source';

// Fetch concepts for a feature
const concepts = await getOKFConceptsByFeature('validateSession');

// Result:
// [
//   {
//     key: 'validateSession:AUTH',
//     feature: 'validateSession',
//     domain: 'AUTH',
//     responsibility: 'Handles Lucia session validation',
//     concepts: ['authentication_check', 'async_coordination'],
//     confidence: 0.85
//   }
// ]
```

## Rebuild Corpus (npm script)

The corpus derivation pipeline is orchestrated by `npm run corpus:rebuild`:

```bash
# Full rebuild (all files)
npm run corpus:rebuild

# With verbose output
npm run corpus:rebuild -- --verbose

# Dry-run (no writes to Qdrant/Redis)
npm run corpus:rebuild -- --dry-run

# Limit to first N files (for testing)
npm run corpus:rebuild -- --limit 50
```

Output:
```
[code-intel] Found 285 TS/JS files, starting enhanced corpus derivation...
[code-intel] Embedding 1847 nodes via EmbeddingGemma (semantic_768)...
[code-intel] Ingesting 1847 nodes into Qdrant codebase_chunks_768 (768-dim semantic authority)...
[code-intel] Deriving optional MRL prefix views (512/256/128) and nested latent views (256/128/64)...
[code-intel] Computing revision-qualified domain centroids from semantic_768...
[code-intel] Materializing 892 ontology entries to Redis...
[code-intel] Corpus rebuild complete in 45218ms: 285 files, 1847 facts, 1847 nodes, 4290 concepts, 892 ontology entries, 3 errors

Result: { indexed: 285, errors: 3, facts: 1847, nodes: 1847, concepts: 4290 }
```

## Dimension Hierarchy (Hard Rule)

The OKF spec enforces a strict embedding dimension hierarchy:

| Dimension | Model | Use Case | Fallback |
|-----------|-------|----------|----------|
| **768-dim** | EmbeddingGemma native | **CANONICAL** semantic search and source-qualified domain classification | → MRL 512/256/128; nested latent 256 |
| **512/256/128-dim** | EmbeddingGemma MRL prefix + L2 renormalization | Derived evaluation/routing views; never a new identity or fusion vote | → semantic_768 |
| **latent_256** | Nested semantic autoencoder | Physical learned bottleneck; reference-only until its owner gate promotes it | → latent_128/64 |
| **latent_128/64** | Nested prefix views | Derived topology/routing views; not interchangeable with MRL 128/256 | N/A |
| **384-dim** | Legacy compatibility | Historical replay only; no new writer | N/A |

**Hard stops:**
- ❌ Never mix 512d + 768d in same operation
- ❌ Never use 64d for ANN search
- ✅ Always validate embedding.dimension in OKF spec

## Monitoring & Observability

### Redis Metrics

```bash
# Domain centroids warmed?
docker exec legal-ai-valkey valkey-cli HGETALL corpus:centroids | wc -l
# Expected: 4 (AUTH, DATA, API, UI)

# Ontology entries indexed?
docker exec legal-ai-valkey valkey-cli HLEN corpus:concepts
# Expected: ~800-1000 (depends on corpus size)

# Directory cache warm?
docker exec legal-ai-valkey valkey-cli HLEN okf:directory:index
# Expected: increasing over time as directories are accessed
```

### Postgres Audit Trail

```sql
-- Query OKF entries with audit status
SELECT id, kind, spec->>'domain', spec->'audit'->>'status'
FROM atlas_packets
WHERE kind IN ('Directory', 'Feature')
ORDER BY (spec->'metadata'->>'created_at') DESC
LIMIT 20;

-- Count by validation status
SELECT spec->'audit'->>'status' AS status, COUNT(*) AS count
FROM atlas_packets
GROUP BY spec->'audit'->>'status';
```

## Troubleshooting

### Problem: Domain centroids not found in Redis

**Check:** `corpus:centroids` hash is populated
```bash
docker exec legal-ai-valkey valkey-cli HGETALL corpus:centroids
```

**Solution:** Run corpus rebuild
```bash
npm run corpus:rebuild
```

### Problem: OKF directory entries returning empty

**Check:** Multi-layer fallback: Redis → CouchDB → Postgres
```typescript
// Add logging to agents-context-source.ts
console.log('[okf-context] L1 (Redis) miss:', dirPath);
// Then check CouchDB
```

**Solution:** Warm cache from Postgres
```typescript
const entries = await getOKFEntriesForPaths([...]);
// Next time: Redis cache hit
```

### Problem: Concept extraction confidence too low

**Check:** OKF pattern matching in code-intel-service
```bash
npm run corpus:rebuild -- --verbose | grep "concept:"
```

**Solution:** Adjust pattern priority or add custom patterns to `schema.yaml`

## Migration from Legacy Format

To migrate legacy `AgentsDirectoryCard` → OKF:

```typescript
// Old format
const legacyCard: AgentsDirectoryCard = {
  dirPath: 'src/lib/server/auth',
  summary: 'Authentication service',
  featureKeys: ['lucia_session_handler'],
  gates: { G1: true, G3: true },
  auditStatus: 'WIRED'
};

// New OKF format (via formatOKFContext)
const okfCard: OKFDirectoryCard = {
  ...legacyCard,
  okf_entry_id: 'uuid-here',
  okf_version: '1.0.0',
  spec: {
    domain: 'AUTH',
    responsibility: 'Authentication service',
    concepts: [{ name: 'authentication_check', pattern: 'lucia...', domain: 'AUTH', priority: 8, confidence: 0.92 }],
    // ... (auto-populated from corpus rebuild)
  }
};
```

All legacy functions transparently handle both formats via backward-compatibility aliases.

## References

- **Schema:** `docs/.okf/schema.yaml`
- **Code Intel Service:** `sveltekit-frontend/src/lib/server/ai/code-intel-service.ts`
- **OKF Context Source:** `sveltekit-frontend/src/lib/server/agents/agents-context-source.ts`
- **Concept Patterns:** `schema.yaml` → `concept_patterns` section
- **Validation Gates:** `schema.yaml` → `validation_gates` section
- **Storage Mapping:** `schema.yaml` → `storage_mapping` section

---

**Last Updated:** July 29, 2026  
**Maintainer:** Claude Code (Anthropic)
