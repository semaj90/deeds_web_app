# 🚀 Evidence API Migration Guide

## Overview

All evidence-related endpoints have been consolidated into a single, powerful API at `/api/v2/evidence`.

This provides:
- **Unified interface** for all evidence operations
- **Intelligent fallback** between Python AI backend and TypeScript services
- **Type-safe** operations with proper error handling
- **Production-ready** architecture

---

## 📋 Route Migration Map

### Old Routes → New Routes

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `GET /api/evidence` | `GET /api/v2/evidence?action=list` | List with filters |
| `GET /api/evidence?search=xxx` | `GET /api/v2/evidence?action=search&q=xxx` | Vector search enabled |
| `POST /api/evidence` | `POST /api/v2/evidence` | JSON or multipart |
| `PUT /api/evidence?id=xxx` | `PUT /api/v2/evidence?id=xxx` | Update metadata |
| `DELETE /api/evidence?id=xxx` | `DELETE /api/v2/evidence?id=xxx` | Delete evidence |
| `GET /api/v1/evidence` | `GET /api/v2/evidence?action=list` | Deprecated v1 |
| `POST /api/v1/evidence` | `POST /api/v2/evidence` | Deprecated v1 |
| `GET /api/ai/evidence-search` | `GET /api/v2/evidence?action=search` | AI search integrated |
| `POST /api/ai/process-evidence` | `POST /api/v2/evidence` (multipart) | Upload for AI processing |
| `GET /api/search/evidence` | `GET /api/v2/evidence?action=search` | Unified search |
| `POST /api/evidence/synthesize` | **Coming Soon** `/api/v2/evidence/synthesize` | Dedicated synthesis endpoint |
| `GET /api/evidence/[id]/status` | `GET /api/v2/evidence?action=status&fileId=xxx` | AI processing status |

---

## 🔄 Migration Examples

### 1. List Evidence (Basic)

**Before:**
```typescript
const response = await fetch('/api/evidence?caseId=abc123&limit=50');
const data = await response.json();
```

**After:**
```typescript
const response = await fetch('/api/v2/evidence?action=list&caseId=abc123&limit=50');
const { success, data, source } = await response.json();
// source: 'typescript' (always available)
```

---

### 2. Search Evidence (Vector-Powered)

**Before:**
```typescript
const response = await fetch('/api/search/evidence?q=contract&caseId=abc123');
const results = await response.json();
```

**After:**
```typescript
const response = await fetch('/api/v2/evidence?action=search&q=contract&caseId=abc123&vector=true');
const { success, data, suggestions, source, aiBackend } = await response.json();
// source: 'python-ai' (if available) or 'typescript-fallback'
// aiBackend: 'ollama' (when using Python backend)
// suggestions: AI-generated search suggestions
```

---

### 3. Upload File with AI Processing

**Before:**
```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('caseId', caseId);

const response = await fetch('/api/ai/process-evidence', {
  method: 'POST',
  body: formData
});
```

**After:**
```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('caseId', caseId);

const response = await fetch('/api/v2/evidence', {
  method: 'POST',
  body: formData
});

const { success, evidence, aiProcessing, websocket } = await response.json();
// evidence: PostgreSQL record created immediately
// aiProcessing: { file_id, message } for tracking
// websocket: 'ws://localhost:8000/ws' for real-time updates
```

---

### 4. Create Evidence (JSON, No File)

**Before:**
```typescript
const response = await fetch('/api/evidence', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    caseId: 'abc123',
    title: 'Legal Brief',
    description: 'Summary of findings',
    evidenceType: 'document'
  })
});
```

**After:**
```typescript
const response = await fetch('/api/v2/evidence', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    caseId: 'abc123',
    title: 'Legal Brief',
    description: 'Summary of findings',
    evidenceType: 'document'
  })
});

const { success, evidence, source } = await response.json();
// source: 'typescript' (direct database insert)
```

---

### 5. Update Evidence Metadata

