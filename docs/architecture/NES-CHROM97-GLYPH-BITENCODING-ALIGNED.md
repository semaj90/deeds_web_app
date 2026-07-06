# NES/CHROM97/Glyph BitEncoding Architecture — Phase 110+

**Status**: Design-ready for Phase 110+  
**Goal**: Unified memory hierarchy for feature extraction → latent encoding → glyph bitpacking → CHROM97 visualization  
**Layers**: 5 (Canonical → Features → Latents → Glyphs → CHROM97)

---

## Layer 1: Canonical Envelope (Identity + Metadata)

```typescript
// Postgres JSONB + bytea (always truth)
export interface CanonicalEnvelope {
  // Identity (immutable, keyset join)
  packet_key: string;              // "ace:packet:auth:001"
  source_ref: string;              // "src/lib/server/auth.ts"
  feature_id: string;              // "auth.sessions"
  directory_path: string;          // "src/lib/server"
  
  // Metadata (filterable, scalar)
  created_at: number;              // Unix ms
  updated_at: number;              // Unix ms
  token_count: number;             // 0–65535 (uint16)
  confidence: number;              // 0–255 (uint8, scaled)
  coverage_percent: number;        // 0–100 (uint8)
  
  // Tagging (searchable, string array)
  tags: string[];                  // ["auth", "session", "lucia"]
  domain_class: string;            // "auth" | "retrieval" | "inference"
  
  // Topology (optional, set by batch processors)
  topology_cluster?: string;       // "cluster:42" (SOM output)
  community_id?: string;           // "community:7" (Louvain output)
  pagerank?: number;               // 0.0–10.0 (Neo4j GDS)
  graph_degree?: number;           // 0–N (edge count)
  
  // Encoded pointers (link to external storage, not inline)
  content_embedding_id?: string;   // Points to pgvector row
  latent64_id?: string;            // Points to bytea blob
  latent128_id?: string;           // Points to bytea blob
  glyph_bitpack_id?: string;       // Points to ndjson glyph record
}
```

**Storage**:
```sql
-- Postgres JSONB: all scalar fields filterable
CREATE TABLE atlas_packets (
  packet_key TEXT PRIMARY KEY,
  source_ref TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  -- ... other columns ...
  envelope JSONB,                  -- Canonical envelope above
  content_embedding vector(384),   -- pgvector, searchable
  latent64_blob bytea,             -- uint8 quantized, NOT searchable
  latent128_blob bytea,            -- float16 compressed, NOT searchable
  glyph_record_id TEXT             -- FK to glyph_records.id
);

-- Speed: scalar filters (created_at, token_count, confidence) hit B-tree index O(log N)
-- Vector filters (content_embedding) hit HNSW index O(log N) for cosine
-- Latent vectors NOT indexed (too expensive to search; only used for precomputed SOM)
```

---

## Layer 2: Feature Extraction (Auto-Populated Fields)

**What auto-populates** (code analysis, no learned model):

```typescript
export interface ExtractedFeatures {
  // AST features (ast-grep, tree-sitter)
  ast_symbols: string[];                // ["validateSession", "Session", "lucia"]
  ast_kinds: string[];                  // ["function", "class", "import"]
  imports: string[];                    // ["lucia", "sveltekit"]
  exports: string[];                    // ["validateSession", "createSession"]
  
  // Lexical features (keyword extraction, LangExtract)
  lexical_features: string[];           // ["auth", "session", "validate", "lucia"]
  entity_types: string[];               // ["import", "export", "define"]
  
  // Domain features (pattern matching, regex + LangExtract)
  domain_patterns: {
    error_handling?: boolean;           // Contains error/throw/catch
    authentication?: boolean;           // Auth keywords
    persistence?: boolean;              // DB/store keywords
    network?: boolean;                  // API/fetch keywords
  };
  
  // Structural features (AST depth, complexity)
  nesting_depth: number;                // Max depth in AST
  function_count: number;               // How many functions defined
  complexity_score: number;            // Cyclomatic complexity estimate
}
```

**Pipeline** (session 110+):

```bash
# Phase 2A: ast-grep extraction (WIP, 516 symbols so far)
npm run atlas:phase2a:ast-grep-fix:apply

# Phase 2B: Lexical + topology (ready to implement)
npm run atlas:phase2b:lexical-kmeans:apply

# Phase 2C/2D: Entity extraction + remaining features
npm run atlas:phase2c:entity-extraction:apply
npm run atlas:phase2d:remaining-extractors:apply
```

