# VLM + POI Photos Wiring Plan

## Status: COMPLETE
## Priority: MEDIUM
## Depends on: Drizzle schema fix (Session 93r28c++++++++ COMPLETE)

---

## Context

The `persons_of_interest` Drizzle schema was fixed to match the actual DB (table name `persons` -> `persons_of_interest`, 12+ column fixes). The old schema had inline `photos` JSONB and `photo_url` columns that **never existed in the DB**. Photos are managed via the separate `poi_photos` table.

The similar + search endpoints now return `photoUrl: null` and `lastLocation: null` with TODO comments marking the wiring gap.

---

## Existing Infrastructure

### Already Built (Ready to Wire)

| Component | File | Status |
|-----------|------|--------|
| **poi_photos table** | `schema-postgres.ts` (poiPhotos) | ACTIVE - id, poiId, minioKey, url, thumbnailUrl, aiCaption, aiTags, faceEmbedding, exifData, forensicData |
| **poiPhotos relations** | `schema-postgres.ts` (poiPhotosRelations) | ACTIVE - FK to personsOfInterest.id |
| **VLM Document Analyzer** | `lib/server/vlm-document-analyzer.ts` | BUILT - Ollama VLM analysis service |
| **Gemma3 VLM Embedder** | `lib/server/gemma3-vlm-embedder.ts` | BUILT - VLM embedding generation |
| **VLM Types** | `lib/types/gemma3-vlm.ts` | BUILT - Type definitions |
| **Vision Analyze API** | `routes/api/vision/analyze/+server.ts` | ACTIVE - SHA-256 -> Redis -> MinIO -> YOLO -> Ollama VLM |
| **VisionImageAnalyzer** | `components/evidence/VisionImageAnalyzer.svelte` | ACTIVE - Drag-drop -> FormData -> SVG overlay |
| **POIFaceMatchDialog** | `components/poi/POIFaceMatchDialog.svelte` | BUILT - Face matching dialog, reads `poi.photos[0].thumbnailUrl` |
| **POIPhotoGrid** | `components/poi/POIPhotoGrid.svelte` | BUILT - Photo grid display |
| **POIPhotoUploader** | `lib/client/ui/POIPhotoUploader.svelte` | BUILT - Client-side photo upload |
| **POIPhotoModal** | `lib/client/ui/POIPhotoModal.svelte` | BUILT - Photo modal viewer |
| **POIEditor** | `components/poi/POIEditor.svelte` | BUILT - POI editing form |
| **YOLO** | System binary via `spawn()` | ACTIVE - Object detection |

---

## Wiring Tasks

### Task 1: LEFT JOIN poi_photos in Similar + Search Endpoints (30 min)

**Files**: `api/persons-of-interest/[id]/similar/+server.ts`, `api/persons-of-interest/search/+server.ts`

```typescript
// Add to SELECT — subquery for first photo URL
import { poiPhotos } from '$lib/server/db/schema-postgres';

const candidates = await db
  .select({
    id: personsOfInterest.id,
    name: personsOfInterest.name,
    // ... existing fields
    photoUrl: sql<string>`(
      SELECT url FROM poi_photos
      WHERE poi_id = ${personsOfInterest.id}
      ORDER BY uploaded_at DESC LIMIT 1
    )`,
    thumbnailUrl: sql<string>`(
      SELECT thumbnail_url FROM poi_photos
      WHERE poi_id = ${personsOfInterest.id}
      ORDER BY uploaded_at DESC LIMIT 1
    )`,
  })
  .from(personsOfInterest)
  // ... rest of query
```

**Replace** `photoUrl: null` with the real subquery result.

### Task 2: POI Photo Upload API Endpoint (45 min)

**File**: Create `routes/api/persons-of-interest/[id]/photos/+server.ts`

- POST: Upload photo to MinIO -> insert `poi_photos` record -> return photo metadata
- GET: List photos for POI (ordered by uploadedAt)
- DELETE: Remove photo from MinIO + delete DB record

**Pipeline**:
1. FormData file extraction
2. SHA-256 hash for deduplication
3. MinIO upload (bucket: `poi-photos`, key: `{poiId}/{hash}.{ext}`)
4. Thumbnail generation (sharp resize 200x200)
5. MinIO upload thumbnail
6. Insert `poi_photos` record with urls

