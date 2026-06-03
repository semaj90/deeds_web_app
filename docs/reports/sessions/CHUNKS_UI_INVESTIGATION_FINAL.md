# Evidence Chunks UI Investigation — Final Report

**Date**: April 12, 2026
**Status**: **Investigation Complete** — Chunks UI location identified
**Evidence ID**: `26c42a93-1a4f-47b2-b439-ea6e3e9d72e0`

---

## TL;DR — Where to Find the Chunks UI

**Component**: `EvidenceUploadResults.svelte` (lines 125-151)
**Used In**: `EvidencePrimaryUpload.svelte` (upload flow component)
**Page**: `/evidence` (evidence list/upload page)
**Trigger**: After uploading a file through the upload form

**The chunks UI appears in the upload flow AFTER processing, not on the evidence detail pages.**

---

## Investigation Summary

### What We Were Looking For
- Expandable chunks UI with click-to-expand functionality
- Color-coded type badges (ARTICLE=cyan, SECTION=orange, SUBSECTION=purple)
- Chevron icons for expand/collapse
- Component: `EvidenceUploadResults.svelte`

### URLs Tested

| URL | Status | Result |
|-----|--------|--------|
| `/evidence/{id}` | ❌ 404 | Route doesn't exist |
| `/document-analysis/{id}` | ✅ 200 | Loads but NO chunks UI |
| `/audio-analysis/{id}` | ✅ 200 | Professional editor, NO chunks UI |
| `/video-analysis/{id}` | ✅ 200 | Professional editor, NO chunks UI |
| `/evidence` | ✅ 200 | Evidence list page, test evidence NOT visible |

### Key Findings

1. **No `/evidence/[id]` route exists** — Individual evidence viewing uses type-specific analysis routes
2. **Analysis routes don't show chunks** — They're professional editors (audio/video/document analysis) for editing/annotation, not for viewing upload results
3. **`EvidenceUploadResults` only used in upload flow** — Found in `EvidencePrimaryUpload.svelte`, which appears on `/evidence` page
4. **Test evidence not in list** — Our database-seeded evidence doesn't appear on `/evidence` page (might require specific filtering/status)

---

## Component Architecture

### Component Hierarchy
```
/evidence (+page.svelte)
  └── EvidencePrimaryUpload.svelte
       └── EvidenceUploadResults.svelte  ← CHUNKS UI HERE
            ├── Expandable chunks
            ├── Color-coded badges
            └── Chevron expand/collapse
```

### Why Analysis Routes Don't Show Chunks

**Analysis Routes Purpose**: Professional editing interfaces
- `/audio-analysis/[id]` — AudioAnalysisView.svelte (transcription editor)
- `/video-analysis/[id]` — VideoAnalysisView.svelte (frame analysis)
- `/document-analysis/[id]` — Document reader with panels

**These are NOT for viewing upload results** — they're for working with evidence post-upload.

### Upload Flow (Where Chunks Appear)

```
User clicks "Upload" on /evidence page
  ↓
EvidencePrimaryUpload component renders
  ↓
User selects file
  ↓
Form submission → 8-stage processing pipeline
  ↓
Processing complete → metadata.chunks populated
  ↓
EvidenceUploadResults component renders
  ↓
✅ CHUNKS UI VISIBLE (expandable, color-coded)
```

---

## Test Evidence Status

### Database
```sql
SELECT id, title, type, jsonb_array_length(metadata->'chunks') as chunk_count
FROM evidence
WHERE id = '26c42a93-1a4f-47b2-b439-ea6e3e9d72e0';
```

**Result**:
```
id: 26c42a93-1a4f-47b2-b439-ea6e3e9d72e0
title: Service Agreement with Structured Chunks
type: document
chunk_count: 8 ✅
```

**Chunks in metadata**: ✅ 8 chunks (3 ARTICLE, 3 SECTION, 2 SUBSECTION)

### Why Not Visible on `/evidence` Page

**Possible reasons**:
1. Evidence list filters by `status` (our test evidence has status = NULL)
2. Evidence list filters by `case_id` active case
3. Evidence list shows only user-uploaded items
4. Evidence list requires specific metadata flags