**Storage**:
```sql
-- Postgres: extracted features as arrays (filterable via GIN index)
CREATE TABLE atlas_packet_features (
  packet_key TEXT PRIMARY KEY,
  ast_symbols TEXT[],               -- Array of strings, GIN indexed
  ast_kinds TEXT[],
  imports TEXT[],
  exports TEXT[],
  lexical_features TEXT[],
  entity_types TEXT[],
  domain_patterns JSONB,            -- {"error_handling": true, ...}
  nesting_depth SMALLINT,           -- 0–255 (uint8)
  function_count SMALLINT,
  complexity_score NUMERIC(5,2)
);
```

---

## Layer 3: Latent Encoding (Learned Compression)

**What happens offline** (batch, no per-request compute):

```
1. content_embedding (384-dim float32, from embeddinggemma)
2. Sparse AutoEncoder: 384 → 128 (bottleneck)
3. Quantize + store: latent128 (float16, 256 bytes per packet)
4. Project + quantize: latent64 (uint8, 64 bytes per packet)
5. SOM/KMeans: latent64 → topology_cluster (uint16 cluster ID)
```

**Why 3 representations?**

| Representation | Size | Speed | Use | Storage |
|---|---|---|---|---|
| **content_embedding** | 384 × 4B = 1.5KB | 100ms (Qdrant HNSW) | Semantic search, ranked ANN | pgvector (indexed) |
| **latent128** | 128 × 2B = 256B | 500ms (BERT rerank, offline) | Rich features for HMM/reranking | bytea blob |
| **latent64** | 64 × 1B = 64B | <5ms (TurboVec ANN) | Fast topology probe, SOM input | bytea blob |

**Architecture**:

```python
# Offline: compute once, store forever
class LatentAutoencoder:
    def __init__(self):
        self.encoder_768_to_128 = nn.Sequential(
            nn.Linear(384, 256),
            nn.ReLU(),
            nn.Linear(256, 128)
        )
        self.projector_128_to_64 = nn.Sequential(
            nn.Linear(128, 64),
            nn.Tanh()  # Output in [-1, 1] for quantization
        )
    
    def encode(self, embedding_384: torch.Tensor) -> tuple:
        latent128 = self.encoder_768_to_128(embedding_384)
        latent64 = self.projector_128_to_64(latent128)
        
        # Quantize for storage
        latent128_fp16 = latent128.half()                     # float16
        latent64_uint8 = ((latent64 + 1) / 2 * 255).uint8()   # 0–255
        
        return latent128_fp16, latent64_uint8

# Online: unpack from bytea only when needed
def unpack_latent64_for_som(blob: bytes) -> np.ndarray:
    """uint8 → float in [0, 1]"""
    arr = np.frombuffer(blob, dtype=np.uint8)
    return arr.astype(np.float32) / 255.0
```

**Storage**:

```sql
-- Postgres: latent blobs stored as bytea (no index needed)
ALTER TABLE atlas_packets ADD COLUMN (
  latent128_blob bytea,    -- 256 bytes/packet, float16
  latent64_blob bytea      -- 64 bytes/packet, uint8 quantized
);

-- Optional: separate table for immutability
CREATE TABLE atlas_latent_vectors (
  packet_key TEXT PRIMARY KEY,
  latent128 bytea NOT NULL,
  latent64 bytea NOT NULL,
  encoder_version TEXT NOT NULL,  -- "ae_20260710"
  created_at TIMESTAMP NOT NULL
);
```

---

## Layer 4: Glyph Bitpacking (CHROM97 Tiles)

**What is a Glyph?**

A glyph is a **compact, searchable card** representing one packet. Think Nintendo CHR-ROM (character graphics): instead of storing full sprites, store minimal bit patterns that describe them.

