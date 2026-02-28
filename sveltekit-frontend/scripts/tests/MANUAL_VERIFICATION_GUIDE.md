# Evidence Pipeline - Manual Verification Guide

**Quick Browser Tests** (5 minutes)

All code is implemented - just need to verify it works end-to-end!

---

## ✅ Already Verified (Automated)

- [x] Step 1: Enum migration (16 types in PostgreSQL)
- [x] Step 2: Evidence seeding (12 mixed types)
- [x] Step 3: Build check (`npx vite build` - exit 0)

---

## ⚠️ Needs Manual Verification (Browser)

### Step 4-6: Evidence Upload Tests

**Navigate to:** [http://localhost:5173/evidence](http://localhost:5173/evidence)

#### Test 4: PDF Upload ✓

1. Click **"Upload Evidence"** button
2. Upload any PDF file (or create test.pdf with any content)
3. Select type: **Documentary** (or leave auto-detect)
4. Fill: Title, Case dropdown
5. Click **Upload**

**Expected Results:**
- ✅ Upload succeeds
- ✅ Type auto-detected as `documentary` (if auto-detect used)
- ✅ File appears in evidence list
- ✅ *(Optional)* Check metadata for docling structure extraction

---

#### Test 5: Image Upload ✓

1. Click **"Upload Evidence"** button
2. Upload any image (PNG, JPG)
3. Auto-detect should show: **Photo**
4. Upload

**Expected Results:**
- ✅ Type auto-detected as `photo`
- ✅ *(Optional)* If YOLO + Ollama VLM running, metadata includes vision analysis

**To enable VLM:**
- Ensure Ollama running: `curl http://localhost:11434/api/tags`
- Should have `gemma3-legal:latest` model

---

#### Test 6: Audio Upload ✓

1. Click **"Upload Evidence"** button
2. Upload any audio file (WAV, MP3)
3. Auto-detect should show: **Audio**
4. Upload

**Expected Results:**
- ✅ Type auto-detected as `audio`
- ✅ *(Optional)* If Docling ASR available, metadata includes transcript
- ✅ MCP `transcribe_audio` tool processes file

**Note:** Audio transcription requires Python `docling` package with ASR support.

---

### Step 7: Chat Integration Test ✓

**Navigate to:** Case AI Chat (e.g., `/cases/[case-id]/ai`)

1. Find a case with uploaded evidence
2. Open the **AI Chat** tab
3. Ask: **"What evidence do we have on file?"**
4. Check the response

**Expected Results:**
- ✅ LLM response mentions evidence types
- ✅ Response includes forensic flags (if any)
- ✅ Response mentions entity counts
- ✅ *(Advanced)* Inspect SSE payload for `## Evidence on File` section in prompt

**How to inspect:**
- Open browser DevTools → Network tab
- Filter: `chat` or `sse`
- Click on the SSE request
- View Messages/EventStream
- Look for evidence metadata in system prompt

---

### Step 8: UI Dropdown Test ✓

**Navigate to:** [http://localhost:5173/evidence](http://localhost:5173/evidence)

1. Click **"Upload Evidence"** button
2. Check the **Evidence Type** dropdown

**Expected Groups (16 types total):**

- **📸 Media**
  - Photo
  - Video
  - Audio

- **📄 Documents**
  - Document
  - Documentary

- **⚖️ Legal**
  - Testimonial
  - Demonstrative
  - Witness Statement

- **🔬 Forensic**
  - Forensic
  - Scientific
  - Expert

- **🏠 Physical**
  - Physical
  - Real
  - Digital

- **🔍 Context**
  - Circumstantial
  - Hearsay

**Expected Results:**
- ✅ Dropdown has all 16 types
- ✅ Types are grouped logically
- ✅ Auto-detection works based on MIME type

---

### Step 9: LangExtract Type Refinement Test ✓

**Prerequisites:**
- LangExtract running on port 8095 ✅ (Already UP!)

**Test Case:**

1. Create a text file: `witness-statement.txt`
   ```
   SWORN STATEMENT OF WITNESS

   I, John Doe, hereby swear that on January 15th, 2025,
   I witnessed the following events...

   Signed under oath,
   John Doe
   ```

2. Upload to `/evidence`
3. Initial type: `documentary` (text file)
4. Wait for async processing

**Expected Results:**
- ✅ Type refined to `testimonial` or `witness_statement`
- ✅ Metadata includes `evidenceProfile`:
  - `admissibility_indicators` array
  - `legal_relevance` description
  - `suggested_tags` array
- ✅ Keywords detected: "sworn", "oath", "witness"

**How to verify:**
1. Upload the file
2. Refresh evidence list after ~5 seconds
3. Click evidence item to view details
4. Check **Type** field (should be refined)
5. Expand **Metadata** section
6. Look for `evidenceProfile` object

**LangExtract Status:**
```bash
# Check if running
curl http://localhost:8095/health

# Should return:
{"message":"Phase 66 LangExtract Service","version":"1.0.0"}
```

---

## Quick Verification Checklist

Copy this to verify all steps:

```
## Evidence Pipeline Verification

### Automated Tests
- [x] Enum migration (16 types added)
- [x] Evidence seeding (12 items)
- [x] Build check (exit 0)

### Manual Browser Tests
- [ ] PDF upload → documentary type
- [ ] Image upload → photo type
- [ ] Audio upload → audio type
- [ ] Chat mentions evidence metadata
- [ ] Dropdown shows 16 types in 6 groups
- [ ] LangExtract refines witness statement → testimonial

### Optional Features
- [ ] Docling PDF structure extraction (requires Python docling)
- [ ] VLM image analysis (requires Ollama gemma3-legal VLM)
- [ ] Audio transcription (requires Docling ASR)
- [ ] LangExtract admissibility indicators (requires port 8095)

## Issues Found
- None / [List any issues here]

## Notes
- [Add any observations]
```

---

## Service Status Reference

| Service | Port | Status | Purpose |
|---------|------|--------|---------|
| SvelteKit | 5173 | ✅ UP | Main app |
| PostgreSQL | 5434 | ✅ UP | Database |
| Qdrant | 6333 | ✅ UP | Vector search |
| LangExtract | 8095 | ✅ UP | Type refinement |
| Ollama | 11434 | ✅ UP | LLM + VLM |
| Redis | 6379 | ⚠️ DOWN | Caching (non-critical) |

---

## Troubleshooting

### Upload doesn't work
- Check PostgreSQL: `docker ps | grep postgres`
- Check MinIO: `curl http://localhost:9000/minio/health/live`
- Check server logs: Browser DevTools → Console

### Type not auto-detected
- Check `type-detector.ts` MIME mappings
- Verify file has correct MIME type
- Check upload API response for detected type

### Chat doesn't show evidence
- Verify evidence exists for that case
- Check ACE context assembler fetches evidence
- Inspect SSE chat stream for evidence metadata section

### LangExtract refinement doesn't work
- Ensure service running: `curl http://localhost:8095/health`
- Check upload logs for LangExtract call
- Verify text contains legal keywords (sworn, witness, oath, etc.)

---

**Time to complete:** ~5-10 minutes
**All code implemented:** ✅ Yes
**Just needs:** Browser testing!
