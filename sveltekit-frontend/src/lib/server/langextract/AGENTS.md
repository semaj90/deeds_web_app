# LangExtract — `src/lib/server/langextract/`

<!-- AGENTS-GEN v1 · do not edit below this line -->

## Snapshot
| Metric | Value |
|--------|-------|
| Files | 2 (bag-cache.ts, google-langextract.ts) |
| Purpose | Bag-of-Words texture tiles (Redis-cached) + Google Document AI extraction |
| Tags | nlp, extraction, cache, texture |

## Files

| File | Purpose |
|------|---------|
| `bag-cache.ts` | BowTextureTile Redis cache — chunk/cluster/SOM keyed BoW histograms |
| `google-langextract.ts` | Google Document AI / LanguageService entity extraction |

## BowTextureTile Shape

```typescript
interface BowTextureTile {
  id:        string;
  topTerms:  Array<{ term: string; weight: number }>;
  clusterId?: number;
  som?:       { x: number; y: number };
  createdAt:  number;
}
```

## Cache Keys (Redis)

| Pattern | Scope |
|---------|-------|
| `texture:bow:chunk:<chunkId>` | Single Qdrant chunk |
| `texture:bow:cluster:<clusterId>` | All chunks in a GPU cluster |
| `texture:bow:som:<x>:<y>` | All chunks at a SOM grid cell |
| `rpc:remote-function:getBagOfWordsTexture:v1:<hash>` | RPC envelope (1hr TTL) |

## Agentic Hints

- BoW tiles are consumed by `GraphifyViewer.svelte` cluster tooltips
- Rebuild via `POST /api/graph/bow-texture` with `{ chunkId }` or `{ clusterId }` or `{ som: {x,y} }`
- `mergeBowTiles(tiles, id)` merges multiple tiles into a cluster summary tile
- Google LangExtract (`google-langextract.ts`) is separate from BoW — it calls Google Cloud API; requires `GOOGLE_LANGEXTRACT_KEY` env var
