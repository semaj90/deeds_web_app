# MinIO Integration - Quick Start Guide

## 🚨 IMMEDIATE FIX FOR YOUR ERROR

The error you're seeing is due to incorrect import paths. Run this NOW:

```powershell
# Quick fix - run from deeds-web-app directory
.\fix-minio-imports.ps1
```

This will:
1. Fix the import from `github.com/deeds-web/deeds-web-app/go-microservice/pkg/minio` to `microservice/pkg/minio`
2. Run `go mod tidy` to clean up dependencies
3. Build the services

## 📁 Files Created

1. **fix-minio-imports.ps1** - Fixes the Go import issues (RUN THIS FIRST!)
2. **START-MINIO-INTEGRATION.bat** - Starts all services with proper configuration
3. **diagnose-minio-integration.bat** - Checks system status and identifies issues
4. **test-minio-integration.mjs** - Comprehensive test suite for the integration

## 🚀 Quick Start Steps

### Step 1: Fix the Import Issue
```powershell
.\fix-minio-imports.ps1
```

### Step 2: Start All Services
```batch
START-MINIO-INTEGRATION.bat
```

### Step 3: Verify Everything Works
```batch
diagnose-minio-integration.bat
```

### Step 4: Test the Integration
```bash
# Install test dependencies if needed
npm install form-data node-fetch

# Run tests
node test-minio-integration.mjs
```

## 🔧 What Each Component Does

### MinIO
- **Purpose**: S3-compatible object storage for files
- **Port**: 9000 (API), 9001 (Console)
- **Default Credentials**: minioadmin/minioadmin
- **Bucket**: legal-documents

### PostgreSQL with pgVector
- **Purpose**: Metadata storage and vector search
- **Port**: 5432
- **Database**: deeds_web_app
- **Features**: 
  - Document metadata
  - Vector embeddings (384 dimensions)
  - Tags and custom metadata (JSONB)

### Qdrant
- **Purpose**: Dedicated vector database for similarity search
- **Port**: 6333
- **Collection**: legal_documents
- **Vector Size**: 384 (nomic-embed-text)

### Upload Service
- **Purpose**: Handle file uploads and orchestrate processing
- **Port**: 8093
- **Endpoints**:
  - POST `/upload` - Upload files
  - POST `/search` - Vector search
  - GET `/documents/{caseId}` - List documents
  - GET `/health` - Health check

## 📊 Architecture Flow

```
User Upload → Upload Service → MinIO (File Storage)
                ↓
            PostgreSQL (Metadata + pgVector)
                ↓
            Text Extraction
                ↓
            Embedding Generation (RAG Service)
                ↓
            Qdrant (Vector Index)
```

## 🔍 Testing the System

### Upload a File
```bash
curl -X POST http://localhost:8093/upload \
  -F "file=@document.pdf" \
  -F "caseId=CASE-001" \
  -F "documentType=evidence" \
  -F 'tags={"priority":"high","category":"financial"}'
```

### Search Documents
```bash
curl -X POST http://localhost:8093/search \
  -H "Content-Type: application/json" \
  -d '{"query":"financial evidence","limit":10}'
```

### List Case Documents
```bash
curl http://localhost:8093/documents/CASE-001
```

## 🐛 Troubleshooting

### Import Error Still Occurring?
The main issue is in `go-microservice/cmd/upload-service/main.go`:
- **Wrong**: `import "github.com/deeds-web/deeds-web-app/go-microservice/pkg/minio"`
- **Correct**: `import "microservice/pkg/minio"`

### Services Not Starting?
1. Check ports aren't already in use: `netstat -an | findstr 9000`
2. Ensure PostgreSQL service is running
3. Check environment variables are set

### pgVector Not Working?
```sql
-- Connect to PostgreSQL and run:
CREATE EXTENSION IF NOT EXISTS vector;
```

### Qdrant Collection Missing?
```bash
# Create collection via API
curl -X PUT http://localhost:6333/collections/legal_documents \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":384,"distance":"Cosine"}}'
```

## 📝 Environment Variables

Add to your `.env` file:
```env
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=legal-documents
DATABASE_URL=postgresql://postgres:password@localhost:5432/deeds_web_app?sslmode=disable
QDRANT_URL=http://localhost:6333
RAG_SERVICE_URL=http://localhost:8092
UPLOAD_SERVICE_PORT=8093
```

## ✅ Success Indicators

When everything is working, you should see:
- MinIO Console accessible at http://localhost:9001
- Upload Service health check returns OK at http://localhost:8093/health
- Qdrant dashboard at http://localhost:6333/dashboard
- Files appearing in MinIO bucket after upload
- Vector search returning relevant results

## 🔗 Integration Points

The system integrates with your existing:
- **SvelteKit Frontend**: Upload forms and search UI
- **RAG Service**: For embedding generation
- **Summarizer Service**: For text extraction
- **Authentication**: Can add auth middleware to upload service

## 📞 Need Help?

1. Run `diagnose-minio-integration.bat` first
2. Check the logs in `go-microservice/logs/`
3. Verify all services are running with proper ports
4. Ensure database extensions are installed

---

**IMPORTANT**: The fix-minio-imports.ps1 script will resolve your immediate build error. Run it first before trying anything else!
