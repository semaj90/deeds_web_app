# 📸 Evidence Upload UX Flow - Complete Guide

**Tech Stack**: SvelteKit 2 + Svelte 5 (runes) + Drizzle ORM 0.44 + MinIO + Qdrant

---

## 🎯 Quick Start

### Option 1: Automated Screenshot Capture (Playwright)

```bash
# Install Playwright (if not already)
npx playwright install chromium

# Start dev server
npm run dev

# Run screenshot script
node scripts/tests/screenshot-evidence-upload-flow.mjs
```

**Outputs**: 4 PNG screenshots in `scripts/tests/screenshots/evidence-upload-flow/`

### Option 2: Manual Flow Test

```bash
# Start dev server
npm run dev

# Open browser
# Navigate to: http://localhost:5173/evidence
# Click "Upload Evidence" button
# Follow the 4-step flow below
```

---

## 📊 4-Screenshot UX Flow

### Screenshot 1: 🎯 Upload Modal - Initial State

**Route**: `/(app)/evidence`
**Action**: Click "Upload Evidence" button

**UI Elements to Capture**:
- ✅ **Drag-and-drop zone** with gradient background + upload icon
- ✅ **"Select File" button** (gradient: cyan → blue → yellow)
- ✅ **File type hints** (PDF, PNG, JPG, TIFF, DOCX, TXT...)
- ✅ **Modal overlay** with blur backdrop (rgba(4, 8, 15, 0.82))
- ✅ **Close button** (X icon, top-right corner)
- ✅ **Keyboard shortcuts** mentioned in header

**CSS Classes**:
```css
.upload-modal-overlay         /* Backdrop with radial gradients */
.upload-modal-card            /* Main modal container */
.upload-modal-zone            /* Drag-and-drop area */
.upload-modal-select          /* Gradient button */
```

**Component**: [EvidenceUploadModal.svelte](src/lib/components/evidence/EvidenceUploadModal.svelte) (lines 233-254)

---

### Screenshot 2: ⚙️ Pipeline Progress - Processing

**Route**: `/(app)/evidence` (modal still open)
**Action**: Select file and click "Upload and process"

**UI Elements to Capture**:
- ✅ **Selected file card** (file icon, name, size, type)
- ✅ **"Change" button** to reselect file
- ✅ **8 pipeline stages** with status icons:
  - **Pending**: Gray dot (opacity 40%)
  - **Running**: Blue loader icon (spinning animation)
  - **Done**: Green checkmark
  - **Error**: Red alert icon (if failed)
- ✅ **Stage descriptions**:
  1. MinIO Upload (SHA-256 hash + object storage)
  2. Database Record (PostgreSQL evidence row)
  3. Text Extraction (pdf-parse → OCR fallback)
  4. Legal Chunking (ARTICLE/SECTION/§ hierarchy)
  5. Embedding (768d embeddinggemma via gRPC)
  6. Dual Vector Storage (pgvector + Qdrant)
  7. Entity Extraction (LLM + regex)
  8. Forensics + Summary (PII + summarization)
- ✅ **Progress indicators** (1/8, 2/8... 8/8)
- ✅ **Optional toggles** (Search indexing, Visual review)

**CSS Classes**:
```css
.upload-modal-file-card       /* Selected file info */
stageStatuses[i] === 'running'  /* Blue accent with loader */
stageStatuses[i] === 'done'     /* Green with checkmark */
```

**Component**: [EvidenceUploadModal.svelte](src/lib/components/evidence/EvidenceUploadModal.svelte) (lines 286-313)

**State Variables**:
```typescript
currentStage: number           // Index of currently running stage (0-7)
stageStatuses: ('pending' | 'running' | 'done' | 'error')[]
isUploading: boolean
```

---

### Screenshot 3: ✅ Results - Chunks Collapsed

**Route**: `/evidence/[evidenceId]` or embedded in modal
**Action**: View upload results after pipeline completes

**UI Elements to Capture**:
- ✅ **Success header**:
  - Green checkmark icon
  - "Evidence Uploaded Successfully" title
  - File name subtitle
  - Download/preview link (external link icon)
- ✅ **Extracted Text section**:
  - File-text icon
  - Character count (e.g., "1,234 characters")
  - Preview (500 chars max, scrollable)
- ✅ **Document Chunks section**:
  - Layers icon
  - Chunk count (e.g., "12 chunks")
  - **Grid layout** (280px min-width, auto-fill)
- ✅ **Chunk cards** (collapsed state):
  - **Type badge** (ARTICLE = cyan, SECTION = orange, SUBSECTION = purple, TEXT = gray)
  - **Chevron-down icon** (expand button)
  - **Preview text** (150 chars, truncated with "...")
  - **Hover effect** (brightness 1.1)