**Solution**: Update test evidence to match display criteria

---

## How to Actually See the Chunks UI

### Option 1: Upload a Real File (Recommended)

1. Go to http://localhost:5173/evidence
2. Click upload button
3. Select a PDF/document file
4. Wait for processing (8-stage pipeline)
5. Chunks UI appears in `EvidenceUploadResults` component
6. Click chevrons to expand/collapse chunks

### Option 2: Update Test Evidence to Match Filters

```sql
-- Set status to make it visible
UPDATE evidence
SET status = 'active'  -- or whatever status the list filters for
WHERE id = '26c42a93-1a4f-47b2-b439-ea6e3e9d72e0';

-- Verify it has case_id
UPDATE evidence
SET case_id = (SELECT id FROM cases WHERE title LIKE '%Test%' LIMIT 1)
WHERE id = '26c42a93-1a4f-47b2-b439-ea6e3e9d72e0'
AND case_id IS NULL;
```

### Option 3: Mock the Upload Results State

Create a demo page that directly renders `EvidenceUploadResults`:

```svelte
<script>
  import EvidenceUploadResults from '$lib/components/evidence/EvidenceUploadResults.svelte';

  const chunks = [
    { type: 'ARTICLE', identifier: 'Article I', content: '...', page: 1, confidence: 0.95 },
    // ... more chunks
  ];
</script>

<EvidenceUploadResults
  chunks={chunks}
  evidenceId="26c42a93-1a4f-47b2-b439-ea6e3e9d72e0"
  fileName="service_agreement.pdf"
/>
```

---

## Chunks UI Specification (from EvidenceUploadResults.svelte)

### Component Props
```typescript
{
  evidenceId?: string;
  fileName?: string;
  extractedText?: string;
  chunks?: any[];         // ← Array of chunk objects
  gpuAnalysis?: any;
  caseId?: string;
  previewUrl?: string;
  onBack?: () => void;
}
```

### Chunk Object Structure
```typescript
{
  type: 'ARTICLE' | 'SECTION' | 'SUBSECTION';
  identifier: string;   // e.g., "Article I"
  content: string;      // Full text
  page: number;
  confidence: number;   // 0.0 - 1.0
  start?: number;       // Optional character position
  end?: number;
}
```

### Color Coding (from `getChunkTypeColor()`)
```typescript
switch (type?.toUpperCase()) {
  case 'ARTICLE':
    return 'rgba(126, 231, 255, 0.14)';  // Cyan
  case 'SECTION':
    return 'rgba(255, 212, 121, 0.14)';  // Orange
  case 'SUBSECTION':
    return 'rgba(200, 180, 255, 0.14)';  // Purple
  default:
    return 'rgba(200, 200, 200, 0.08)';  // Gray
}
```

### State Management
```typescript
let expandedChunks = $state<Set<number>>(new Set());

function toggleChunk(index: number) {
  if (expandedChunks.has(index)) {
    expandedChunks.delete(index);
  } else {
    expandedChunks.add(index);
  }
  expandedChunks = expandedChunks; // trigger reactivity
}
```

### Rendering Logic (lines 125-151)
```svelte
{#each chunks as chunk, idx}
  <div class="chunk-item" style:background={getChunkTypeColor(chunk.type)}>
    <!-- Header with badge and expand button -->
    <div class="chunk-header">
      <div class="chunk-badge">
        <span class="badge-text">{chunk.type.toUpperCase()}</span>
      </div>
      <button onclick={() => toggleChunk(idx)} aria-label={...}>
        <Icon name={expandedChunks.has(idx) ? 'chevron-up' : 'chevron-down'} />
      </button>
    </div>

    <!-- Preview (always visible) -->
    <div class="chunk-preview">
      <p>{getPreviewText(chunk.content, 150)}</p>
    </div>

    <!-- Expanded content (toggle) -->
    {#if expandedChunks.has(idx)}
      <div class="chunk-expanded">
        <div class="chunk-full-text">{chunk.content}</div>
      </div>
    {/if}
  </div>
{/each}
```