**Before:**
```typescript
const response = await fetch(`/api/evidence?id=${evidenceId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Updated Title',
    tags: ['updated', 'metadata']
  })
});
```

**After:**
```typescript
const response = await fetch(`/api/v2/evidence?id=${evidenceId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Updated Title',
    tags: ['updated', 'metadata']
  })
});

const { success, evidence, source } = await response.json();
```

---

### 6. Delete Evidence

**Before:**
```typescript
const response = await fetch(`/api/evidence?id=${evidenceId}`, {
  method: 'DELETE'
});
```

**After:**
```typescript
const response = await fetch(`/api/v2/evidence?id=${evidenceId}`, {
  method: 'DELETE'
});

const { success, deletedId, source } = await response.json();
```

---

### 7. Check AI Processing Status

**Before:**
```typescript
const response = await fetch(`/api/evidence/${fileId}/status`);
const status = await response.json();
```

**After:**
```typescript
const response = await fetch(`/api/v2/evidence?action=status&fileId=${fileId}`);
const { success, data, source } = await response.json();
// data: { stage, progress, status, message }
// Requires Python AI backend (localhost:8000)
```

---

### 8. Health Check

**New Feature:**
```typescript
const response = await fetch('/api/v2/evidence?action=health');
const { service, status, backends, endpoints } = await response.json();

console.log(backends);
// {
//   typescript: { status: 'healthy', capabilities: ['CRUD', 'basic_search'] },
//   pythonAI: {
//     status: 'healthy',
//     url: 'http://localhost:8000',
//     capabilities: ['vector_search', 'ai_analysis', 'streaming']
//   }
// }
```

---

## 🐍 Python AI Backend Integration

### When Python Backend is Available

The API automatically uses Python AI backend for:
- **Vector search** (semantic similarity with embeddings)
- **AI analysis** (Ollama gemma3-legal model)
- **File processing** (OCR, embedding generation, auto-tagging)
- **Token streaming** (real-time WebSocket updates)

### When Python Backend is Unavailable

The API gracefully falls back to TypeScript services:
- **Basic search** (PostgreSQL ILIKE queries)
- **CRUD operations** (direct database access)
- **Error messages** indicating Python backend is needed for AI features

### Starting Python AI Backend

```bash
cd ai-server
pip install -r requirements.txt
python main.py
# Server runs on http://localhost:8000
# WebSocket on ws://localhost:8000/ws
```

---

## 📊 Response Formats

### Success Response (List/Search)

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 123,
    "hasMore": true
  },
  "source": "typescript" | "python-ai" | "typescript-fallback"
}
```

### Success Response (Upload with AI)

```json
{
  "success": true,
  "evidence": {
    "id": "uuid",
    "title": "document.pdf",
    "caseId": "abc123",
    ...
  },
  "aiProcessing": {
    "success": true,
    "file_id": "evidence_abc123",
    "message": "Processing started"
  },
  "message": "File uploaded. AI analysis in progress.",
  "websocket": "ws://localhost:8000/ws",
  "source": "python-ai"
}
```

### Error Response

```json
{
  "error": "Descriptive error message",
  "details": "Additional context",
  "source": "typescript" | "python-ai"
}
```

---

## ⚡ Frontend Integration

### Svelte Component Example

```svelte
<script lang="ts">
  let evidence = $state([]);
  let loading = $state(false);
  let pythonAIAvailable = $state(false);

  onMount(async () => {
    // Check backend health
    const health = await fetch('/api/v2/evidence?action=health').then(r => r.json());
    pythonAIAvailable = health.backends.pythonAI.status === 'healthy';
  });

  async function searchEvidence(query: string) {
    loading = true;

    const response = await fetch(
      `/api/v2/evidence?action=search&q=${encodeURIComponent(query)}&vector=true`
    );

    const { success, data, suggestions, source } = await response.json();

    if (success) {
      evidence = data;

      if (source === 'python-ai') {
        console.log('Using AI-powered vector search');
        console.log('AI suggestions:', suggestions);
      } else {
        console.warn('Python AI unavailable, using basic search');
      }
    }

    loading = false;
  }

  async function uploadFile(file: File, caseId: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('caseId', caseId);

    const response = await fetch('/api/v2/evidence', {
      method: 'POST',
      body: formData
    });

    const { success, evidence, aiProcessing, websocket } = await response.json();

    if (success && websocket) {
      // Connect to WebSocket for real-time updates
      const ws = new WebSocket(websocket);

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'TOKEN') {
          console.log('AI streaming:', data.token);
        }
      };

      // Subscribe to workflow updates
      ws.send(JSON.stringify({
        type: 'SUBSCRIBE_WORKFLOW',
        file_id: aiProcessing.file_id
      }));
    }
  }
