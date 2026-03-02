# Evidence System - Next Steps

**Generated:** March 1, 2026
**Priority:** HIGH
**Files:** evidence upload/search/analysis pipeline, multimodal tools

---

## 🔥 Critical (Do First)

### 1. Evidence Audit Logging
**File:** `src/routes/api/evidence/+server.ts`
**Impact:** Legal compliance requirement (chain of custody)
**Effort:** 2 hours

**Schema:**
```sql
CREATE TABLE evidence_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence(id),
  user_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'uploaded', 'viewed', 'analyzed', 'tagged', 'deleted', 'exported'
  details JSONB, -- { analysis_type, tags_added, export_format, etc }
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_evidence_audit_evidence_id ON evidence_audit_log(evidence_id);
CREATE INDEX idx_evidence_audit_user_id ON evidence_audit_log(user_id);
CREATE INDEX idx_evidence_audit_timestamp ON evidence_audit_log(timestamp);
```

**Audit Helper:**
```typescript
// src/lib/server/evidence/audit.ts
export async function auditEvidenceAction(
  evidenceId: string,
  userId: string,
  action: string,
  details?: any,
  request?: Request
) {
  await db.insert(evidenceAuditLog).values({
    evidenceId,
    userId,
    action,
    details,
    ipAddress: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip'),
    userAgent: request?.headers.get('user-agent')
  });
}
```

**Integration Points:**
- `/api/evidence/upload` → audit 'uploaded'
- `/api/evidence/[id]` GET → audit 'viewed'
- `/api/evidence/analysis` → audit 'analyzed'
- `/api/evidence/[id]` DELETE → audit 'deleted'
- `/api/evidence/[id]/export` → audit 'exported'

---

### 2. Evidence Version History
**Impact:** Track changes to evidence metadata/tags
**Effort:** 2.5 hours

**Schema:**
```sql
CREATE TABLE evidence_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence(id),
  version_number INT NOT NULL,
  title VARCHAR(255),
  description TEXT,
  tags TEXT[],
  metadata JSONB,
  changed_by UUID,
  change_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(evidence_id, version_number)
);
```

**API:**
```typescript
// GET /api/evidence/[id]/versions
// GET /api/evidence/[id]/versions/[version]
// POST /api/evidence/[id]/revert?version=3
```

**Implementation:**
```typescript
// Auto-version on significant changes
export async function updateEvidence(evidenceId: string, updates: any, userId: string, reason?: string) {
  // Get current state
  const [current] = await db.select().from(evidence).where(eq(evidence.id, evidenceId));

  // Get latest version number
  const [latestVersion] = await db.select({ maxVersion: sql<number>`MAX(version_number)` })
    .from(evidenceVersions)
    .where(eq(evidenceVersions.evidenceId, evidenceId));

  const nextVersion = (latestVersion?.maxVersion || 0) + 1;

  // Save version snapshot
  await db.insert(evidenceVersions).values({
    evidenceId,
    versionNumber: nextVersion,
    title: current.title,
    description: current.description,
    tags: current.tags,
    metadata: current.metadata,
    changedBy: userId,
    changeReason: reason
  });

  // Apply updates
  await db.update(evidence).set(updates).where(eq(evidence.id, evidenceId));
}
```

---

### 3. Evidence Tagging Workflow
**Impact:** Better organization and search
**Effort:** 2 hours

**Current State:** MCP tool `evidence:analyze` adds tags automatically
**Gap:** No UI for manual tag management

**UI Components Needed:**
```svelte
<!-- EvidenceTagManager.svelte -->
<script>
  let { evidenceId }: { evidenceId: string } = $props();
  let tags = $state<string[]>([]);
  let newTag = $state('');

  async function addTag() {
    await fetch(`/api/evidence/${evidenceId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: newTag })
    });
    tags.push(newTag);
    newTag = '';
  }

  async function removeTag(tag: string) {
    await fetch(`/api/evidence/${evidenceId}/tags/${tag}`, { method: 'DELETE' });
    tags = tags.filter(t => t !== tag);
  }
</script>

