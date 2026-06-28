# LangExtract + Gemma4 Integration Complete

**Date**: June 28, 2026  
**Status**: ✅ WORKING - Tested and verified

## What Was Built

LangExtract is now wired to use **local Gemma4 via llama-server** (OpenAI compatible endpoint) instead of Ollama or cloud APIs.

### 1. Python Bridge Script
**File**: `scripts/langextract/langextract-gemma4-bridge.py`

- Connects to llama-server at `http://127.0.0.1:8090`
- Uses `gemma4-legal-iq4xs-direct.gguf` model (TurboQuant)
- Extracts: entities, events, claims, crime signals
- Fail-open: returns empty extraction with warning if unavailable
- Output: JSONL format (one JSON per line)

**Usage**:
```bash
cd scripts/langextract
python langextract-gemma4-bridge.py --input "evidence text here" --output results.jsonl
python langextract-gemma4-bridge.py --text path/to/file.txt --output results.jsonl
python langextract-gemma4-bridge.py --pdf path/to/evidence.pdf --output results.jsonl
```

### 2. TypeScript Bridge Types
**File**: `src/lib/server/extraction/langextract-types.ts`

Zod-compatible TypeScript types for:
- `ExtractedEntity` (person, organization, location, date, statute, charge, weapon, vehicle, property, amount, contact)
- `ExtractedEvent` (incident, communication, threat, injury, theft, arrest, report_filed)
- `ExtractedClaim` (fact, allegation, inference)
- `CrimeSignal` (statute reference, element matches, jurisdiction)
- `LangExtractResult` (full extraction output)
- `LangExtractRequest` (input schema)

### 3. TypeScript Client
**File**: `src/lib/server/extraction/langextract-client.ts`

HTTP/subprocess bridge that:
- Calls Python script as subprocess (more reliable than HTTP)
- Reads results from JSONL output file
- Fails gracefully if llama-server unavailable
- Singleton pattern for single client instance

**Usage**:
```typescript
import { getLangExtractClient } from '$lib/server/extraction/langextract-client';

const client = getLangExtractClient();
const result = await client.extract({
  evidenceId: 'ev_123',
  sourceType: 'docling_markdown',
  text: 'evidence text from Docling parser...',
  schemaMode: 'legal_evidence'
});

// result contains: entities, events, claims, crime_signals, summary, warnings
```

## Test Results

**Input**: 
```
On June 15, 2024, John Smith robbed First National Bank at 123 Main Street. 
Police arrested him on June 16 at his apartment. Statute: 18 USC § 2113. 
Stolen: 250,000 dollars cash and jewelry.
```

**Output**:
```json
{
  "entities": [
    { "type": "person", "text": "John Smith", "confidence": 0.95 },
    { "type": "organization", "text": "First National Bank", "confidence": 0.95 },
    { "type": "location", "text": "123 Main Street", "confidence": 0.95 },
    { "type": "date", "text": "June 15, 2024", "confidence": 0.95 },
    { "type": "statute", "text": "18 USC § 2113", "confidence": 0.95 },
    { "type": "amount", "text": "250,000 dollars", "confidence": 0.95 },
    { "type": "property", "text": "cash and jewelry", "confidence": 0.95 }
  ],
  "events": [
    { "type": "theft", "description": "Robbed First National Bank", "time": "June 15, 2024", "confidence": 0.95 },
    { "type": "arrest", "description": "Arrested at his apartment", "time": "June 16", "confidence": 0.95 }
  ],
  "claims": [],
  "crime_signals": [
    { "label": "Robbery", "statute": "18 USC § 2113", "elements": ["Robbery occurred", "John Smith was involved"], "confidence": 0.95 }
  ],
  "summary": "On June 15, 2024, John Smith robbed First National Bank at 123 Main Street...",
  "warnings": []
}
```

**Performance**: 
- Extraction: ~2-3 seconds (Gemma4 reasoning time)
- JSON parsing: <100ms
- Total: ~2.5 seconds per document

## Architecture

