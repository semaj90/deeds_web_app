# CH-ROM97 Multimodal Cartridge Specification v1.0

**GPU-Native Legal Memory Format**
(NES/N64 cartridge architecture → modern GPU multimodal memory)
(Pokémon card data model → legal glyph memory atom)

---

## 🎯 Overview

CH-ROM97 is a unified binary cartridge format that packs:
- **Runes** (semantic atoms)
- **Tensors** (768d/1024d embeddings)
- **Tiles** (32×32 N64-style grayscale textures)
- **Metadata** (case info, statutes, POIs)
- **Graph edges** (Neo4j KAG links)
- **Visual cards** (SDXL/glyph renderings)

Into a single artifact that can be:
- ✅ Loaded quickly into GPU VRAM
- ✅ Streamed via QUIC
- ✅ Cached in Redis
- ✅ Mirrored in Qdrant
- ✅ Indexed in pgvector
- ✅ Browsed in SvelteKit
- ✅ Read by Neo4j
- ✅ Processed by CUDA tile engine
- ✅ Decoded by VLMs (Gemma-3 Vision)
- ✅ Reconstructed visually (SDXL)

---

## 🟥 Top-Level Layout

```
CH-ROM97 Cartridge = 4096-byte header + variable multimodal payload

┌─────────────────────────────────────────┐
│ CHR97_MAGIC (8 bytes)                   │ "CHR97\0\0\0"
│ VERSION (2 bytes)                       │ Major.Minor
│ FLAGS (2 bytes)                         │ compressed|quantized|encrypted|vision
│ RUNE_COUNT (2 bytes)                    │ N runes
│ TILE_COUNT (2 bytes)                    │ N tiles
│ TENSOR_SIZE (4 bytes)                   │ bytes in FP16 bank
│ LATENT_SIZE (4 bytes)                   │ bytes in INT4 bank
│ GRAPH_NODE_COUNT (4 bytes)              │ N graph nodes
│ MANIFOLD_DIM (1 byte)                   │ 4D UMAP dimension
│ RESERVED (64 bytes)                     │ future use
├─────────────────────────────────────────┤
│ RUNE_BLOCKS [variable]                  │ N × 32 bytes each
│ TILE_ATLAS [variable]                   │ N × 1024 bytes (32×32)
│ FP16_TENSORS [variable]                 │ N × 1024 × 2 bytes
│ INT4_LATENTS [variable]                 │ N × 512 bytes
│ GRAPH_LINKS [variable]                  │ CSR format
│ METADATA [variable]                     │ JSON (UTF-8)
│ VISUAL_CARD [variable]                  │ Base64 PNG/WebP
└─────────────────────────────────────────┘
```

---

## 🟦 Section-by-Section Specification

### 1. Magic Header (8 bytes)

```
"CHR97\0\0\0"
```

ASCII: `C H R 9 7 NUL NUL NUL`

Used for file validation and endianness detection.

### 2. Version (2 bytes)

```
[Major: 1 byte] [Minor: 1 byte]
Example: 0x01 0x00  → v1.0
```

Allows forward/backward compatibility.

### 3. Flags (2 bytes)

```
Bit 0: compressed (zstd)
Bit 1: quantized (INT4 latent)
Bit 2: encrypted (AES-256)
Bit 3: contains vision tensor
Bit 4: contains graph links
Bits 5-15: reserved

Example: 0b00011111  → all features enabled
```

### 4. Rune Blocks (variable)

Each rune is a 32-byte struct:

```c
struct CHR97_RuneBlock {
  uint16 rune_id;           // 0-65535 (internal ID)
  uint16 tile_index;        // position in atlas (0-N_tiles)
  uint16 cluster_id;        // FAISS/K-Means cluster
  float  manifold[4];       // 4D UMAP position
  uint16 graph_degree;      // number of edges
  uint64 tensor_uuid;       // GPU tensor reference (hash)
};
```

**Total**: `N_runes × 32 bytes`

### 5. Tile Atlas (variable)

N64-style 32×32 grayscale textures:

```
Each tile: 32 × 32 × 1 byte = 1024 bytes
Total: N_tiles × 1024 bytes

Layout:
[tile_0: 1024 bytes]
[tile_1: 1024 bytes]
[tile_2: 1024 bytes]
...
```

Identical to N64 microcode tile memory format.

### 6. FP16 Tensor Bank (variable)

Packed array of runic embeddings:

```
[N_runes × 1024 × float16]
= N_runes × 2048 bytes

Each rune has a 1024-dimensional embedding.
Format: IEEE 754 half-precision (2 bytes per value)
```

This is your semantic vector bank.

### 7. INT4 Latent Bank (variable)

Quantized latent blob:

```
[N_runes × 512 bytes]

Each byte = 2 × int4 symbols
Allows 4-bit quantization for KV cache compression
```

### 8. Neo4j Graph Links (KAG) (variable)

CSR (Compressed Sparse Row) format:

```
node_offsets: [uint32 × (N_nodes + 1)]
node_edges:   [uint16 × total_edges]

Example:
node_offsets = [0, 3, 5, 7, 9]
node_edges   = [2, 5, 7,  1, 4,  0, 3,  6, 8]

Interpretation:
- Node 0 has edges to: 2, 5, 7
- Node 1 has edges to: 1, 4
- Node 2 has edges to: 0, 3
- Node 3 has edges to: 6, 8
```