<div class="tag-manager">
  <div class="tags-list">
    {#each tags as tag}
      <span class="tag">
        {tag}
        <button onclick={() => removeTag(tag)}>×</button>
      </span>
    {/each}
  </div>

  <div class="add-tag">
    <input bind:value={newTag} placeholder="Add tag..." />
    <button onclick={addTag}>Add</button>
  </div>

  <div class="auto-tags">
    <button onclick={runAutoTagger}>🤖 Auto-Tag with AI</button>
  </div>
</div>
```

**API Endpoint:**
```typescript
// POST /api/evidence/[id]/tags
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { tag } = await request.json();
  const { id } = params;

  // Add to evidence.tags array
  await db.update(evidence)
    .set({ tags: sql`array_append(tags, ${tag})` })
    .where(eq(evidence.id, id));

  // Mirror to tag stores (CouchDB + Qdrant + pgvector)
  await mirrorTagToStores(id, tag);

  return json({ success: true });
};

// DELETE /api/evidence/[id]/tags/[tag]
export const DELETE: RequestHandler = async ({ params }) => {
  const { id, tag } = params;

  await db.update(evidence)
    .set({ tags: sql`array_remove(tags, ${tag})` })
    .where(eq(evidence.id, id));

  return json({ success: true });
};
```

---

## 🚀 High Priority

### 4. Evidence Relationship Graph
**Impact:** Visualize connections between evidence items
**Effort:** 4 hours

**Current:** `evidence_relationships` table exists but no UI
**Goal:** Interactive graph visualization

**Tech Stack:**
- D3.js or Cytoscape.js for graph rendering
- Neo4j for graph queries (already set up)
- `/api/evidence/[id]/relationships` endpoint

**Component:**
```svelte
<!-- EvidenceRelationshipGraph.svelte -->
<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';

  let { evidenceId }: { evidenceId: string } = $props();
  let graphData = $state<any>(null);
  let svgElement: SVGElement;

  onMount(async () => {
    const res = await fetch(`/api/evidence/${evidenceId}/relationships`);
    graphData = await res.json();
    renderGraph();
  });

  function renderGraph() {
    // D3.js force-directed graph
    const simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.edges).id((d: any) => d.id))
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(400, 300));

    // Render nodes and edges
    // ...
  }
</script>

<svg bind:this={svgElement} width="800" height="600"></svg>
```

---

### 5. Evidence Export Pipeline
**Impact:** Legal discovery compliance
**Effort:** 3 hours

**Formats Needed:**
- ZIP archive with all evidence files
- CSV metadata export
- PDF evidence book (combines all items)
- Bates stamping for legal production

**API:**
```typescript
// POST /api/evidence/export
export const POST: RequestHandler = async ({ request }) => {
  const { evidenceIds, format, includeMetadata, batesStamp } = await request.json();

  switch (format) {
    case 'zip':
      return await exportAsZip(evidenceIds, includeMetadata);
    case 'csv':
      return await exportAsCSV(evidenceIds);
    case 'pdf':
      return await exportAsPDF(evidenceIds, batesStamp);
    default:
      throw error(400, 'Invalid format');
  }
};

async function exportAsZip(ids: string[], metadata: boolean) {
  const archiver = (await import('archiver')).default;
  const archive = archiver('zip');

  for (const id of ids) {
    const [item] = await db.select().from(evidence).where(eq(evidence.id, id));
    const fileStream = await minioClient.getObject('evidence', item.filePath);
    archive.append(fileStream, { name: `${item.title}.${item.fileExtension}` });

    if (metadata) {
      archive.append(JSON.stringify(item, null, 2), { name: `${item.title}.metadata.json` });
    }
  }

  return new Response(archive as any, {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="evidence.zip"' }
  });
}
```

---

### 6. OCR Quality Improvements
**File:** `src/lib/server/ocr/hybrid.ts`
**Impact:** Better text extraction from scanned documents
**Effort:** 2 hours

**Current Issues:**
- OCR confidence scoring implemented (Session 93r28)
- No retry with different settings on low confidence
- No preprocessing (deskew, denoise)

**Improvements:**
```typescript
// Add preprocessing pipeline
import sharp from 'sharp';

async function preprocessForOCR(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .greyscale()
    .normalize() // Auto-contrast
    .sharpen()
    .toBuffer();
}

