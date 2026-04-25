# Document Analysis Testing Guide

## Quick Start

### 1. Pull the Model
```bash
# Windows
.\scripts\pull-gemma3.bat

# macOS/Linux
bash ./scripts/pull-gemma3.sh

# Or directly
ollama pull gemma3:270m
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Test Document Upload

Use the test endpoint with a sample document:

```bash
# Prepare a test PDF or image
# Then upload it using the API

curl -X POST http://localhost:5173/api/ai/ollama/analyze-legal-document \
  -F "file=@your-document.pdf" \
  -F "caseId=test-case-123" \
  -F "model=gemma3:270m" \
  -F 'legalContext={"practiceArea":"Contract Law","urgency":"High"}'
```

---

## Test Cases

### Test 1: Text File Upload

**File**: `sample_contract.txt`

**Content**:
```
EMPLOYMENT CONTRACT

This Agreement made this 1st day of January, 2024, between:

EMPLOYER: Acme Corporation, a Delaware corporation
EMPLOYEE: John Doe

WHEREAS, the Employer wishes to employ the Employee;

NOW THEREFORE, in consideration of the mutual covenants:

1. POSITION: The Employee shall serve as Senior Legal Counsel
2. COMPENSATION: Annual salary of $150,000
3. BENEFITS: Health insurance, 401(k) matching
4. TERM: One (1) year from date of execution, renewable annually
5. TERMINATION: Either party may terminate with 30 days notice

Dated: 1 January 2024
```

**Expected Output**:
```json
{
  "summary": "Employment contract between Acme Corporation and John Doe for position of Senior Legal Counsel at $150,000 annually with standard benefits and one-year term.",
  "entities": [
    {"type": "organization", "value": "Acme Corporation", "confidence": 0.98},
    {"type": "person", "value": "John Doe", "confidence": 0.95},
    {"type": "money", "value": "$150,000", "confidence": 0.99},
    {"type": "date", "value": "1 January 2024", "confidence": 0.97}
  ],
  "evidenceType": "contract",
  "privileged": false,
  "needsRedaction": false,
  "relevanceScore": 0.85,
  "riskFactors": ["Standard at-will employment", "30-day termination clause provides flexibility"],
  "tags": ["employment", "contract", "compensation"],
  "confidence": 0.92
}
```

### Test 2: PDF File Upload

**File**: Legal complaint (PDF format)

**Steps**:
1. Create or find a sample legal document PDF
2. Upload via API with caseId
3. Monitor logs for extraction progress

**Expected Behavior**:
- ✅ PDF extraction via pdf-parse (20-50ms)
- ✅ Text limited to 50KB
- ✅ Analysis performed on extracted text
- ✅ Results returned in JSON format

### Test 3: Scanned Document (Image)

**File**: `scanned_contract.jpg` or `.png`

**Steps**:
1. Scan a legal document or use a document image
2. Upload as image file
3. Monitor OCR progress in logs

**Expected Behavior**:
- ✅ Tesseract.js initializes (first run: 1-2 seconds for model download)
- ✅ Progress logged: "OCR Progress: 0%, 25%, 50%, 75%, 100%"
- ✅ Text extracted from image
- ✅ Analysis proceeds normally
- ✅ Worker terminated cleanly

**Performance**: 2-5 seconds for typical document page

### Test 4: PDF with Both Text and Images

**File**: Mixed document PDF

**Expected Behavior**:
- ✅ Primary extraction via pdf-parse succeeds
- ✅ Falls back to OCR only if extraction yields empty content
- ✅ Text combined up to 50KB limit
- ✅ Analysis completes

### Test 5: Large Document (>50KB)

**File**: Long contract or agreement

**Expected Behavior**:
- ✅ Text extracted fully
- ✅ Limited to first 50KB for analysis
- ✅ Database stores full text (but capped at 50KB in analysis)
- ✅ Analysis proceeds on truncated content

### Test 6: Empty or Corrupted File

**File**: Empty PDF or corrupted image

**Expected Behavior**:
- ✅ pdf-parse returns empty content → Triggers OCR
- ✅ OCR returns "no text detected" → Analysis uses placeholder
- ✅ API still returns 200 with "Unable to extract text" message
- ✅ Graceful degradation maintained

---

## Testing Checklist

### Pre-Flight
- [ ] Ollama service running: `curl http://localhost:11434/api/tags`
- [ ] Model available: `ollama list | grep gemma3:270m`
- [ ] Development server running: `npm run dev`
- [ ] Redis running (for caching)
- [ ] PostgreSQL running (for storage)

### PDF Extraction
- [ ] Text PDF extraction works
- [ ] Scanned PDF falls back to OCR
- [ ] Empty PDF handled gracefully
- [ ] Large PDF truncated at 50KB
- [ ] Error logging detailed

### OCR Processing
- [ ] JPEG image OCR works
- [ ] PNG image OCR works
- [ ] Progress logging visible
- [ ] Worker terminates properly
- [ ] Memory cleaned after processing

### Legal Analysis
- [ ] JSON parsing succeeds
- [ ] Entities recognized correctly
- [ ] Evidence type classified
- [ ] Privilege assessment accurate
- [ ] Relevance score reasonable (0.6-0.95 typical)
- [ ] Tags descriptive
- [ ] Confidence score reflects analysis quality

