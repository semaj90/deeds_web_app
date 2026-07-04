# Storage Neighborhood Contracts

## Core Principle

**Do not model search neighborhoods as physical linked lists.** Use columnar packed arrays + index mapping for array speed with linked-list semantics.

## Memory Layout

All neighborhoods are stored as memory-mapped structured arrays (TypedArray):

```typescript
// Canonical neighborhood representation

// packet_keys[] — packed string/id array
// Each entry is a 16-byte ULID or 64-char hex string (sha256)
packet_keys: Uint8Array   // 16 * N bytes

// latent_64.f32 — mmap vector matrix
// Dense 64-dim vectors, row-major layout
// Each row corresponds to packet_keys[i]
latent_vectors: Float32Array  // 64 * N floats

// neighbors.u32 — adjacency offsets (CSR-style)
// CSR (Compressed Sparse Row) format:
//   neighbors.row_offsets[i]   = start index in neighbors.col_indices
//   neighbors.row_offsets[i+1] - neighbors.row_offsets[i] = number of neighbors for packet i
neighbors: {
  row_offsets: Uint32Array,     // N+1 entries
  col_indices: Uint32Array      // Sum of all degrees
}

// som_cell_index.u16 — SOM grid mapping
// 0–399 = valid SOM cell (20×20 = 400 cells)
// 0xFFFF = unassigned
som_cells: Uint16Array  // N entries, 0–399 or 0xFFFF

// community_id.i32 — community assignment
// -1 = no community
// 0..K = community cluster
communities: Int32Array  // N entries
```

## Layout Example

```
N packets: [P0, P1, P2, P3, P4, P5]

packet_keys layout (3 bytes per entry for illustration):
  [ P0_id | P1_id | P2_id | P3_id | P4_id | P5_id ]

latent_vectors layout (64-dim, row-major):
  [ P0[0..63] | P1[0..63] | P2[0..63] | P3[0..63] | P4[0..63] | P5[0..63] ]

neighbors (CSR, e.g. P0→[P1,P3], P1→[P0,P2,P4], P2→[P1], ...):
  row_offsets:   [ 0, 2, 5, 6, 8, 9, 11 ]  (N+1 entries)
  col_indices:   [ 1, 3, 0, 2, 4, 1, 0, 4, 3, 2, 4 ]

som_cells:       [ 12, 7, 45, 199, 301, 88 ]  (0–399)
communities:     [ 0, 0, 1, 1, 2, 1 ]          (-1 for unassigned)
```

## Query: "What are P1's neighbors?"

```typescript
function getNeighbors(packetIndex: number): Uint32Array {
  const start = neighbors.row_offsets[packetIndex];
  const end = neighbors.row_offsets[packetIndex + 1];
  return neighbors.col_indices.slice(start, end);
}

// getNeighbors(1) = [0, 2, 4] (neighbor indices)
```

## Query: "Nearest K in SOM neighborhood?"

```typescript
function getSomNeighborhood(row: number, col: number, radius: number = 1): Uint32Array {
  const results: Uint32Array[] = [];
  const targetCell = row * 20 + col;

  for (let i = 0; i < som_cells.length; i++) {
    const cell = som_cells[i];
    if (cell === 0xFFFF) continue; // Unassigned
    
    const r = Math.floor(cell / 20);
    const c = cell % 20;
    const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
    
    if (distance <= radius) {
      results.push(i);
    }
  }
  
  return Uint32Array.from(results);
}
```

## Storage Guarantees

| Property | Guarantee | Checked By |
|----------|-----------|-----------|
| Symmetry | If i→j is in neighbors, j→i must also be in neighbors | Validator |
| Dense vectors | All N packets have 64-dim vectors | Validator |
| SOM coverage | Every packet has som_row and som_col OR som_cells[i] = 0xFFFF | Validator |
| Community assignment | Every packet has community_id ≥ -1 | Validator |
| CSR validity | row_offsets is strictly increasing, all col_indices < N | Validator |

