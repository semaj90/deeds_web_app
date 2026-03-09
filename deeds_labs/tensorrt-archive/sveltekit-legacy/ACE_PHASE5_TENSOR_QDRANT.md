# ACE Phase 5: Enhanced Qdrant Tags + Tensor Analysis Architecture

## Current Qdrant Payload Schema (FileProfile)

```python
# From backend/scripts/fastmcp_ripgrep_indexer.py
@dataclass
class FileProfile:
    file_path: str          # Absolute path to file
    role: str               # route|service|component|utility|schema|worker
    surface: List[str]      # sveltekit_route|server|client|api
    dependencies: List[str] # npm packages used
    exports: List[str]      # exported symbols
    imports: List[str]      # imported modules
    comments: List[str]     # extracted documentation
    risk: str               # low|med|high
    change_frequency: str   # hot|warm|cold
    related_routes: List[str]  # associated routes
    tags: List[str]         # semantic tags (rag, kag, ace, ui, etc.)
    summary: str            # LLM-generated summary
    llm_output: str         # Raw LLM response
    generated_at: str       # ISO8601 timestamp

# Upsert into Qdrant as:
payload = {
    "points": [{
        "id": point_id_int,    # Hash of file_path
        "vector": [768 floats], # embeddinggemma:latest
        "payload": asdict(profile)
    }]
}
```

## Recommended Payload Enhancements for ACE Routing

Add these fields to enable powerful filtering:

```python
# Enhanced payload for cluster + error routing
enhanced_payload = {
    # Core identity
    "kind": "file",              # file|function|component|error|pattern
    "name": profile.file_path.split("/")[-1],
    "filePath": profile.file_path,

    # Technology filters
    "tech": ["drizzle", "qdrant", "redis"],  # from imports
    "surface": ["cases", "evidence", "command-center"],  # route area

    # Error context (when kind=error)
    "errorCode": "TS1005",       # TypeScript error code
    "lineNumber": 123,           # Source line

    # Cluster context (from GPU k-means)
    "clusterId": "cluster_07",   # Assigned cluster
    "centroidDistance": 0.15,    # Distance to cluster center

    # ACE timeline
    "runId": "run_20260102_1700",
    "timestamp": "2026-01-02T17:00:00Z",

    # Risk assessment
    "risk": "high",
    "confidence": 0.85
}
```

## GPU Tensor Analysis Pipeline

### Current Flow (Working):
```
1. ripgrep → Extract comments, imports, exports
2. gemma3:270m → Generate file summary
3. embeddinggemma → 768d embedding vector
4. Auto-tagger → Deterministic tags from path + imports
5. Qdrant upsert → Store in fastmcp_file_profiles
6. Redis cache → Quick ACE lookups by tag
```

### Enhanced Flow (Phase 5):
```
1. [Same steps 1-3]
4. GPU Cluster (PyTorch CUDA):
   - Load N embeddings as tensor X.cuda()
   - Cosine k-means clustering
   - Assign cluster_id to each profile
5. Store cluster centroids as separate cards in phase90_error_clusters
6. Each file card gets cluster_id, centroid_distance
7. ACE query: retrieve cluster → files in cluster → build prompt
```

### GPU K-Means Code (phase90_gpu_kmeans.py):
```python
import torch

def gpu_kmeans(embeddings: torch.Tensor, k: int = 20, iterations: int = 100):
    """Fast cosine k-means on GPU"""
    device = torch.device('cuda:0')
    X = embeddings.to(device)
    X = X / X.norm(dim=1, keepdim=True)  # Normalize for cosine

    # Random init
    centroids = X[torch.randperm(len(X))[:k]]

    for _ in range(iterations):
        # Cosine similarity = dot product of normalized vectors
        sims = X @ centroids.T
        labels = sims.argmax(dim=1)

        # Update centroids
        for i in range(k):
            mask = labels == i
            if mask.sum() > 0:
                centroids[i] = X[mask].mean(dim=0)
                centroids[i] /= centroids[i].norm()

    return labels.cpu(), centroids.cpu()
```

## Current Error State

| Metric | Value |
|--------|-------|
| Total svelte-check errors | 72,433 |
| Route conflicts | **0** ✅ (fixed) |
| Files with TS1005 (syntax) | ~136 |
| Files with TS2307 (modules) | ~137 |
| Files with TS2304 (name) | ~219 |

### Root Cause:
Widespread file corruption with patterns:
- `: ` instead of `, ` in object literals
- `| ` instead of `, ` in function params
- Type union syntax corrupted

### Top Corrupted Files (need rewrite):
1. `src/routes/(app)/cases/create/+page.svelte` - **FIXED** ✅
2. `src/lib/gemma3Client.ts` - heavy corruption
3. `src/lib/command-center-manifest.ts` - moderate
4. Various `src/lib/services/*.ts` files

## Next Actions

### Immediate (Error Collapse):
1. Rewrite top 10 corrupted files for Svelte 5
2. Run `npm run db:check` to validate schema
3. Test dev server: `npm run dev`

### Short-term (ACE Enhancement):
1. Add `clusterId`, `errorCode`, `lineNumber` to payload schema
2. Implement GPU k-means clustering for error cards
3. Create phase90_error_clusters collection

### Commands:
```bash
# Guard against future route conflicts
npm run precheck

# Full error check
npm run check

# Validate database schema
npm run db:check

# Start dev server
npm run dev
```

## Qdrant Collections Map

| Collection | Purpose | Payload Fields |
|------------|---------|----------------|
| `fastmcp_file_profiles` | File character cards | role, surface, tags, summary |
| `phase90_error_cards` | Individual error cards | errorCode, filePath, lineNumber |
| `phase90_error_clusters` | Cluster centroids | clusterSize, dominantCode, fixHint |
| `phase89_codebase_index` | Legacy file index | (migrate to fastmcp) |