// Retry with enhanced settings
export async function extractWithRetry(pdfPath: string): Promise<ExtractionResult> {
  let result = await extractTextWithTesseract(pdfPath);

  if (result.confidence < 0.7) {
    console.log('Low confidence, retrying with preprocessing...');
    const preprocessed = await preprocessForOCR(pdfPath);
    result = await extractTextWithTesseract(preprocessed, {
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?\'"()-',
      psm: '6' // Assume single uniform block of text
    });
  }

  return result;
}
```

---

## 📋 Medium Priority

### 7. Evidence Search Filters
**Impact:** Better evidence discovery
**Effort:** 2 hours

**Current:** `/evidence` has semantic search, but limited filters
**Add:**
- Date range filter
- File type filter
- Tag filter (multi-select)
- Case filter
- User filter (uploaded by)

**UI:**
```svelte
<div class="filters">
  <select bind:value={fileTypeFilter} multiple>
    <option value="pdf">PDF</option>
    <option value="image">Image</option>
    <option value="audio">Audio</option>
    <option value="video">Video</option>
  </select>

  <input type="date" bind:value={startDate} placeholder="From date" />
  <input type="date" bind:value={endDate} placeholder="To date" />

  <TagMultiSelect bind:selectedTags={tagFilter} />

  <CaseSelect bind:selectedCase={caseFilter} />
</div>
```

---

### 8. Evidence Redaction Tool
**Impact:** Protect PII in evidence
**Effort:** 5 hours

**Features:**
- Visual PDF redaction (black boxes)
- Auto-detect PII (SSN, CC, addresses) via forensics.ts
- Permanent redaction (creates new file, not reversible)

**Tech Stack:**
- pdf-lib for PDF manipulation
- Canvas API for image redaction
- Existing forensics.ts for PII detection

---

### 9. Evidence Thumbnails
**Impact:** Better visual browsing
**Effort:** 2 hours

**Implementation:**
```typescript
// Generate thumbnail on upload
import sharp from 'sharp';

async function generateThumbnail(filePath: string, mimeType: string): Promise<Buffer> {
  if (mimeType.startsWith('image/')) {
    return sharp(filePath)
      .resize(200, 200, { fit: 'inside' })
      .toBuffer();
  } else if (mimeType === 'application/pdf') {
    // Use pdf-thumbnail library
    const pdfThumbnail = await import('pdf-thumbnail');
    return pdfThumbnail.default(filePath, { width: 200 });
  }

  return Buffer.from(''); // No thumbnail for this type
}

// Upload to MinIO thumbnails bucket
await minioClient.putObject('thumbnails', `${evidenceId}.jpg`, thumbnail);
```

**DB Schema:**
```sql
ALTER TABLE evidence ADD COLUMN thumbnail_path VARCHAR(500);
```

---

### 10. Evidence Bulk Upload
**Impact:** Upload multiple files at once
**Effort:** 3 hours

**UI:**
```svelte
<input type="file" multiple bind:files={selectedFiles} />

<button onclick={uploadAll}>Upload {selectedFiles.length} files</button>

{#each uploadQueue as file}
  <div class="upload-item">
    {file.name} - {file.progress}%
    {#if file.status === 'analyzing'}
      <span>🔍 Analyzing...</span>
    {/if}
  </div>
{/each}
```

**Parallel Upload:**
```typescript
async function uploadAll() {
  const promises = Array.from(selectedFiles).map(file => uploadFile(file));
  await Promise.allSettled(promises);
}
```

---

## Summary

**Total Items:** 10
**Effort:** 29.5 hours
**Priority Breakdown:**
- Critical: 3 items (6.5 hours) - Audit logging, versioning, tagging workflow
- High: 3 items (9 hours) - Relationship graph, export pipeline, OCR improvements
- Medium: 4 items (14 hours) - Filters, redaction, thumbnails, bulk upload

**Database Changes:**
- 2 new tables (evidence_audit_log, evidence_versions)
- 1 column addition (thumbnail_path)

**API Endpoints to Create:**
- `GET /api/evidence/[id]/versions`
- `POST /api/evidence/[id]/revert`
- `POST /api/evidence/[id]/tags`
- `DELETE /api/evidence/[id]/tags/[tag]`
- `GET /api/evidence/[id]/relationships`
- `POST /api/evidence/export`

**Files to Modify:**
- `src/routes/api/evidence/upload/+server.ts` (add audit logging)
- `src/lib/server/ocr/hybrid.ts` (add preprocessing + retry)
- `src/routes/(app)/evidence/+page.svelte` (add filters + bulk upload)