## Cache Coherence Rule

**After any write to neighborhoods (new SOM clustering, new K-Means assignment):**

1. Write updated array to mmap file
2. Increment epoch counter (stored at offset 0 of file)
3. Broadcast epoch change via Redis pub/sub: `channel: "acp:topology:epoch"`, `data: { epoch: N+1 }`
4. All readers check epoch before using cached arrays (defensive cache miss)

```typescript
// Broadcast topology update
await redis.publish('acp:topology:epoch', JSON.stringify({
  epoch: newEpoch,
  changed_components: ['som', 'kmeans'],
  timestamp: Date.now()
}));

// Reader: check epoch before trusting cache
const cachedEpoch = getCachedTopologyEpoch();
if (cachedEpoch < latestEpoch) {
  // Reload from disk
  reloadTopologyFromMmap();
}
```

## Performance Characteristics

| Operation | Complexity | Latency (1M packets) |
|-----------|-----------|---------------------|
| Random packet access | O(1) | <1µs |
| Get neighbors of packet i | O(degree) | <100µs (typical degree=5-10) |
| k-nearest in SOM neighborhood | O(N) scan | ~10ms (optimizable with grid hash) |
| Cosine similarity rerank (top-K) | O(K*64) | ~1ms for K=100 |

## Example: ACP Worker Loop Using Neighborhoods

```typescript
async function acpWorkerProcessPacket(envelope: PacketTopologyEnvelope) {
  // 1. Resolve semantic key
  const titleId = envelope.title_id;
  const featureId = envelope.feature_id;
  semanticCache.track(titleId, featureId);

  // 2. Lookup manifold neighborhood (SOM cells within radius=1)
  const somNeighbors = getSomNeighborhood(
    envelope.som_row ?? 0,
    envelope.som_col ?? 0,
    1
  );

  // 3. Expand candidate tuples (graph neighbors from Neo4j cache)
  const graphNeighbors = envelope.neo4j_neighbors || [];

  // 4. Rank locally (cosine similarity over latent_64)
  const scores = rankCandidates(
    envelope.latent_64,
    somNeighbors.map(idx => latent_vectors.slice(idx * 64, (idx + 1) * 64))
  );

  // 5. Send bounded packet set (top-10)
  const topPacketIndices = scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(x => x.index);

  sendBoundedPacketSet(
    envelope.packet_key,
    topPacketIndices.map(idx => packet_keys[idx])
  );
}
```

## Design Rationale

**Why not linked lists?**
- Cache misses on every neighbor dereference
- Fragmented heap allocation
- No SIMD vectorization for batch operations
- Expensive serialization (pointer chasing)

**Why columnar layout?**
- Sequential memory access (CPU cache efficiency)
- SIMD vectorization for cosine similarity batches
- Efficient serialization (contiguous byte arrays)
- Memory-mapped file I/O (zero-copy for large datasets)
- Simple epoch-based cache coherence (single counter)

**Why CSR format for adjacency?**
- Sparse graphs compress 90%+ (typical degree << N)
- Fast neighbor lookup: O(degree) not O(N)
- Standard format for graph libraries (scipy, NetworkX)
- Cache-friendly iteration over neighbors

## Storage Binding

| Component | Store | Binding |
|-----------|-------|---------|
| packet_keys | Postgres ULID primary key → mmap array | 1:1 row index |
| latent_64 | Postgres `latent_vectors` column (BYTEA) → mmap file | Dense embedding |
| neighbors | Neo4j `SIMILAR_TOPOLOGY` edges → CSR file | Graph snapshot |
| som_cells | Postgres `som_cell` column (int) → mmap array | Identity |
| communities | Neo4j GDS `community_id` → Postgres sync → mmap array | Derived |
| Epoch counter | Redis `acp:topology:epoch` → file header | Coherence signal |

All bindings are unidirectional: **Postgres → mmap**. Read-only in the ACP loop. Updates go back to Postgres (truth) and trigger epoch broadcast.