### API Response
- [ ] documentId generated
- [ ] Hash calculated (SHA256)
- [ ] All fields present in response
- [ ] No errors in response
- [ ] Status code 200
- [ ] Response time logged

### Redis Caching
- [ ] First upload → Full analysis (2-5 seconds)
- [ ] Same document upload → Cache hit (1-3ms)
- [ ] Cache key format: `analysis:{hash}`
- [ ] Cache TTL: 5 minutes

### Database Storage
- [ ] Document record created
- [ ] Analysis JSON stored
- [ ] Text content stored (up to 50KB)
- [ ] Metadata populated
- [ ] Embedding generated (if configured)

---

## Performance Benchmarks

### Expected Timings

| Operation | Duration | Notes |
|-----------|----------|-------|
| Text file (10KB) | 800-1500ms | Fast analysis |
| PDF native (20KB) | 1000-2000ms | pdf-parse extraction |
| PDF scanned (1 page) | 3000-5000ms | Tesseract OCR |
| Large PDF (50KB) | 2000-3000ms | Extraction + analysis |
| Cache hit | 1-3ms | Redis retrieval |

### Resource Monitoring

```bash
# Monitor Ollama performance
watch -n 1 'ollama list'

# Check system resources during analysis
# Windows Task Manager
# macOS Activity Monitor
# Linux: top, htop
```

Expected usage during inference:
- CPU: 60-80%
- Memory: 5-8GB (for gemma3:270m)
- GPU: 100% (if CUDA available)

---

## Troubleshooting Tests

### Test: Model Not Found
```bash
ollama pull gemma3:270m
# Expected: [retrieve]: blob sha256:...  100%
```

### Test: OCR Hangs
```bash
# Kill stuck process
pkill -f tesseract
# Or restart Node
npm run dev
```

### Test: Memory Pressure
```bash
# Monitor memory during OCR
# If OOM occurs, reduce concurrency or use smaller documents
```

### Test: PDF Corruption Detection
```bash
# Try uploading corrupted PDF
# Should see: "PDF text extraction failed, falling back to OCR"
# Then: "Unable to extract text from PDF"
# Analysis should still return with graceful error
```

---

## Integration Testing

### Full Workflow Test

```bash
#!/bin/bash

# 1. Upload document
RESPONSE=$(curl -X POST http://localhost:5173/api/ai/ollama/analyze-legal-document \
  -F "file=@test-contract.pdf" \
  -F "caseId=test-123" \
  -F "model=gemma3:270m" \
  -F 'legalContext={"practiceArea":"Contract","urgency":"High"}')

# 2. Extract documentId
DOC_ID=$(echo $RESPONSE | jq -r '.documentId')

# 3. Query database
psql -U user -d legal_ai_db -c "SELECT * FROM documents WHERE id='$DOC_ID';"

# 4. Check cache
redis-cli GET "analysis:$(echo $RESPONSE | jq -r '.hash')"

# 5. Verify response structure
echo $RESPONSE | jq '.summary, .relevanceScore, .tags'
```

---

## Sample Documents for Testing

### Create Test Contract

Save as `test-contract.txt`:
```
CONFIDENTIALITY AGREEMENT

This Confidentiality Agreement ("Agreement") is entered into as of January 15, 2024,
between ABC Legal Services ("Discloser") and XYZ Corporation ("Recipient").

RECITALS:
A. Discloser possesses confidential information
B. Recipient wishes to receive such information

AGREEMENT:
1. Confidential Information shall include all non-public information disclosed
2. Recipient agrees to maintain strict confidentiality
3. Permitted uses limited to evaluation purposes only
4. Duration: Information remains confidential for 3 years
5. Return required upon termination

PRIVILEGED AND CONFIDENTIAL
Attorney Work Product
```

### Create Test Image

Use any legal document image:
- Scan a contract page
- Screenshot of legal text
- Invoice or receipt
- Certificate or deed

---

## Performance Optimization

### Caching Strategy

**Current**: Conservative (5-minute TTL)

**For High Volume**:
```typescript
// Adjust TTL in /server.ts
const ANALYSIS_CACHE_TTL = 3600; // 1 hour
```

**For High Security**:
```typescript
// Disable caching for sensitive documents
if (isHighSecurity) {
  skip_cache = true;
}
```

### Parallel Processing

**Future Enhancement**:
```typescript
// Process multiple documents in parallel
const analyses = await Promise.all([
  analyzeDocument(file1),
  analyzeDocument(file2),
  analyzeDocument(file3)
]);
```

---

## Success Criteria

✅ Document uploaded successfully

✅ Text extraction completes (regardless of method)

✅ Ollama analysis returns valid JSON

✅ Response includes all required fields

✅ Database stores document and analysis

✅ Subsequent uploads use cache

✅ Response time acceptable (<5 seconds for fresh, <10ms cached)

✅ No memory leaks or hanging processes

✅ Graceful error handling for edge cases

---

## Next Steps After Testing

1. **Integrate UI**: Add document upload form to `/tools/search`
2. **Add Webhooks**: Notify on analysis completion
3. **Batch Processing**: Queue for bulk document analysis
4. **Advanced Features**:
   - Multi-language support
   - Custom legal taxonomies
   - Automated redaction suggestions
   - Privilege log generation

---

**Ready to test!** 🚀

Start with: `.\scripts\pull-gemma3.bat` or `bash ./scripts/pull-gemma3.sh`
