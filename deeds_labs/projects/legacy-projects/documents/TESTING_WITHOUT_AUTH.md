# Testing Vector Search + RAG Without Authentication

**Status:** ✅ No authentication required for API testing
**All endpoints:** Public (no auth middleware detected)

---

## Quick Test (No Signup Required)

### 1. Create Test Document
```bash
cat > test_doc.txt << 'EOF'
EMPLOYMENT AGREEMENT

This Employment Agreement is entered into as of October 25, 2025, between
Acme Legal Services Corporation and John Doe.

1. POSITION AND DUTIES
Employee shall serve as Senior Legal Counsel with responsibilities including:
- Reviewing contracts and legal documents
- Providing legal advice to management
- Managing litigation support

2. COMPENSATION
Employee shall receive an annual salary of $150,000 payable bi-weekly.

3. TERMINATION
Either party may terminate with 30 days written notice.

4. CONFIDENTIALITY
Employee agrees to maintain confidentiality of all proprietary information.

5. GOVERNING LAW
This Agreement shall be governed by the laws of New York.

Signed: October 25, 2025
EOF
```

### 2. Test Single File Upload
```bash
# Upload single document
curl -X POST http://localhost:5173/api/rag/upload \
  -F "file=@test_doc.txt" \
  -F "tags=employment,contract,legal"

# Expected response:
# {
#   "message": "Document processed successfully",
#   "documentId": "uuid-or-id",
#   "chunksCount": 3-5
# }
```

### 3. Test Batch Ingestion
```bash
curl -X POST http://localhost:5173/api/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "filename": "contract_1.txt",
        "content": "EMPLOYMENT AGREEMENT\n\n1. Position: Senior Counsel\n2. Salary: $150,000\n3. Benefits: Full coverage",
        "tags": ["employment", "contract"]
      },
      {
        "filename": "contract_2.txt",
        "content": "SERVICE AGREEMENT\n\n1. Services: Legal consulting\n2. Term: 2 years\n3. Fee: $10,000/month",
        "tags": ["service", "agreement"]
      },
      {
        "filename": "contract_3.txt",
        "content": "CONFIDENTIALITY AGREEMENT\n\nParties agree to maintain confidentiality of:\n- Trade secrets\n- Client information\n- Internal processes",
        "tags": ["confidentiality", "agreement"]
      }
    ]
  }'

# Expected response:
# {
#   "success": true,
#   "summary": {
#     "documentsProcessed": 3,
#     "documentsStored": 3,
#     "totalChunksCreated": 9,
#     "totalEmbeddingsGenerated": 9,
#     "responseTime": 12450
#   }
# }
```

### 4. Test Vector Search
```bash
# Search documents
curl -X POST http://localhost:5173/api/search-drizzle-pgvector \
  -H "Content-Type: application/json" \
  -d '{
    "query": "employment contract salary benefits",
    "topK": 10,
    "threshold": 0.5,
    "searchInTable": "documents"
  }'

# Expected response:
# {
#   "results": [
#     {
#       "id": "uuid",
#       "title": "contract_1.txt",
#       "content": "EMPLOYMENT AGREEMENT...",
#       "similarity": 0.87,
#       "metadata": {...}
#     }
#   ],
#   "responseTime": 127,
#   "metadata": {
#     "table": "documents",
#     "indexType": "pgvector (HNSW)"
#   }
# }
```

### 5. Search Evidence Table
```bash
curl -X POST http://localhost:5173/api/search-drizzle-pgvector \
  -H "Content-Type: application/json" \
  -d '{
    "query": "legal evidence discovery",
    "topK": 5,
    "threshold": 0.5,
    "searchInTable": "evidence"
  }'
```

### 6. Check API Health
```bash
curl http://localhost:5173/api/search-drizzle-pgvector

# Expected response:
# {
#   "status": "healthy",
#   "services": {
#     "pgvector": "available",
#     "ollama": "available"
#   },
#   "endpoints": {
#     "search": "POST /api/search-drizzle-pgvector",
#     "health": "GET /api/search-drizzle-pgvector"
#   }
# }
```

### 7. Check Batch Ingest Health
```bash
curl http://localhost:5173/api/rag/ingest

# Expected response:
# {
#   "status": "healthy",
#   "statistics": {
#     "documentsInDatabase": 42,
#     "chunksInDatabase": 387
#   },
#   "capabilities": {
#     "batchProcessing": true,
#     "maxDocumentsPerBatch": 100
#   }
# }
```

---

## Performance Test

### Load Test (10 Concurrent Searches)
```bash
for i in {1..10}; do
  curl -X POST http://localhost:5173/api/search-drizzle-pgvector \
    -H "Content-Type: application/json" \
    -d '{"query":"employment contract","topK":10}' &
done
wait

# Monitor response times - expect 110-160ms average
```

### Batch Processing Test
```bash
# Time 100-document batch
time curl -X POST http://localhost:5173/api/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [... 100 documents ...]
  }'

# Expected: 120-180 seconds
```

---

## Verify Database Records

### Check Documents Stored
```sql
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << EOF
-- Count documents
SELECT COUNT(*) as total_documents FROM documents;

-- Count chunks
SELECT COUNT(*) as total_chunks FROM document_chunks;

-- View recent documents
SELECT id, title, filename, created_at
FROM documents
ORDER BY created_at DESC
LIMIT 5;

-- View chunks for a document
SELECT chunk_index, text
FROM document_chunks
WHERE document_id = 1
ORDER BY chunk_index;
EOF
```