- ✅ **GPU Analysis section** (if available):
  - Zap icon
  - Similar evidence (top 5 with similarity scores)
  - Cluster assignment (cluster ID + total count)
  - Case embedding status (checkmark if updated)
- ✅ **Action links**:
  - "Upload More Evidence" (back button)
  - "View Details" (eye icon)
  - "Back to Case" (briefcase icon)

**CSS Classes**:
```css
.results-container            /* Main results wrapper */
.results-header               /* Success header with gradient */
.section                      /* Each content section */
.chunks-grid                  /* Grid layout for chunks */
.chunk-card                   /* Individual chunk (collapsed) */
.chunk-type-badge             /* ARTICLE/SECTION/§ badge */
.chunk-expand-btn             /* Chevron icon button */
```

**Component**: [EvidenceUploadResults.svelte](src/lib/components/evidence/EvidenceUploadResults.svelte) (lines 100-155)

**Props**:
```typescript
evidenceId: string
fileName: string
extractedText: string
chunks: Array<{ type, content, start, end }>
gpuAnalysis: { similarEvidence, clusterAssignment, ... }
previewUrl: string              // MinIO presigned URL
```

---

### Screenshot 4: 🔍 Expanded Chunk - Full Content

**Route**: `/evidence/[evidenceId]` (same as Screenshot 3)
**Action**: Click chevron-down icon on any chunk

**UI Elements to Capture**:
- ✅ **Chunk card** (expanded state):
  - **Chevron-up icon** (collapse button, rotated from down)
  - **Type badge** (highlighted/active)
  - **Preview text** (150 chars, still visible above)
- ✅ **Expanded content section**:
  - **Full chunk text** (max-height 200px, scrollable)
  - **Character position metadata**:
    - Map-pin icon
    - "Characters 0–150" (start-end range)
  - **Scrollbar** (if text > 200px height)
  - **Dark background** (rgba(0, 0, 0, 0.2))
  - **Border** (1px solid rgba(120, 160, 220, 0.1))
- ✅ **Hover states**:
  - Brightness filter on chunk card
  - Chevron color change (rgba(126, 231, 255, 0.6) → 1.0)

**CSS Classes**:
```css
.chunk-card.expanded          /* Expanded state (if using class) */
expandedChunks.has(idx) === true  /* Svelte 5 $state Set */
.chunk-expanded               /* Expanded content container */
.chunk-full-text              /* Full text with scroll */
.chunk-meta                   /* Metadata section */
.meta-item                    /* Individual metadata item */
```

**Component**: [EvidenceUploadResults.svelte](src/lib/components/evidence/EvidenceUploadResults.svelte) (lines 138-150)

**State Management** (Svelte 5 runes):
```typescript
let expandedChunks = $state<Set<number>>(new Set());

function toggleChunk(index: number) {
  if (expandedChunks.has(index)) {
    expandedChunks.delete(index);
  } else {
    expandedChunks.add(index);
  }
  expandedChunks = expandedChunks; // Trigger reactivity
}
```

**Conditional Rendering**:
```svelte
{#if expandedChunks.has(idx)}
  <div class="chunk-expanded">
    <div class="chunk-full-text">{chunk.content}</div>
    {#if chunk.start !== undefined && chunk.end !== undefined}
      <div class="chunk-meta">
        <span class="meta-item">
          <Icon name="map-pin" class="w-3 h-3" />
          Characters {chunk.start}–{chunk.end}
        </span>
      </div>
    {/if}
  </div>
{/if}
```

---

## 🗄️ Database Schema (Drizzle ORM 0.44)

**Table**: `evidence` (PostgreSQL)

```typescript
export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey(),
  caseId: uuid('case_id'),
  title: varchar('title', { length: 255 }),
  description: text('description'),

  // File storage
  fileUrl: text('file_url'),        // MinIO presigned URL
  fileName: varchar('file_name'),
  fileSize: integer('file_size'),
  hash: varchar('hash'),            // SHA-256
  mimeType: varchar('mime_type'),

  // Processed data
  extractedText: text('extracted_text'),
  entities: jsonb('entities'),       // Extracted entities
  keywords: jsonb('keywords'),
  embedding: vector('embedding', { dimensions: 768 }),

  // AI analysis
  aiAnalysis: jsonb('ai_analysis'),  // GPU analysis results
  aiSummary: text('ai_summary'),
  aiTags: jsonb('ai_tags'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  uploadedAt: timestamp('uploaded_at'),
});
```

**Insert Example**:
```typescript
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres';

const [newEvidence] = await db.insert(evidence).values({
  title: 'contract-signed.pdf',
  description: 'Signed employment contract',
  caseId: 'c9b79f5d-...',
  fileName: 'contract-signed.pdf',
  fileSize: 524288,
  hash: 'a3f8b2...',
  fileUrl: 'http://localhost:9000/evidence/...',
  mimeType: 'application/pdf',
  extractedText: '...',
  entities: [{ type: 'PERSON', text: 'John Doe', ... }],
  embedding: [0.123, -0.456, ...],  // 768-dim array
}).returning();
```

