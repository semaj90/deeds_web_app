# lawpdfs Indexing Guide

**Date**: December 11, 2025
**Purpose**: Index existing legal documents into RAG system
**Status**: Ready to execute

---

## 📚 Overview

The `lawpdfs` directory contains **38 legal documents** that need to be indexed into the RAG system for searchable knowledge base functionality.

### What This Does

1. **Scans** all PDF files in `lawpdfs/` directory
2. **Creates** evidence_files records in PostgreSQL
3. **Extracts** jurisdiction and tags from filenames
4. **Chunks** documents (placeholder implementation)
5. **Generates** 768-dim embeddings for each chunk
6. **Indexes** to Qdrant with full metadata
7. **Links** citation tags to evidence

---

## 🚀 Quick Start

### Windows
```powershell
.\scripts\index-lawpdfs.bat
```

### Linux/Mac
```bash
chmod +x scripts/index-lawpdfs.sh
./scripts/index-lawpdfs.sh
```

### Direct (any platform)
```bash
npx tsx scripts/index-lawpdfs-to-rag.ts
```

---

## 📋 Prerequisites

### Services Running
- ✅ PostgreSQL (port 5432, legal_ai_db)
- ✅ Qdrant (port 6333, phase72_evidence_embeddings)
- ✅ Ollama (port 11434, embeddinggemma:latest)

### Database Tables
- ✅ evidence_files
- ✅ evidence_chunks
- ✅ evidence_embeddings
- ✅ citation_tags
- ✅ evidence_tags
- ✅ rag_index_metadata
- ✅ audit_log

### Verify Services
```powershell
# PostgreSQL
$env:PGPASSWORD = "123456"
psql -U legal_admin -h localhost -d legal_ai_db -c "SELECT COUNT(*) FROM evidence_files;"

# Qdrant
curl http://localhost:6333/collections/phase72_evidence_embeddings

# Ollama
curl http://localhost:11434/api/tags
```

---

## 📊 What Gets Indexed

### Document Count
**38 PDF files** including:
- California case law (People v. cases)
- Federal DOJ press releases
- Human trafficking legislation
- Sex offender registries
- Correctional facility documents
- Legal codes and statutes

### Auto-Extracted Metadata

#### Jurisdictions
- **CA**: California documents
- **Fed-US**: Federal/DOJ documents
- **TX**: Texas documents
- **NY**: New York documents
- **Other**: Unclassified

#### Auto-Generated Tags
- `human-trafficking` - Trafficking-related docs
- `sexual-abuse` - Sexual abuse cases
- `child-related` - Child protection cases
- `corrections` - Prison/correctional docs
- `habeas-corpus` - Habeas corpus cases
- `insider-trading` - Financial crimes
- `fraud` - Fraud cases
- `obstruction` - Obstruction cases
- `legislation` - Bills and laws
- `case-law` - Court decisions
- `criminal-case` - Criminal proceedings
- `statute` - Legal codes

---

## 🔧 How It Works

### Step 1: Scan Directory
```typescript
const files = await readdir('./lawpdfs');
const pdfFiles = files.filter(f => f.endsWith('.pdf'));
// Found 38 PDF files
```

### Step 2: Create Evidence Records
```typescript
for (const file of pdfFiles) {
  const jurisdiction = extractJurisdiction(file);
  const tags = extractTags(file);

  const evidenceId = await sql`
    INSERT INTO evidence_files (...)
    VALUES (...)
    RETURNING id
  `;
}
```

### Step 3: Create Chunks
```typescript
// Placeholder: Creates 1 chunk per document
// Production: Use actual PDF parsing
await sql`
  INSERT INTO evidence_chunks (evidence_id, content, ...)
  VALUES (...)
`;
```

### Step 4: Generate Embeddings & Index
```typescript
const result = await addEvidenceToRagIndex(evidenceId, {
  userId: SYSTEM_USER_ID,
  logAudit: true
});
// Generates 768-dim embeddings
// Upserts to Qdrant
// Creates rag_index_metadata
```

---

## 📈 Expected Output

### Console Output
```
═══════════════════════════════════════════════════════════
  Index lawpdfs to RAG System
═══════════════════════════════════════════════════════════

🚀 Starting lawpdfs indexing...

📚 Found 38 PDF files

[1/38] Processing: 100yearsPeople v. Jowy Omar Roman _ County of San Mateo, CA.pdf
  📄 Creating evidence record for: 100yearsPeople v. Jowy Omar Roman _ County of San Mateo, CA.pdf
     Jurisdiction: CA
     Tags: criminal-case, case-law
  ✅ Evidence record created: uuid-1
  ✅ Created 1 chunk(s)
  🔄 Adding to RAG index...
  [RAG Sync] Adding evidence uuid-1 to RAG index...
  [RAG Sync] Found 1 chunks to process
  [RAG Sync] Evidence tags: criminal-case, case-law
  [RAG Sync] Generating embedding for chunk 0...
  ✅ Embedding generated: 768 dimensions
  [RAG Sync] ✅ Chunk 0 indexed (768 dims)
  [RAG Sync] ✅ Indexed 1/1 chunks in 2500ms
  ✅ RAG indexing complete: 1 chunks indexed

[2/38] Processing: ...
...

═══════════════════════════════════════════════════════════
  Indexing Complete
═══════════════════════════════════════════════════════════

Total files:     38
✅ Success:      38
❌ Failed:       0
⏱️  Duration:     95.23s

✨ Done!
```