### Task 3: VLM Auto-Analysis on Photo Upload (30 min)

**File**: Extend photo upload POST handler

After MinIO upload, fire-and-forget VLM analysis:
1. Call `/api/vision/analyze` internally with photo URL
2. Update `poi_photos` record with `ai_caption` and `ai_tags`
3. Optionally generate face embedding via Ollama VLM -> store in `face_embedding` column

```typescript
// Fire-and-forget VLM analysis
void (async () => {
  try {
    const analysis = await fetch('/api/vision/analyze', {
      method: 'POST',
      body: formData  // same photo
    }).then(r => r.json());

    await db.update(poiPhotos)
      .set({
        aiCaption: analysis.description,
        aiTags: analysis.tags,
      })
      .where(eq(poiPhotos.id, photoId));
  } catch (e) {
    console.warn('VLM analysis failed (non-fatal):', e);
  }
})();
```

### Task 4: Wire POIPhotoGrid + POIPhotoUploader to [id] Page (30 min)

**File**: `routes/(app)/persons-of-interest/[id]/+page.svelte`

Currently references `poi.photos` (old JSONB column that never existed). Rewire to:
1. Fetch photos via `GET /api/persons-of-interest/{id}/photos`
2. Pass to `<POIPhotoGrid>` component
3. Wire `<POIPhotoUploader>` for adding new photos
4. Wire delete button per photo

### Task 5: Face Embedding Vector Search (45 min)

**File**: `api/persons-of-interest/[id]/similar/+server.ts`

Enhance similarity search with face embedding vectors:
1. Query `poi_photos.face_embedding` for target POI
2. If face embedding exists, add face similarity signal to multi-modal ranking
3. Weight: Vector text similarity (0.5) + Face similarity (0.3) + Case overlap (0.2)

```typescript
// Face similarity via cosine distance on stored embeddings
const faceResults = await db
  .select({
    poiId: poiPhotos.poiId,
    similarity: sql<number>`1 - (${poiPhotos.faceEmbedding}::vector <=> ${targetEmbedding}::vector)`
  })
  .from(poiPhotos)
  .where(sql`${poiPhotos.faceEmbedding} IS NOT NULL`)
  .orderBy(sql`${poiPhotos.faceEmbedding}::vector <=> ${targetEmbedding}::vector`)
  .limit(10);
```

### Task 6: Wire POIFaceMatchDialog to Similar Results (20 min)

**File**: `routes/(app)/persons-of-interest/[id]/+page.svelte`

The `POIFaceMatchDialog` component already exists but reads from old `poi.photos` JSONB. Rewire to:
1. Accept photo data from `poi_photos` table query
2. Show face match overlay on similar POI results
3. Display similarity scores from face embedding comparison

---

## Execution Order

```
Task 1 (JOIN photos) ──────> Task 4 (Wire UI)
                                    ↓
Task 2 (Upload API) ──> Task 3 (VLM) ──> Task 5 (Face vectors) ──> Task 6 (Face match UI)
```

**Total estimated**: ~3.5 hours

---

## Files to Modify

| File | Change |
|------|--------|
| `api/persons-of-interest/[id]/similar/+server.ts` | Add photo subquery, face similarity signal |
| `api/persons-of-interest/search/+server.ts` | Add photo subquery |
| `api/persons-of-interest/[id]/photos/+server.ts` | NEW - CRUD + MinIO + VLM |
| `routes/(app)/persons-of-interest/[id]/+page.svelte` | Rewire photo components to API |
| `components/poi/POIFaceMatchDialog.svelte` | Update data source from JSONB to API |
| `components/poi/POIPhotoGrid.svelte` | Verify compatible with poi_photos shape |

---

## Related: Location Column

The `last_location` column doesn't exist in DB. Options:
1. **ALTER TABLE** `persons_of_interest ADD COLUMN last_location text` — simple, backward compatible
2. **Derive from evidence** — extract locations from linked evidence via entity extraction
3. **Skip** — relationship + description covers most use cases

Recommend Option 1 if location display is wanted, via manual migration in `drizzle/manual/`.
