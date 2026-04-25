# 🚀 Quick Start: Production-Ready Worker System

## ✅ What's Complete

All background workers are now integrated with the homepage and ready for production use with `npm run dev:quic`.

---

## 🎯 Start Everything

```powershell
cd sveltekit-frontend
npm run dev:quic
```

This automatically starts:
- ✅ PostgreSQL (Docker or Windows service)
- ✅ Redis (Docker or Windows service)
- ✅ MinIO (Docker)
- ✅ Ollama (Windows native with 30 GPU layers)
- ✅ RabbitMQ (Docker)
- ✅ **OCR Worker** (GPU Tesseract + MinIO)
- ✅ **Embedding Worker** (embeddinggemma:latest + Qdrant + pgvector)
- ✅ **Autotag Worker** (optional)
- ✅ SvelteKit Dev Server

---

## 📊 View Worker Status

Navigate to: **http://localhost:5173/**

You'll see:

### **System Status:**
- Database: ✅ online
- Redis Cache: ✅ online
- Ollama AI: ✅ online
- GPU Compute: ✅ online
- **Background Workers: ✅ online** ← NEW!

### **Worker Details Panel:**

**OCR Worker** 📄
- Status: online
- Processed: 0 jobs
- Queue: 0 pending
- Tech: GPU Tesseract, MinIO

**Embedding Worker** 🧠
- Status: online
- Processed: 0 jobs
- Queue: 0 pending
- Tech: embeddinggemma:latest, Qdrant, pgvector

**Autotag Worker** 🏷️
- Status: offline (optional)
- Type: gemma3-legal:latest

---

## 🧪 Test the Pipeline

1. **Upload Evidence:**
   - Go to `http://localhost:5173/prosecutor`
   - Click "Upload Evidence"
   - Select a PDF file
   - Fill metadata (Case ID, Type, Description)
   - Click "Upload & Analyze Evidence"

2. **Watch the Magic:**
   ```
   Upload → MinIO Storage
         ↓
   RabbitMQ Queue (Job ID returned)
         ↓
   OCR Worker (GPU extraction)
         ↓
   Embedding Worker (AI vectorization)
         ↓
   Legal Analysis (gemma3-legal)
         ↓
   Results appear in UI
   ```

3. **Monitor Progress:**
   - Homepage auto-refreshes worker stats every 30s
   - Watch "Processed Jobs" count increase
   - See queue depths in real-time

---

## 🔍 Check Worker Health

### **API Endpoints:**

```powershell
# All workers
curl http://localhost:5173/api/health/workers

# OCR worker only
curl http://localhost:5173/api/health/workers?type=ocr

# Embedding worker only
curl http://localhost:5173/api/health/workers?type=embedding
```

### **Response Example:**
```json
{
  "success": true,
  "status": "online",
  "workers": [
    {
      "name": "OCR Worker",
      "status": "online",
      "healthy": true,
      "processedJobs": 127,
      "queueDepth": 3,
      "details": {
        "gpuEnabled": true,
        "workerPoolSize": 4
      }
    },
    {
      "name": "Embedding Worker",
      "status": "online",
      "healthy": true,
      "processedJobs": 89,
      "queueDepth": 12,
      "details": {
        "ollamaModel": "embeddinggemma:latest",
        "queuedJobs": 12
      }
    }
  ],
  "summary": {
    "total": 3,
    "online": 2,
    "offline": 1
  }
}
```

---

## 📁 Key Files Modified

### **1. OCR Worker** (`workers/ocr-worker.ts`)
```typescript
// NEW: Uses production-ready minioService
import { minioService } from '../src/lib/server/storage/minio-service.js';

async function downloadFromMinIO(s3Key: string, s3Bucket: string): Promise<Buffer> {
  return await minioService.downloadFile(s3Bucket, s3Key);
}
```

### **2. Dev Script** (`scripts/start-full-stack.js`)
```javascript
// NEW: Starts RabbitMQ embedding worker
const embeddingWorker = spawn('npx', ['tsx', 'src/lib/workers/rabbitmq-embedding-worker.ts'], {
  env: workerEnv
});
```

### **3. Homepage** (`src/routes/+page.svelte`)
```svelte
<!-- NEW: Worker status panel -->
<div class="worker-details">
  <h3>🔧 Worker Status Details</h3>
  <div class="workers-grid">
    <!-- OCR, Embedding, Autotag worker cards -->
  </div>
</div>
```

### **4. Health API** (`src/routes/api/health/workers/+server.ts`) ← NEW FILE
```typescript
export const GET: RequestHandler = async ({ url }) => {
  const workers = await Promise.all([
    checkOCRWorker(),
    checkEmbeddingWorker(),
    checkAutotagWorker()
  ]);
  return json({ success: true, workers });
};
```

---

## 🎉 What You Get

### **Before:**
- ❌ Workers not integrated with homepage
- ❌ No health monitoring
- ❌ Manual worker startup required
- ❌ No real-time status updates

### **After:**
- ✅ Workers auto-start with `npm run dev:quic`
- ✅ Live health monitoring on homepage
- ✅ Real-time queue depth tracking
- ✅ Beautiful worker status cards
- ✅ Production-ready MinIO integration
- ✅ Graceful shutdown with Ctrl+C

---

## 🔧 Troubleshooting

### **Workers not showing online:**
1. Check if services are running:
   ```powershell
   curl http://localhost:5432  # PostgreSQL
   curl http://localhost:6379  # Redis
   curl http://localhost:9000  # MinIO
   curl http://localhost:11434 # Ollama
   curl http://localhost:5672  # RabbitMQ
   ```

2. Check worker logs in console (automatically prefixed):
   ```
   [OCR] Worker logs appear here
   [EMBED] Embedding worker logs
   ```

### **Queue depth not decreasing:**
- Workers may be processing slowly
- Check Ollama GPU usage: `curl http://localhost:11434/api/tags`
- Verify RabbitMQ queues: `curl http://localhost:15672/api/queues`

### **MinIO download errors:**
- Verify MinIO credentials in `.env.development`
- Check bucket exists: `http://localhost:9001` (MinIO Console)

---

## 📚 Documentation

- **Full Integration Guide:** `WORKER_INTEGRATION_COMPLETE.md` (this file's parent)
- **RabbitMQ Integration:** `RABBITMQ_INTEGRATION_SUMMARY.md`
- **Async Workflow:** `COMPLETE_ASYNC_WORKFLOW_GUIDE.md`
- **Worker Audit:** `CODEBASE_AUDIT_WORKERS.md`

---

## 🚀 Next Steps

1. **Deploy to Production:**
   - Add PM2 for worker process management
   - Implement worker autoscaling
   - Add Prometheus metrics

2. **Enhance Monitoring:**
   - WebSocket real-time updates (already wired)
   - Worker performance dashboard
   - Error rate tracking

3. **Optimize Performance:**
   - Increase Tesseract worker pool size
   - Implement batch processing
   - Add Redis result caching

---

**🎮 The YoRHa Legal AI Platform is now production-ready!**

Run `npm run dev:quic` and experience the complete async processing pipeline with real-time monitoring. ⚖️🚀