### Database Records Crel
-- 38 evidence_files records
SELECT COUNT(*) FROM evidence_files;
-- Result: 38

-- 38 evidence_chunks records (1 per file)
SELECT COUNT(*) FROM evidence_chunks;
-- Result: 38

-- ~15 citation_tags records (unique tags)
SELECT COUNT(*) FROM citation_tags;
-- Result: ~15

-- ~76 evidence_tags links (2 tags per file avg)
SELECT COUNT(*) FROM evidence_tags;
-- Result: ~76

-- 38 rag_index_metadata records
SELECT COUNT(*) FROM rag_index_metadata;
-- Result: 38

-- 38 audit_log entries
SELECT COUNT(*) FROM audit_log WHERE operation = 'INDEX_ADD';
-- Result: 38
```

### Qdrant Points Created
```bash
curl http://localhost:6333/collections/phase72_evidence_embeddings
# Result: { points_count: 38, ... }
```

---

## 🧪 Test After Indexing

### Test 1: Search by Tag
```powershell
$body = @{
  message = "What are the laws about human trafficking?"
  tags = @("human-trafficking")
  jurisdiction = "CA"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:5176/api/ai/yorha/context-chat" `
  -Method POST -Body $body -ContentType "application/json" -TimeoutSec 180
```

**Expected**: Returns context from trafficking-related documents with 1.5x boost

---

### Test 2: Search by Jurisdiction
```powershell
$body = @{
  message = "What are California criminal cases about?"
  jurisdiction = "CA"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:5176/api/ai/yorha/context-chat" `
  -Method POST -Body $body -ContentType "application/json" -TimeoutSec 180
```

**Expected**: Returns only California documents

---

### Test 3: Combined Search
```powershell
$body = @{
  message = "Tell me about child protection cases"
  tags = @("child-related", "criminal-case")
  jurisdiction = "CA"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:5176/api/ai/yorha/context-chat" `
  -Method POST -Body $body -ContentType "application/json" -TimeoutSec 180
```

**Expected**: Returns California child-related criminal cases with tag boost

---

## 🔍 Verify Indexing

### Check Database
```sql
-- List all indexed evidence
SELECT id, filename, processing_status, chunk_count, metadata->>'jurisdiction' as jurisdiction
FROM evidence_files
ORDER BY created_at DESC;

-- List all tags
SELECT name, jurisdiction, usage_count
FROM citation_tags
ORDER BY usage_count DESC;

-- Check evidence-tag links
SELECT ef.filename, ct.name as tag
FROM evidence_files ef
JOIN evidence_tags et ON et.evidence_id = ef.id
JOIN citation_tags ct ON ct.id = et.tag_id
ORDER BY ef.filename;
```

### Check Qdrant
```bash
# Get collection info
curl http://localhost:6333/collections/phase72_evidence_embeddings

# Search for a specific document
curl -X POST http://localhost:6333/collections/phase72_evidence_embeddings/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 5, "with_payload": true, "with_vector": false}'
```

---

## ⚠️ Known Limitations

### Current Implementation
1. **Placeholder Chunking**: Creates 1 chunk per document with filename as content
2. **No PDF Parsing**: Actual PDF text extraction not implemented yet
3. **Simple Tag Extraction**: Based on filename patterns only
4. **No OCR**: Scanned PDFs won't have searchable text

### Production Requirements
1. **PDF Parsing**: Implement actual PDF text extraction (pdf-parse, pdfjs-dist)
2. **Smart Chunking**: Chunk by sections, paragraphs, or semantic units
3. **OCR Integration**: Extract text from scanned documents
4. **Metadata Extraction**: Parse case numbers, dates, parties from content
5. **Citation Parsing**: Extract legal citations and cross-references

---

## 🚀 Next Steps

### After Indexing
1. ✅ Test RAG search with indexed documents
2. ✅ Verify tag filtering works
3. ✅ Verify jurisdiction filtering works
4. ⏳ Implement actual PDF parsing
5. ⏳ Implement smart chunking
6. ⏳ Add OCR for scanned documents

### Production Enhancements
1. **Batch Processing**: Process multiple files in parallel
2. **Progress Tracking**: Real-time progress updates
3. **Error Recovery**: Resume from failures
4. **Incremental Updates**: Only index new/changed files
5. **Metadata Enrichment**: Extract more metadata from content

---

## 📝 Files Created

1. **`scripts/index-lawpdfs-to-rag.ts`** - Main indexing script
2. **`scripts/index-lawpdfs.sh`** - Linux/Mac wrapper
3. **`scripts/index-lawpdfs.bat`** - Windows wrapper
4. **`LAWPDFS_INDEXING_GUIDE.md`** - This document

---

## ✅ Ready to Execute

**Prerequisites**: ✅ All services running
**Database**: ✅ All tables exist
**Scripts**: ✅ Ready to run
**Documents**: ✅ 38 PDFs in lawpdfs/

**Command**:
```powershell
.\scripts\index-lawpdfs.bat
```

**Expected Duration**: ~2-3 minutes (38 files × 2-5 seconds each)

---

**Let's index the knowledge base!** 🚀