```typescript
export interface GlyphRecord {
  id: string;                          // Unique ID
  packet_key: string;                  // Link to canonical
  
  // Identity snippet (1 line)
  title: string;                       // "validateSession()"
  label: string;                       // "auth.ts:42"
  
  // Bitpacked summary (compressed via CHROM97)
  bitpack: string;                     // "0x[hex bitstring]" or base64
  bitpack_format: 'chrom97' | 'ndjson'; // Encoding method
  bitpack_fields: {
    is_exported: 0 | 1;                // uint1
    is_async: 0 | 1;                   // uint1
    complexity: number;                // 0–7 (uint3)
    domain_class: number;              // 0–15 (uint4, enum index)
    latent_cluster: number;            // 0–255 (uint8, SOM ID)
    authority: number;                 // 0–255 (uint8, scaled pagerank)
    confidence: number;                // 0–255 (uint8)
    freshness_days: number;            // 0–255 (uint8, clamped)
  };
  
  // Searchable tags
  tags: string[];                      // ["auth", "session", "lucia"]
  semantic_tags: string[];             // Derived from latent128
  
  // Provenance
  created_at: number;
  latent64_id: string;                 // Link to blob
  glyph_version: string;               // "glyph_v2_20260710"
}
```

**Bitpacking Format (CHROM97 style)**:

```
Total: 64 bits (8 bytes, can fit in uint64)

Bit layout (MSB first):
  Bit 0:      is_exported (1)
  Bit 1:      is_async (1)
  Bits 2–4:   complexity (3)          → 0–7
  Bits 5–8:   domain_class (4)        → 0–15 (auth=0, retrieval=1, inference=2, ...)
  Bits 9–16:  latent_cluster (8)      → 0–255 (SOM cluster ID)
  Bits 17–24: authority (8)           → 0–255 (pagerank * 25.5, clamped)
  Bits 25–32: confidence (8)          → 0–255 (confidence * 255)
  Bits 33–40: freshness_days (8)      → 0–255 (log-scaled age in days)
  Bits 41–63: reserved (23)           → for future use
```

**TypeScript bitpacking**:

```typescript
function packGlyphBits(fields: GlyphBitpackFields): bigint {
  let bits = 0n;
  bits |= (BigInt(fields.is_exported & 1) << 0n);
  bits |= (BigInt(fields.is_async & 1) << 1n);
  bits |= (BigInt(fields.complexity & 7n) << 2n);
  bits |= (BigInt(fields.domain_class & 15n) << 5n);
  bits |= (BigInt(fields.latent_cluster & 255n) << 9n);
  bits |= (BigInt(fields.authority & 255n) << 17n);
  bits |= (BigInt(fields.confidence & 255n) << 25n);
  bits |= (BigInt(fields.freshness_days & 255n) << 33n);
  return bits;
}

function unpackGlyphBits(bits: bigint): GlyphBitpackFields {
  return {
    is_exported: Number((bits >> 0n) & 1n),
    is_async: Number((bits >> 1n) & 1n),
    complexity: Number((bits >> 2n) & 7n),
    domain_class: Number((bits >> 5n) & 15n),
    latent_cluster: Number((bits >> 9n) & 255n),
    authority: Number((bits >> 17n) & 255n),
    confidence: Number((bits >> 25n) & 255n),
    freshness_days: Number((bits >> 33n) & 255n),
  };
}
```

**Storage**:

```sql
-- Postgres: glyph records (searchable, indexed)
CREATE TABLE glyph_records (
  id TEXT PRIMARY KEY,
  packet_key TEXT NOT NULL REFERENCES atlas_packets(packet_key),
  title TEXT NOT NULL,
  label TEXT NOT NULL,
  bitpack_hex TEXT NOT NULL,         -- Hex string of uint64
  bitpack_fields JSONB NOT NULL,     -- Human-readable copy (not searchable)
  tags TEXT[] NOT NULL,              -- GIN indexed for tag search
  semantic_tags TEXT[],
  glyph_version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(packet_key)
);

-- Index for tile browser pagination
CREATE INDEX idx_glyph_authority ON glyph_records ((bitpack_fields->>'authority')::INT DESC);
CREATE INDEX idx_glyph_tags ON glyph_records USING GIN (tags);
```

---

## Layer 5: CHROM97 Visualization (Cartridge Rendering)

**What is CHROM97?**

CHROM97 is the **rendering pipeline** that turns glyphs into visual tiles. Think CHR-ROM (character graphics ROM in NES): compressed sprite patterns that the PPU (picture processor) renders on-screen.

**CHROM97 flow**:

```
Glyph → Bitunpack → Feature vector → Styling rules → HTML/SVG tile

Example:
  bitpack_hex: "0x1A5F8C"
  unpack → {is_exported: 1, complexity: 3, authority: 200, ...}
  apply rules: 
    - Border color = ROLE_COLORS[domain_class]    (NES-style palette)
    - Text size ∝ authority
    - Icon = ANIMATION_TYPES[complexity] (idle/speaking/objection/...)
    - Tooltip = semantic_tags
  render → <div class="glyph-tile" style="...">...</div>
```

**Glyph Tile Component** (Svelte 5):

```svelte
<script lang="ts">
  import type { GlyphRecord } from '$lib/types/glyph';
  
  interface Props {
    glyph: GlyphRecord;
  }
  
  let { glyph } = $props();
  
  const bitpacked = $derived(unpackGlyphBits(BigInt('0x' + glyph.bitpack_hex)));
  const roleColor = $derived(ROLE_COLORS[DOMAIN_CLASSES[bitpacked.domain_class]]);
  const animIcon = $derived(ANIMATION_TYPES[bitpacked.complexity]);
  
  const style = $derived({
    borderColor: roleColor,
    borderWidth: Math.ceil(bitpacked.confidence / 50) + 'px',
    opacity: bitpacked.authority / 255,
    backgroundColor: `hsl(${bitpacked.latent_cluster * 360 / 256}, 70%, 90%)`
  });
</script>

<div class="glyph-tile" {style}>
  <div class="header">
    <span class="icon">🎬 {animIcon}</span>
    <span class="title">{glyph.title}</span>
  </div>
  <div class="label">{glyph.label}</div>
  <div class="tags">
    {#each glyph.tags as tag}
      <span class="tag">{tag}</span>
    {/each}
  </div>
</div>

<style>
  .glyph-tile {
    border-left: solid;
    padding: 8px;
    font-family: 'Press Start 2P', monospace;
    background: var(--glyph-bg);
    transition: all 0.1s;
  }
  
  .glyph-tile:hover {
    transform: scale(1.05);
    box-shadow: 0 0 8px var(--border-color);
  }
</style>
```

**CHROM97 Palette** (NES-style colors):

```typescript
export const ROLE_COLORS = {
  'auth': '#92cc41',           // Green (NES)
  'retrieval': '#f83800',      // Red (NES)
  'inference': '#f7d51d',      // Yellow (NES)
  'topology': '#3cbcfc',       // Cyan (NES)
  'metadata': '#7c7c7c',       // Gray (NES)
};

export const DOMAIN_CLASSES = [
  'auth', 'retrieval', 'inference', 'topology', 'storage',
  'network', 'analysis', 'util', 'config', 'test',
  'data', 'crypto', 'compression', 'serialization', 'cache', 'reserved'
];

// 16 classes fit in uint4
```

---

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CANONICAL ENVELOPE (Postgres JSONB)                      │
│    Identity: packet_key, source_ref, feature_id             │
│    Metadata: created_at, token_count, confidence            │
│    Pointers: content_embedding_id, latent64_id, glyph_id    │
└─────────────────────────────────────────────────────────────┘
         ↓ (feature extraction, code analysis)
┌─────────────────────────────────────────────────────────────┐
│ 2. EXTRACTED FEATURES (Postgres columns or JSONB)           │
│    ast_symbols, imports, exports, lexical_features         │
│    domain_patterns, complexity_score                        │
│    (auto-populated, NO learned model)                       │
└─────────────────────────────────────────────────────────────┘
         ↓ (offline embeddings + compression)
┌─────────────────────────────────────────────────────────────┐
│ 3. LATENT ENCODING (Postgres bytea blobs)                   │
│    content_embedding (384-dim, pgvector, searchable)        │
│    latent128 (128-dim, float16, for reranking)              │
│    latent64 (64-dim, uint8, for SOM/KMeans)                 │
│    topology_cluster (uint16, SOM output)                    │
└─────────────────────────────────────────────────────────────┘
         ↓ (bitpacking + glyph materialization)
┌─────────────────────────────────────────────────────────────┐
│ 4. GLYPH BITPACK (Postgres glyph_records table)             │
│    Bitpacked uint64 (8 bytes): flags + cluster + authority  │
│    Title, label, tags, semantic metadata                    │
│    Version-tracked for schema evolution                     │
└─────────────────────────────────────────────────────────────┘
         ↓ (browser rendering, NES-style visualization)