Supports:
- A* pathfinding
- "What's missing?" inference
- POI–Statute–Evidence linking

### 9. Metadata Block (variable)

Pure JSON (UTF-8):

```json
{
  "case_id": "CASE-187-A",
  "statutes": ["PC 187", "PC 207", "PC 245"],
  "pois": ["John Doe", "Jane Smith"],
  "domain": "Homicide",
  "confidence": 0.92,
  "langextract_bag": ["felony", "weapon", "force", "premeditation"],
  "created_at": "2025-11-25T12:00:00Z",
  "version": "1.0",
  "author": "legal-ai-pipeline"
}
```

### 10. Visual Card (variable)

Base64-encoded PNG or WebP:

```
[Base64 string of image bytes]

Allows:
- SvelteKit render
- Gemma-3 Vision VRAM load
- Fallback prompting
- Evidence visual memory
```

---

## 🟧 CH-ROM97 Cartridge Example

```yaml
CH-ROM97:
  version: 1.0
  magic: "CHR97"
  flags:
    compressed: true
    quantized: true
    encrypted: false
    vision_tensor: true

  runes: 26
  tiles: 26
  tensors: 1024-d FP16
  latents: INT4
  graph_nodes: 26
  manifold_dim: 4

  metadata:
    case_id: "CASE-187-A"
    statutes:
      - "PC 187"
      - "PC 207"
    pois:
      - "Unknown male"
      - "Witness A"
    domain: "Homicide"
    confidence: 0.92

  visual_card: "iVBORw0KGgoAAAANSUhEUgAA..."
```

---

## 🟩 CH-ROM97 → GPU Loading Pipeline

```
1. Load file from disk/network
   ↓
2. Map header (4096 bytes)
   ↓
3. mmap tile atlas into CUDA texture memory
   ↓
4. Load tensor bank into VRAM (FP16)
   ↓
5. Decode INT4 latent → KV cache
   ↓
6. Load graph into shared memory (CSR)
   ↓
7. Parse metadata into RAM (JSON)
   ↓
8. Send visual_card to VLM (Gemma-3 Vision)
   ↓
GPU can then perform:
  - FAISS search (768d/1024d)
  - 4D manifold transforms
  - Cluster routing
  - A* legal reasoning
  - RAG + KAG + VAG fusion
```

---

## 🟨 File Size Estimation

For a typical legal case cartridge:

```
Header:                    4 KB
Rune blocks (26 × 32):     0.8 KB
Tile atlas (26 × 1024):    26 KB
FP16 tensors (26 × 2048):  52 KB
INT4 latents (26 × 512):   13 KB
Graph links (CSR):         2 KB
Metadata (JSON):           2 KB
Visual card (PNG):         50-200 KB
─────────────────────────────
Total:                     ~150-250 KB per cartridge
```

Highly compressible with zstd (typically 30-50% compression).

---

## 🟩 Serialization Format (Binary)

```python
# Pseudocode for writing CH-ROM97

def write_ch_rom97(cartridge, filename):
    with open(filename, 'wb') as f:
        # Header
        f.write(b'CHR97\0\0\0')
        f.write(struct.pack('<HH', 1, 0))  # version 1.0
        f.write(struct.pack('<H', flags))
        f.write(struct.pack('<HHIIIH',
            len(runes), len(tiles),
            len(tensors) * 2, len(latents),
            len(graph_nodes), 4))
        f.write(b'\0' * 64)  # reserved

        # Rune blocks
        for rune in runes:
            f.write(struct.pack('<HHHHHQ',
                rune.id, rune.tile_idx, rune.cluster,
                rune.graph_degree, rune.tensor_uuid))
            f.write(struct.pack('<ffff', *rune.manifold))

        # Tile atlas
        for tile in tiles:
            f.write(tile.data)  # 1024 bytes each

        # FP16 tensors
        for tensor in tensors:
            f.write(tensor.astype(np.float16).tobytes())

        # INT4 latents
        for latent in latents:
            f.write(latent.tobytes())

        # Graph links (CSR)
        f.write(struct.pack(f'<{len(offsets)}I', *offsets))
        f.write(struct.pack(f'<{len(edges)}H', *edges))

        # Metadata
        f.write(json.dumps(metadata).encode('utf-8'))

        # Visual card
        f.write(base64.b64encode(visual_card))
```

---

## ✅ Verification Checklist

- [ ] Magic header matches "CHR97"
- [ ] Version is 1.0
- [ ] Flags are valid
- [ ] Rune count matches actual runes
- [ ] Tile count matches actual tiles
- [ ] Tensor size = N_runes × 2048
- [ ] Latent size = N_runes × 512
- [ ] Graph nodes match metadata
- [ ] Manifold dimension is 4
- [ ] All sections present and valid
- [ ] Metadata JSON is valid UTF-8
- [ ] Visual card is valse64

---

## 🎉 Status

**CH-ROM97 Specification Complete**

Ready for implementation:
- ✅ A — Rune-to-Tensor UUID Generator
- ✅ B — GPU Tile Processor Kernel (CUDA)
- ✅ C — Rune Atlas Generator (32×32)
- ✅ D — SvelteKit N64 Glyph Viewer
- ✅ E — Neo4j KAG Loader
- ✅ F — RAG + KAG + VAG Retriever
- ✅ H — Visual Memory Palace Integration