---

## 🚀 API Endpoint

**POST** `/api/evidence/upload`

**Request** (multipart/form-data):
```typescript
{
  file: File,                      // Binary file data
  caseId?: string,                 // UUID (optional)
  title?: string,                  // Max 256 chars
  description?: string,            // Max 10,000 chars
  evidenceType?: 'photo' | 'document' | 'video' | ...
}
```

**Response** (JSON):
```typescript
{
  id: string,                      // Evidence UUID
  jobId: string,                   // Processing job UUID
  hash: string,                    // SHA-256 hash
  status: 'success',
  stages: {
    upload: 'done',
    db: 'done',
    ocr: 'done',
    chunking: 'done',
    embedding: 'done',
    vector: 'done',
    entities: 'done',
    forensics: 'done'
  }
}
```

**GET** `/api/evidence/[id]`

**Response**:
```typescript
{
  id: string,
  title: string,
  fileName: string,
  fileUrl: string,                 // MinIO presigned URL
  extractedText: string,
  chunks: Array<{
    type: 'ARTICLE' | 'SECTION' | 'SUBSECTION' | 'TEXT',
    content: string,
    start: number,
    end: number
  }>,
  entities: Array<{ type, text, start, end }>,
  gpuAnalysis: {
    similarEvidence: Array<{ id, score }>,
    clusterAssignment: number,
    clusterCount: number,
    caseEmbeddingUpdated: boolean
  }
}
```

---

## 📦 Component Files

| Component | Path | Lines | Purpose |
|-----------|------|-------|---------|
| **EvidenceUploadModal** | `src/lib/components/evidence/EvidenceUploadModal.svelte` | 649 | Main modal with upload UI |
| **EvidenceUploadResults** | `src/lib/components/evidence/EvidenceUploadResults.svelte` | 609 | Results display with expandable chunks |
| **EvidenceUploadButton** | `src/lib/components/evidence/EvidenceUploadButton.svelte` | ~50 | Trigger button |
| **EvidenceUploadProgress** | `src/lib/components/evidence/EvidenceUploadProgress.svelte` | ~100 | Progress bar component |

---

## 🎨 Color Palette

**Chunk Type Colors**:
```css
ARTICLE:    rgba(126, 231, 255, 0.14)  /* Cyan */
SECTION:    rgba(255, 212, 121, 0.14)  /* Orange */
SUBSECTION: rgba(200, 180, 255, 0.14)  /* Purple */
TEXT:       rgba(200, 200, 200, 0.08)  /* Gray */
```

**Status Colors**:
```css
Success:  rgba(126, 231, 255, ...)     /* Cyan/Teal */
Warning:  rgba(255, 212, 121, ...)     /* Yellow/Orange */
Error:    rgba(255, 121, 121, ...)     /* Red */
Pending:  rgba(200, 200, 200, ...)     /* Gray */
```

**Gradients**:
```css
/* Upload button */
background: linear-gradient(135deg, #7ee7ff 0%, #53b7ff 45%, #ffd479 100%);

/* Modal overlay */
background:
  radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 26%),
  radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.12), transparent 24%),
  rgba(4, 8, 15, 0.82);
```

---

## ✅ Verification Checklist

Before taking screenshots, verify:

- [x] Dev server running on `http://localhost:5173`
- [x] Evidence upload route accessible (`/(app)/evidence`)
- [x] Test image available in Pictures directory
- [x] Database connection working (PostgreSQL on port 5434)
- [x] MinIO service running (port 9000)
- [x] Qdrant service running (port 6333)
- [x] Ollama service running (port 11434) for embeddings

**Quick Health Check**:
```bash
curl http://localhost:5173/api/health
curl http://localhost:9000/minio/health/ready
curl http://localhost:6333/
curl http://localhost:11434/api/tags
```

---

## 🐛 Troubleshooting

**Modal not appearing**:
- Check console for errors
- Verify `isOpen` state prop
- Ensure bits-ui Dialog is not causing SSR TDZ bug

**Upload fails**:
- Check file size (<100MB)
- Verify allowed file types
- Check MinIO connection
- Review server logs

**Chunks not expandable**:
- Verify `expandedChunks` Set is reactive
- Check `toggleChunk()` function
- Ensure chevron icons are clickable

**GPU analysis missing**:
- This runs in background (Stage 9)
- Check `/api/evidence/[id]/gpu-analyze` endpoint
- May not complete immediately

---

**Created**: April 12, 2026
**Status**: ✅ Production Ready
**Tech Stack**: SvelteKit 2 + Svelte 5 + Drizzle ORM 0.44 + MinIO + Qdrant