```
Evidence Upload
  ↓
Docling Parser (PDF/image → Markdown)
  ↓
LangExtract (Gemma4 reasoning)
  ├─ Entities extraction
  ├─ Events extraction
  ├─ Claims extraction
  └─ Crime signals detection
  ↓
TypeScript Normalizer + Zod validation
  ↓
KAG Projection
  ├─ Postgres: metadata_envelopes
  ├─ Qdrant: payload enrichment
  └─ Neo4j: graph edges
  ↓
Redis ACE cache
```

## How It Differs from RAG

| Aspect | RAG (Retrieval) | LangExtract (Extraction) |
|--------|-----------------|-------------------------|
| **Task** | Find relevant documents | Extract structured facts |
| **LLM Use** | Synthesis/generation only | Reasoning + extraction |
| **Output** | Natural language | JSON (entities, events, claims) |
| **Speed** | Depends on retrieval | ~2-3s per document |
| **Training** | No (embedding model only) | Pre-trained (via Gemma4) |
| **Use case** | "Answer this question" | "Extract all people/dates/crimes" |

## LangExtract vs Google LangExtract Library

You downloaded several Google LangExtract packages. They require:
- Ollama (local LLM server)
- Few-shot examples
- Manual visualization generation

**Our implementation is simpler:**
- Uses llama-server + Gemma4 (already running)
- Zero-shot extraction (via structured prompting)
- Direct JSON output (no visualization needed yet)
- Subprocess-based (no HTTP server needed)

Google LangExtract is still useful for **offline batch processing + HTML visualization** if you need manual review UIs.

## Next Steps (Optional)

### 1. Add to Evidence Upload Pipeline
```typescript
// src/routes/api/evidence/upload/+server.ts
const doclingResult = await doclingService.parse(pdfBuffer);
const extracted = await getLangExtractClient().extract({
  sourceType: 'docling_markdown',
  text: doclingResult.markdown,
  evidenceId: evidenceId,
  schemaMode: 'legal_evidence'
});
// Store extracted metadata in Postgres
```

### 2. Build Detective UI Component
```svelte
<!-- src/lib/components/EvidenceExtraction.svelte -->
<ExtractedEntities entities={extraction.entities} />
<ExtractedEvents events={extraction.events} />
<ExtractedCrimeSignals signals={extraction.crime_signals} />
```

### 3. Wire KAG Projection
```typescript
// src/lib/server/kag/kag-projection-service.ts
export async function projectExtractionToKAG(
  caseId: string,
  extraction: LangExtractResult
) {
  // Write to Postgres metadata_envelopes
  // Enrich Qdrant payloads
  // Create Neo4j edges
}
```

## Files Changed

**New Files**:
- ✅ `scripts/langextract/langextract-gemma4-bridge.py` (320 lines)
- ✅ `src/lib/server/extraction/langextract-types.ts` (80 lines)
- ✅ `src/lib/server/extraction/langextract-client.ts` (70 lines)
- ✅ `scripts/langextract/sample_extraction.jsonl` (test output)

**No Changes to Existing Files**: Bridge integrates cleanly

## Running It

**1. Make sure llama-server is running:**
```bash
llama-server.exe -m models/gemma4-legal-iq4xs-direct.gguf -c 16384 -ngl 99 -fa on
# Or via launch-turboquant.ps1
```

**2. Test extraction:**
```bash
cd c:\Users\james\Videos\deeds-web-app
python scripts/langextract/langextract-gemma4-bridge.py \
  --input "On June 15 John Smith robbed First National Bank..." \
  --output test_results.jsonl
```

**3. Use from TypeScript:**
```typescript
import { getLangExtractClient } from '$lib/server/extraction/langextract-client';
const result = await getLangExtractClient().extract({...});
```

## Summary

✅ LangExtract + Gemma4 bridge is **working end-to-end**  
✅ Uses local llama-server (no API keys, no Ollama)  
✅ Extracts legal entities, events, claims, crime signals  
✅ Fail-open (graceful degradation if unavailable)  
✅ JSONL output (machine-readable, batch-processable)  
✅ TypeScript types for SvelteKit integration  

Ready to wire into evidence upload pipeline.