┌─────────────────────────────────────────────────────────────┐
│ 5. CHROM97 TILES (SVG/HTML on browser)                      │
│    NES-palette colors (green/red/yellow/cyan)               │
│    Responsive hover + animation                             │
│    Sortable by authority, cluster, freshness                │
│    Filterable by tags, domain_class, complexity             │
└─────────────────────────────────────────────────────────────┘
```

---

## NES Memory Hierarchy Alignment

**Existing NES implementation** (`src/lib/gpu/nes-memory-architecture.ts`):
- 2KB INTERNAL_RAM (hot cache)
- 8KB CHR_ROM (character sprites, compressed)
- 32KB PRG_ROM (program code)
- VBlank lifecycle (60 FPS refresh)

**Glyph/CHROM97 mapping**:

```
┌─────────────────────────────┐
│ NES Memory Region           │ Glyph/Latent Equivalent
├─────────────────────────────┤
│ INTERNAL_RAM (2KB)          │ Glyph bitpack cache (in-memory)
│ CHR-ROM (8KB)               │ Latent64 quantized vectors (compressed)
│ PRG-ROM (32KB)              │ Latent128 float16 (program logic)
│ SAVE_RAM (8KB)              │ Canonical envelope JSONB (state)
│ Bank switching              │ Tile pagination (20 per page × 50 pages)
└─────────────────────────────┘

VBlank cycle (16ms / 60 FPS):
  - Render 1 batch of 20 glyphs
  - Update bitpack cache
  - Garbage collect stale tiles
  - Prepare next page
```

**JavaScript implementation**:

```typescript
// Use NESMemoryArchitecture for glyph tile cache
const glyphCache = new NESMemoryArchitecture();

// Phase 1: Load 20 glyphs into INTERNAL_RAM
glyphCache.allocateDocument({
  id: 'glyph:batch:1',
  type: 'evidence',
  priority: 200,
  size: 20 * 8,  // 20 glyphs × 8 bytes bitpack
  confidenceLevel: 0.9,
  riskLevel: 'low'
}, glyphBitpackBuffer);

// Phase 2: VBlank operations
glyphCache.startVBlankCycle();

// Phase 3: Bank switch for next page
glyphCache.switchBank({
  fromBank: 'INTERNAL_RAM',
  toBank: 'CHR_ROM',
  documents: nextPageGlyphs
});
```

---

## Implementation Roadmap (Phase 110+)

| Phase | Task | Layer | Status | ETA |
|-------|------|-------|--------|-----|
| **110** | Context window + MCP fixes | — | ✅ DONE | ✅ |
| **110A** | Layer 1: Canonical envelope finalized | Envelope | ⏳ DESIGN | 1h |
| **110B** | Layer 2: Feature extraction (2A/2B apply) | Features | ⏳ IN_PROGRESS | 4h |
| **110C** | Layer 3: Autoencoder training + inference | Latents | ⏳ DESIGN | 8h |
| **110D** | Layer 4: Glyph bitpacking + materialization | Glyphs | ⏳ DESIGN | 6h |
| **111** | Layer 5: CHROM97 tile rendering | Viz | ⏳ DESIGN | 4h |
| **112** | Unified tile browser + cartridge export | Viz | ⏳ DESIGN | 8h |

---

## Key Decisions (Why This Design)

1. **Canonical envelope in JSONB**: Fast filtering, human-readable, extendable
2. **Latent vectors in bytea**: Compact storage (64B latent64, 256B latent128), no index overhead
3. **Glyphs as separate table**: Independent lifecycle, easy cache invalidation, supports tile-specific versioning
4. **CHROM97 palette**: NES-authentic colors signal "this is a simulation, not reality" (legal compliance)
5. **Bitpacking to uint64**: Fits in single CPU register, fast unpacking, deterministic
6. **NES memory model**: Proven scalability pattern for limited memory; fits browser constraints

---

## Verification Gates (Smoke Tests)

```bash
# Layer 1: Canonical envelope
npm run atlas:audit:envelope

# Layer 2: Feature extraction
npm run atlas:phase2:coverage:report

# Layer 3: Latent encoding
npm run atlas:latent:encode:dry

# Layer 4: Glyph bitpacking
npm run atlas:glyph:bitpack:validate

# Layer 5: CHROM97 rendering
npm run glyph:browser:smoke
```

---

**Status**: 🟢 ARCHITECTURE READY  
**Next**: Implement Layer 2 feature extraction (Phase 2B/2C/2D) in Session 111

