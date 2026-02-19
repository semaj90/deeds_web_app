# Memory Palace GPU Integration Guide

## Quick Start

### 1. Export CH-ROM97 Cartridge

```bash
# Inside phase-backend container
python backend/scripts/export_chr97_with_emb16.py

# Creates:
# - topology/doj_v_foo/complaint.chr97.json (JSON format)
# - topology/doj_v_foo/complaint.chr97.bin (Binary format)
```

### 2. Serve Cartridge

Option A: MinIO
```bash
# Upload to MinIO
aws s3 cp topology/doj_v_foo/complaint.chr97.json \
  s3://legal-topology/doj_v_foo/complaint.chr97.json \
  --endpoint-url http://phase-minio:9000
```

Option B: Static folder
```bash
# Copy to SvelteKit static
cp topology/doj_v_foo/complaint.chr97.json \
  sveltekit-frontend/static/topology/doj_v_foo/
```

### 3. Update Memory Palace URL

In `sveltekit-frontend/src/routes/memory-palace/+page.svelte`:

```typescript
// Change this line:
const cartridge = await loadChr97Cartridge('/topology/doj_v_foo/complaint.chr97.json');

// To your actual case:
const cartridge = await loadChr97Cartridge('/topology/YOUR_CASE_ID/complaint.chr97.json');
```

### 4. Start Backend

```bash
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

### 5. Open Memory Palace

```
http://localhost:5173/memory-palace
```

---

## Data Pipeline

### From Ingestion to GPU

```
legal_complaint_ingestion.py
    ├─ Extract text (Docling)
    ├─ Chunk (1500 chars)
    ├─ Embed (768-dim via Ollama)
    └─ Store in Qdrant + PostgreSQL
    ↓
export_chr97_with_emb16.py
    ├─ Load 768-dim embeddings
    ├─ Quantize to 16-dim
    ├─ Read heat from Redis (manifold-usage)
    ├─ Build 4D manifold (UMAP)
    └─ Export JSON + binary
    ↓
Memory Palace (GPU)
    ├─ Load CH-ROM97 cartridge
    ├─ Upload to GPU buffers
    ├─ Render 4D point cloud
    └─ Highlight search results
```

---

## API Integration

### /api/search Response

Now includes `query_emb16`:

```json
{
  "query": "Supremacy Clause",
  "chunks": [...],
  "alignment": {...},
  "query_emb16": [0.1, 0.2, ..., 0.16]  // 16-dim embedding
}
```

### GPU Shader

Computes similarity on GPU:

```glsl
float sim = dot(emb0, q0) + dot(emb1, q1) + dot(emb2, q2) + dot(emb3, q3);
sim *= 0.25;  // Average
```

### Timeline Endpoints

```bash
# Get user's search history
GET /api/user/timeline?user_id=user-123

# Add search to timeline
POST /api/user/timeline/add
{
  "user_id": "user-123",
  "query": "Supremacy Clause",
  "intent": "legal_rag",
  "route": "legal_rag_plus_kag",
  "result_count": 10
}
```

---

## Embedding Quantization

### 768-dim → 16-dim

Current approach (simple):
```python
# Take first 16 dims and normalize
emb16 = emb768[:16]
emb16 = emb16 / np.linalg.norm(emb16)
```

For production, consider:
- PCA projection (learn from training data)
- Learned projection matrix
- Product quantization
- Locality-sensitive hashing

---

## Heat Values

Heat is read from Redis:

```
manifold-usage:{case_id}:{chunk_index}
  → {"hits": 5, "heat": 3.2}
```

Converted to u16:

```python
heat_u16 = int(np.clip(heat * 10000, 0, 65535))
```

In shader, normalized:

```glsl
float heat = heat_u16 / 65535.0;
```

---

## Performance Optimization

### For 100k+ Points

1. **Use compute shaders** instead of vertex shader
2. **Batch updates** - don't update every frame
3. **LOD (Level of Detail)** - render fewer points at distance
4. **WebGPU** - better for large point clouds

### Current Limits

- Three.js: ~50k points at 60 FPS
- WebGPU: ~1M points at 60 FPS

---

## Debugging

### Check Cartridge Loading

```typescript
const cartridge = await loadChr97Cartridge(url);
console.log('Loaded runes:', cartridge.runes.length);
console.log('First rune:', cartridge.runes[0]);
```

### Check GPU Buffers

```typescript
scene.loadCartridge(cartridge);
// Check browser DevTools → WebGL tab
```

### Check Shader Compilation

```typescript
// In MemoryPalaceScene.ts
const material = new THREE.ShaderMaterial({...});
console.log('Shader compiled:', material.program);
```

### Check Search Response

```bash
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Supremacy Clause"}' | jq '.query_emb16'
```

---

## Troubleshooting

### Cartridge Won't Load

- Check URL is correct
- Check CORS headers (if loading from different domain)
- Check browser console for fetch errors

### GPU Highlighting Not Working

- Check `query_emb16` is in response
- Check shader uniforms are set
- Check highlight attribute is updated

### Slow Rendering

- Reduce point size (uPointSize)
- Use LOD for large point clouds
- Profile with Chrome DevTools

### Timeline Not Updating

- Check `/api/user/timeline/add` endpoint
- Check Redis connection
- Check user_id is passed

---

## Next Steps

1. Export real data from your ingestion pipeline
2. Upload cartridge to MinIO or static folder
3. Update Memory Palace URL
4. Test search highlighting
5. Optimize for your data size
6. Add WebGPU support for larger datasets

---

## Files Reference

- Loader: `sveltekit-frontend/src/lib/memory-palace/chr97Loader.ts`
- Renderer: `sveltekit-frontend/src/lib/memory-palace/MemoryPalaceScene.ts`
- Page: `sveltekit-frontend/src/routes/memory-palace/+page.svelte`
- Exporter: `backend/scripts/export_chr97_with_emb16.py`
- API: `backend/api/search_api.py`
