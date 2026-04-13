# Evidence Chunks UI — Complete Guide

**Date**: April 12, 2026
**Status**: ✅ **READY TO TEST**
**Evidence Created**: `26c42a93-1a4f-47b2-b439-ea6e3e9d72e0`

---

## Summary

Successfully created test evidence with **8 structured chunks** to demonstrate the expandable chunks UI from `EvidenceUploadResults.svelte`.

---

## What Was Created

### Test Evidence
```
Evidence ID: 26c42a93-1a4f-47b2-b439-ea6e3e9d72e0
Title: Service Agreement with Structured Chunks
File: service_agreement.pdf
Type: document
Chunks: 8 (stored in metadata.chunks)
```

### Chunk Breakdown
| Type | Count | Color | Identifier Examples |
|------|-------|-------|-------------------|
| ARTICLE | 3 | Cyan (rgba(126, 231, 255, 0.14)) | Article I, Article IV, Article VI |
| SECTION | 3 | Orange (rgba(255, 212, 121, 0.14)) | Section 2.01, Section 2.02, Section 5.01 |
| SUBSECTION | 2 | Purple (rgba(200, 180, 255, 0.14)) | Section 3.01(a), Section 4.03(b) |

**Total**: 8 chunks across 7 pages

---

## Chunk Structure (Example)

```json
{
  "type": "ARTICLE",
  "identifier": "Article I",
  "content": "ARTICLE I - GENERAL PROVISIONS\n\nSection 1.01 Purpose and Scope...",
  "page": 1,
  "confidence": 0.95
}
```

---

## How to View the Chunks UI

### Option 1: Direct Evidence URL (Recommended)
```
http://localhost:5173/evidence/26c42a93-1a4f-47b2-b439-ea6e3e9d72e0
```

**Expected UI Elements**:
1. **Collapsed chunks** — 8 chunks with preview text (truncated to 150 chars)
2. **Color-coded badges** — ARTICLE (cyan), SECTION (orange), SUBSECTION (purple)
3. **Expand buttons** — Chevron icons (`chevron-down` → `chevron-up`)
4. **Click-to-expand** — Click any chunk to see full text
5. **Multiple expand** — Multiple chunks can be expanded simultaneously

### Option 2: Via Evidence List
```
http://localhost:5173/evidence
```
Search for "Service Agreement" or filter by recent uploads.

### Option 3: Via Case
```
http://localhost:5173/cases/713334f0-1161-42df-8b69-899f798ab275
```
(The test case containing the evidence)

---

## Expected UI Behavior

### Component: `EvidenceUploadResults.svelte` (lines 125-151)

```svelte
<!-- Chunk item (expandable) -->
{#each chunks as chunk, idx}
  <div class="chunk-item" style:background={getChunkTypeColor(chunk.type)}>
    <div class="chunk-header">
      <div class="chunk-badge">
        <span class="badge-text">{chunk.type.toUpperCase()}</span>
      </div>
      <button
        class="chunk-expand-btn"
        onclick={() => toggleChunk(idx)}
        aria-label={expandedChunks.has(idx) ? 'Collapse' : 'Expand'}
      >
        <Icon name={expandedChunks.has(idx) ? 'chevron-up' : 'chevron-down'} />
      </button>
    </div>

    <!-- Preview (always visible) -->
    <div class="chunk-preview">
      <p>{getPreviewText(chunk.content, 150)}</p>
    </div>

    <!-- Expanded content (toggle on click) -->
    {#if expandedChunks.has(idx)}
      <div class="chunk-expanded">
        <div class="chunk-full-text">{chunk.content}</div>
      </div>
    {/if}
  </div>
{/each}
```

### User Interactions

1. **View collapsed** — All chunks show preview text only
2. **Click expand button** — Chunk expands to show full text
3. **Click again** — Chunk collapses back to preview
4. **Expand multiple** — No limit on simultaneously expanded chunks
5. **Visual feedback** — Color-coded backgrounds for chunk types

---

## Database Verification

```sql
-- View evidence chunks
SELECT
  id,
  title,
  jsonb_array_length(metadata->'chunks') as chunk_count,
  (metadata->'chunks'->0->>'type') as first_chunk_type,
  (metadata->'chunks'->0->>'identifier') as first_chunk_id
FROM evidence
WHERE id = '26c42a93-1a4f-47b2-b439-ea6e3e9d72e0';
```

**Expected Result**:
```
id: 26c42a93-1a4f-47b2-b439-ea6e3e9d72e0
title: Service Agreement with Structured Chunks
chunk_count: 8
first_chunk_type: ARTICLE
first_chunk_id: Article I
```

---

## Scripts Created

### 1. `seed-chunks.cjs` (Seeding Script)
**Purpose**: Creates test evidence with 8 structured chunks

**Usage**:
```bash
node scripts/tests/seed-chunks.cjs
```

**Output**:
```
✅ Created evidence: Service Agreement with Structured Chunks
   ID: 26c42a93-1a4f-47b2-b439-ea6e3e9d72e0
   Chunks: 8
   Types: ARTICLE (3), SECTION (3), SUBSECTION (2)
```

### 2. `seed-evidence-with-chunks.mjs` (ESM Version)
**Purpose**: Same as above but ESM format (for future use)

**Note**: Currently has compatibility issues, use `.cjs` version instead.

### 3. `screenshot-evidence-chunks.mjs` (Playwright Script)
**Purpose**: Captures screenshots of expandable chunks UI

