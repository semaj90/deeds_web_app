# Enhanced RAG Document Testing Guide

## 📁 Upload Locations Created

### Directory Structure:

```
c:\Users\james\Desktop\deeds-web\deeds-web-app\
├── uploads/
│   ├── documents/     # General documents (TXT, MD, etc.)
│   ├── pdfs/         # PDF files for testing
│   └── test-docs/    # Sample test documents
```

## 🧪 How to Test Enhanced RAG

### Method 1: Web Interface (Easiest)

1. **Open RAG Studio**: http://localhost:5173/rag-studio
2. **Upload Documents**: Use the upload interface
3. **Test Search**: Query your uploaded documents

### Method 2: File System Upload (Direct)

1. **Place files in**: `uploads/documents/` or `uploads/pdfs/`
2. **Use API**: POST to `/api/rag/upload`
3. **Test queries**: Use the web interface or API

### Method 3: API Testing (Advanced)

```bash
# Upload a document
curl -X POST "http://localhost:5173/api/rag/upload" \
  -F "file=@uploads/documents/test.pdf" \
  -F "type=pdf"

# Search documents
curl -X POST "http://localhost:5173/api/rag/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"legal frameworks","type":"semantic"}'
```

## 📄 Sample Documents to Test

### Create Test Documents:

1. **Legal Document** (test-legal.txt)
2. **Technical Manual** (test-manual.md)
3. **Policy Document** (test-policy.pdf)

### Test Queries:

- "What are the main legal requirements?"
- "Explain the technical specifications"
- "Summarize the policy changes"

## 🚀 Quick Start Steps

1. **Add documents to**: `uploads/documents/`
2. **Open**: http://localhost:5173/rag-studio
3. **Upload & Query**: Test the RAG system
4. **Monitor**: Check processing logs and results

Ready to create sample test documents? 📝