---

## Screenshots Captured

| Screenshot | Description | Path |
|------------|-------------|------|
| `quick-test-01-initial.png` | /evidence/[id] 404 error | ✅ |
| `correct-url-initial.png` | /document-analysis/[id] loaded (no chunks) | ✅ |
| `evidence-page-list.png` | /evidence page (test evidence not visible) | ✅ |

**Missing**: Actual chunks UI screenshots (because UI not accessible via our test approach)

---

## Recommendations

### Immediate Actions

1. **Create standalone demo page** for `EvidenceUploadResults`:
   ```
   /demos/chunks-ui/+page.svelte
   ```
   Renders component directly with test chunks.

2. **Update test evidence status**:
   ```sql
   UPDATE evidence
   SET status = 'processed', verified = true
   WHERE id = '26c42a93-1a4f-47b2-b439-ea6e3e9d72e0';
   ```

3. **Test real upload flow**:
   - Upload actual PDF through `/evidence`
   - Capture screenshots during processing
   - Document full upload → chunks UI flow

### Documentation Needs

1. **Upload Flow Documentation** — Map full 8-stage pipeline
2. **Component Integration Guide** — Where/how to use EvidenceUploadResults
3. **Chunks Data Structure** — Formal schema for `metadata.chunks`
4. **Evidence List Filters** — What determines evidence visibility

---

## Lessons Learned

### Routing Assumptions
- **Assumed**: `/evidence/[id]` route exists for viewing individual evidence
- **Reality**: Evidence viewing uses type-specific analysis routes OR appears in upload flow

### Component Usage
- **Assumed**: Chunks UI visible on evidence detail pages
- **Reality**: Chunks UI only appears in upload results flow (EvidencePrimaryUpload)

### Analysis Routes Purpose
- **Assumed**: Analysis routes show all evidence data including chunks
- **Reality**: Analysis routes are professional editors for working with evidence, not upload results viewers

### Test Data Visibility
- **Assumed**: Database-seeded evidence appears same as uploaded evidence
- **Reality**: Evidence list has filters (status, case, etc.) that exclude test data

---

## Next Steps

**Option A: Create Demo Page** (Fastest to see chunks UI)
```bash
# Create /demos/chunks-ui route
# Import EvidenceUploadResults
# Pass test chunks directly
```

**Option B: Fix Test Evidence** (Make it appear on /evidence page)
```sql
UPDATE evidence
SET status = 'processed',
    verified = true,
    uploaded_by = (SELECT id FROM users LIMIT 1)
WHERE id = '26c42a93-1a4f-47b2-b439-ea6e3e9d72e0';
```

**Option C: Test Real Upload** (Full integration test)
```
1. Go to /evidence
2. Upload PDF
3. Wait for processing
4. Chunks UI appears
5. Capture screenshots
```

---

## Summary

✅ **Chunks UI location identified**: `EvidenceUploadResults.svelte`
✅ **Integration point found**: `EvidencePrimaryUpload.svelte` on `/evidence` page
✅ **Test data created**: 8 chunks in database (26c42a93-1a4f-47b2-b439-ea6e3e9d72e0)
✅ **Component spec documented**: Props, state, rendering logic
❌ **Chunks UI not accessible**: Test evidence doesn't appear on evidence list
❌ **Screenshots incomplete**: No visual confirmation of expandable UI

**Recommended Next Action**: Create standalone demo page to render chunks UI directly with test data.

---

## Files Created This Session

| File | Purpose | Status |
|------|---------|--------|
| `seed-chunks.cjs` | Seed test evidence | ✅ Working |
| `test-correct-url.mjs` | Test document-analysis route | ✅ Complete |
| `test-evidence-page.mjs` | Test evidence list page | ✅ Complete |
| `quick-chunks-test.mjs` | Quick UI check | ✅ Complete |
| `EVIDENCE_CHUNKS_UI_COMPLETE.md` | Initial guide | ✅ |
| `CHUNKS_UI_INVESTIGATION_FINAL.md` | This report | ✅ |

**Total**: 6 new files, 1,800+ lines of investigation + documentation