### Check Embeddings
```sql
-- Count vectors
SELECT COUNT(*) FROM document_chunks WHERE embedding IS NOT NULL;

-- Check embedding dimensions
SELECT array_length(embedding, 1) FROM document_chunks LIMIT 1;
```

### Verify HNSW Index Usage
```sql
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << EOF
-- Check index scans
SELECT indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexname LIKE '%hnsw%';

-- Check if HNSW is being used
EXPLAIN ANALYZE
SELECT id FROM document_chunks
ORDER BY embedding <=> '[0.1,0.2,0.3...]'::vector
LIMIT 10;
EOF
```

---

## Common Issues & Fixes

### Issue: "No documents found"
**Solution:**
1. Verify upload succeeded: `curl http://localhost:5173/api/rag/ingest`
2. Check database: `SELECT COUNT(*) FROM documents;`
3. Re-upload test documents

### Issue: "Embedding column not found"
**Solution:**
```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db \
  -c "ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding vector(768);"
```

### Issue: "mime_type column not found"
**Solution:**
```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db \
  -c "ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type varchar(100);"
```

### Issue: "HNSW index not found"
**Solution:**
```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << EOF
CREATE INDEX IF NOT EXISTS idx_documents_embedding_hnsw
  ON documents
  USING hnsw (embedding vector_cosine_ops);
EOF
```

### Issue: Slow response (>500ms)
**Solution:** Verify HNSW index exists
```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db \
  -c "SELECT indexname FROM pg_indexes WHERE tablename='documents' AND indexname LIKE '%hnsw%';"
```

---

## Full Integration Test Script

```bash
#!/bin/bash
set -e

echo "🧪 Full Integration Test - No Auth Required"
echo "==========================================="

# 1. Create test documents
echo "1. Creating test documents..."
cat > /tmp/test1.txt << 'EOF'
EMPLOYMENT AGREEMENT

1. Position: Senior Counsel
2. Salary: $150,000
3. Benefits: Full health coverage
4. Termination: 30 days notice
EOF

cat > /tmp/test2.txt << 'EOF'
SERVICE AGREEMENT

1. Services: Legal consulting
2. Term: 2 years
3. Fee: $10,000/month
4. Confidentiality: Strict
EOF

# 2. Test upload
echo "2. Testing single file upload..."
curl -X POST http://localhost:5173/api/rag/upload \
  -F "file=@/tmp/test1.txt" \
  -F "tags=employment,contract"

# 3. Test batch ingest
echo ""
echo "3. Testing batch ingestion..."
curl -X POST http://localhost:5173/api/rag/ingest \
  -H "Content-Type: application/json" \
  -d "{
    \"documents\": [
      {\"filename\":\"test2.txt\",\"content\":\"$(cat /tmp/test2.txt)\",\"tags\":[\"service\"]},
      {\"filename\":\"test3.txt\",\"content\":\"CONFIDENTIALITY AGREEMENT\n\nParties agree to maintain confidentiality of trade secrets and client information.\",\"tags\":[\"confidentiality\"]}
    ]
  }"

# 4. Test search
echo ""
echo "4. Testing vector search..."
curl -X POST http://localhost:5173/api/search-drizzle-pgvector \
  -H "Content-Type: application/json" \
  -d '{
    "query": "employment contract salary benefits",
    "topK": 10,
    "threshold": 0.5
  }'

# 5. Check health
echo ""
echo "5. Checking API health..."
curl http://localhost:5173/api/search-drizzle-pgvector

echo ""
echo "✅ Integration test complete!"
```

---

## Access Control Notes

### Current Status: No Authentication Required ✅

All endpoints are accessible without login:
- ✅ `/api/rag/upload` - No auth
- ✅ `/api/rag/ingest` - No auth
- ✅ `/api/search-drizzle-pgvector` - No auth
- ✅ `/tools/search` - Public UI

### Optional: Add Authentication Later

If you want to add authentication in the future:

```typescript
// Add auth middleware
export const POST: RequestHandler = async ({ request, locals }) => {
  // Optional: Add auth check
  // if (!locals.user) {
  //   return error(401, 'Unauthorized');
  // }

  // Rest of endpoint...
};
```

---

## Monitoring Test Results

### Query Performance Monitoring
```sql
-- Monitor recent queries
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << EOF
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%document%'
ORDER BY mean_time DESC
LIMIT 10;
EOF
```

### Index Performance
```sql
-- Check HNSW index performance
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << EOF
EXPLAIN ANALYZE
SELECT id, content,
  (1 - (embedding <=> '[0.1,0.2,0.3...]'::vector)) as similarity
FROM document_chunks
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[0.1,0.2,0.3...]'::vector
LIMIT 10;
EOF
```

---

## Success Criteria

You'll know the system is working when:

✅ Upload completes with document ID
✅ Batch ingest shows chunks created
✅ Search returns results with similarity scores
✅ Response times: 110-160ms
✅ HNSW index scans show in pg_stat
✅ All health checks report "healthy"

---

**Status:** ✅ Ready to test
**Authentication:** Not required
**Access:** Public API

Start testing now - no signup or auth needed!