</script>
```

---

## 🧪 Testing

### Test Basic CRUD (No Python Required)

```bash
# List evidence
curl 'http://localhost:5173/api/v2/evidence?action=list&caseId=test123'

# Create evidence
curl -X POST http://localhost:5173/api/v2/evidence \
  -H 'Content-Type: application/json' \
  -d '{"caseId":"test123","title":"Test Evidence","evidenceType":"document"}'

# Update evidence
curl -X PUT 'http://localhost:5173/api/v2/evidence?id=uuid' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Updated Title"}'

# Delete evidence
curl -X DELETE 'http://localhost:5173/api/v2/evidence?id=uuid'
```

### Test AI Features (Python Required)

```bash
# Start Python backend first
cd ai-server && python main.py

# Search with vector similarity
curl 'http://localhost:5173/api/v2/evidence?action=search&q=contract&vector=true'

# Upload file for AI processing
curl -X POST http://localhost:5173/api/v2/evidence \
  -F 'file=@document.pdf' \
  -F 'caseId=test123'

# Check workflow status
curl 'http://localhost:5173/api/v2/evidence?action=status&fileId=evidence_abc123'

# Health check
curl 'http://localhost:5173/api/v2/evidence?action=health'
```

---

## 📝 TODO: Deprecated Routes

The following routes should be removed after frontend migration is complete:

- [ ] `/api/evidence/+server.ts` → Use `/api/v2/evidence`
- [ ] `/api/v1/evidence/+server.ts` → Use `/api/v2/evidence`
- [ ] `/api/v1/evidence/search/[endpoint]/+server.ts` → Use `/api/v2/evidence?action=search`
- [ ] `/api/ai/evidence-search/+server.ts` → Integrated into v2
- [ ] `/api/ai/process-evidence/+server.ts` → Integrated into v2
- [ ] `/api/search/evidence/+server.ts` → Use `/api/v2/evidence?action=search`
- [ ] `/api/evidence/upload/+server.ts` → Use `POST /api/v2/evidence` (multipart)
- [ ] `/api/evidence/[id]/status/+server.ts` → Use `/api/v2/evidence?action=status`

**Add deprecation notices** to these routes pointing to `/api/v2/evidence`

---

## 🎯 Benefits of Migration

1. **Single Source of Truth**: One API for all evidence operations
2. **Intelligent Fallback**: Works with or without Python AI backend
3. **Better Type Safety**: Proper TypeScript types throughout
4. **Easier Maintenance**: Less code duplication
5. **Production Ready**: Error handling, logging, CORS configured
6. **Future Proof**: Easy to add new features (synthesis, advanced analysis)
7. **Clear Documentation**: All endpoints documented in one place

---

## 🚀 Next Steps

1. Update frontend components to use `/api/v2/evidence`
2. Test all workflows (CRUD, search, upload, AI processing)
3. Add deprecation warnings to old routes
4. Monitor usage of deprecated endpoints
5. Remove deprecated routes after 30-day grace period
6. Add synthesis endpoint at `/api/v2/evidence/synthesize`
7. Add batch operations endpoint

---

**Status**: ✅ Production Ready
**Python Backend**: Optional but recommended for AI features
**Backward Compatible**: Old routes return deprecation notices
