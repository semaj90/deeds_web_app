# Detective Mode Vision UI Components

Complete set of SvelteKit components for AI-powered visual evidence analysis in Detective Mode.

## Components

### EvidenceUpload.svelte
- Upload images → `/api/vision/image/analyze`
- Upload videos → `/api/vision/video/analyze`
- Emits `updated` event with new evidence items
- Supports case_id and evidence_id metadata

### EvidenceGrid.svelte
- Grid display of evidence thumbnails
- Click selection → emits `select` event
- Scrollable, responsive grid layout
- Handles both image and video frame thumbnails

### ZoomEnhanceViewer.svelte
- Zoom view for selected evidence
- "Enhance" toggle with CSI-style effects
- Ready for future RE:GAN/TensorRT integration
- Large image support with proper scaling

### SimilarityHeatmap.svelte
- Visual similarity scoring overlay
- Color-coded heatmap (blue→red = low→high similarity)
- Click selection integration
- Score percentage badges

## API Integration

### Vision API (`src/lib/vision/api.ts`)
```typescript
uploadEvidenceImage(formData: FormData): Promise<ImageAnalysisResult>
uploadEvidenceVideo(formData: FormData): Promise<VideoAnalysisResult>
getSimilaritySearch(queryVector: number[], limit: number): Promise<SimilarityResult[]>
```

## Usage

```svelte
<script lang="ts">
 import {
 EvidenceUpload,
 EvidenceGrid,
 ZoomEnhanceViewer,
 SimilarityHeatmap
 } from '$lib/components/vision';
</script>

<!-- Full Detective Vision Interface -->
<EvidenceUpload on:updated={handleNewEvidence} />
<EvidenceGrid {thumbnails} on:select={handleSelection} />
<ZoomEnhanceViewer {selectedSrc} />
<SimilarityHeatmap {similarities} {selectedId} />
```

## Routes

- `/detective/vision` - Complete vision analysis interface
- API endpoints expected:
 - `POST /api/vision/image/analyze`
 - `POST /api/vision/video/analyze`
 - `POST /api/vision/similarity/search`

## Styling

- YoRHa/Arrival/True Detective aesthetic
- Dark theme with accent colors
- Pure Tailwind/UnoCSS (no external dependencies)
- Responsive grid layouts

## Features

✅ Image & video upload
✅ Frame slicing for videos
✅ Thumbnail generation via MinIO
✅ Zoom & enhanced viewing
✅ Similarity heatmap overlay
✅ Event-driven communication
✅ Barrel exports for clean imports
✅ Svelte 5 runes throughout
✅ TypeScript support
✅ Ready for FastAPI backend integration

## Next Steps

Choose your next enhancement:

A) **Similarity Inspector** - Before/after sliding comparison (CSI-style)
B) **Evidence Timeline** - Horizontal scroll by timestamp, auto-grouped by minute
C) **Case Wall** - Arrival-style board with drag/drop notes, links, clusters
D) **Match Grouping** - Auto clusters with visual groups (Qdrant + WebGPU force-layout)