**Usage**:
```bash
node scripts/tests/screenshot-evidence-chunks.mjs
```

**Screenshots** (planned):
1. `01-chunks-collapsed.png` — All chunks collapsed
2. `02-first-chunk-expanded.png` — ARTICLE chunk expanded
3. `03-multiple-chunks-expanded.png` — Multiple chunks expanded
4. `04-chunk-types-visible.png` — Scrolled view showing types
5. `05-hover-state.png` — Hover state on expand button
6. `06-all-chunks-expanded.png` — All chunks expanded
7. `07-full-page.png` — Full page view

---

## Troubleshooting

### Issue: Chunks not visible on evidence page

**Possible causes**:
1. Evidence page doesn't use `EvidenceUploadResults` component
2. Chunks are in metadata but not being passed to component
3. Component has different prop name for chunks

**Solution**:
- Check which component renders evidence details
- Verify props being passed: `chunks={metadata?.chunks || []}`
- Add `console.log('Chunks:', metadata?.chunks)` to debug

### Issue: Chunks visible but not expandable

**Possible causes**:
1. Click handler not wired (`onclick={() => toggleChunk(idx)}`)
2. Chevron icons not rendering
3. CSS preventing click events

**Solution**:
- Check browser console for errors
- Verify Icon component is imported
- Inspect element to check CSS `pointer-events`

### Issue: Wrong colors for chunk types

**Expected** (from `getChunkTypeColor` function):
- ARTICLE: `rgba(126, 231, 255, 0.14)` (cyan)
- SECTION: `rgba(255, 212, 121, 0.14)` (orange)
- SUBSECTION: `rgba(200, 180, 255, 0.14)` (purple)
- DEFAULT: `rgba(200, 200, 200, 0.08)` (gray)

**Solution**:
- Check `chunk.type` is uppercase (ARTICLE not article)
- Verify `getChunkTypeColor()` function is defined
- Inspect element to see actual applied color

---

## Upload Flow Context (from session notes)

### What We Discovered

**Upload Flow Paths**:
1. **EvidenceUploadModal** → 8-stage pipeline → OCR form (captured in previous screenshots)
2. **EvidencePrimaryUpload** → Form submission → **EvidenceUploadResults** with chunks (THIS is what we're testing now)

**The Missing Link** (Now Found!):
- Upload succeeds → OCR form appears → Complete OCR → Chunks appear in results
- **OR**: View existing evidence with chunks in metadata (✅ This is what we created!)

### Previous Screenshots (OCR Form)
- Captured upload form and OCR configuration
- Did NOT capture expandable chunks UI

### Current Goal
- Capture expandable chunks UI from `EvidenceUploadResults.svelte`
- Demonstrate ARTICLE/SECTION/SUBSECTION color coding
- Show expand/collapse functionality

---

## Success Criteria

✅ Evidence created with 8 chunks in metadata
✅ Chunks have proper structure (type, identifier, content, page, confidence)
✅ 3 chunk types represented (ARTICLE, SECTION, SUBSECTION)
✅ Database verified (chunk_count = 8)

**Next Step**: Visit evidence URL and capture screenshots of:
- Collapsed chunks with color-coded badges
- Expanded chunks showing full text
- Chevron icon state changes
- Multiple expanded chunks simultaneously

---

## Quick Commands

```bash
# View evidence in browser
open http://localhost:5173/evidence/26c42a93-1a4f-47b2-b439-ea6e3e9d72e0

# Re-run seeding (creates NEW evidence)
node scripts/tests/seed-chunks.cjs

# Check database
node -e "const {Pool}=require('pg'); const p=new Pool({connectionString:'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'}); p.query('SELECT id,title,jsonb_array_length(metadata->\"chunks\") FROM evidence WHERE metadata->\"chunks\" IS NOT NULL').then(r=>{console.log(r.rows); p.end()});"

# Capture screenshots (Playwright)
node scripts/tests/screenshot-evidence-chunks.mjs
```

---

## Summary

**Mission**: Capture expandable chunks UI from `EvidenceUploadResults.svelte`

**Status**: ✅ **Test data created, ready to screenshot**

**Evidence ID**: `26c42a93-1a4f-47b2-b439-ea6e3e9d72e0`

**Chunks**: 8 structured chunks (3 ARTICLE, 3 SECTION, 2 SUBSECTION)

**URL**: http://localhost:5173/evidence/26c42a93-1a4f-47b2-b439-ea6e3e9d72e0

**Next Action**: Open URL in browser → Take screenshots → Document expandable UI behavior

---

## Component Reference

**File**: `sveltekit-frontend/src/lib/components/evidence/EvidenceUploadResults.svelte`

**Key Lines**:
- Line 25: `let expandedChunks = $state<Set<number>>(new Set())`
- Line 27-34: `toggleChunk(index)` function
- Line 40-50: `getChunkTypeColor(type)` color mapping
- Lines 125-151: Expandable chunk rendering

**Props**:
```typescript
{
  evidenceId?: string;
  fileName?: string;
  extractedText?: string;
  chunks?: any[];        // ← This is what we seeded!
  gpuAnalysis?: any;
  caseId?: string;
  previewUrl?: string;
  onBack?: () => void;
}
```

**Chunk Type**:
```typescript
{
  type: 'ARTICLE' | 'SECTION' | 'SUBSECTION';
  identifier: string;   // e.g., "Article I", "Section 2.01"
  content: string;      // Full text
  page: number;         // Page number
  confidence: number;   // 0.0 - 1.0
}
```
