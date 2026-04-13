# Testing Sprint 4B - Quick Start Guide

**Status**: Document pipeline READY ✅ | Audio pipeline needs Whisper ⏳

---

## ✅ Infrastructure Setup Complete

All core infrastructure is configured and ready:

- ✅ **Qdrant** chat_documents collection (768-dim, Cosine)
- ✅ **PostgreSQL** chat_document_attachments table
- ✅ **Ollama** embeddinggemma + gemma4 models
- ✅ **LangExtract** service healthy
- ✅ **RabbitMQ** running with queues
- ✅ **pdf-parse** NPM package installed

**Only missing**: Whisper CLI for audio transcription (optional for document testing)

---

## 🧪 Test 1: Document Upload (Ready Now!)

### Automated Test

```bash
cd sveltekit-frontend
node scripts/tests/test-document-upload.mjs
```

This will:
1. Upload a test TXT document
2. Trigger RabbitMQ document.embed queue
3. Wait for Qdrant indexing
4. Verify chunks are searchable

### Manual UI Test

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Navigate to chat interface

3. Use `FileUploadModal` to upload a document:
   - PDF (requires pdf-parse ✅ installed)
   - TXT file
   - MD file
   - JSON file

4. Send a chat message asking about document content:
   ```
   "What does the uploaded document say about payment terms?"
   ```

5. Verify LLM response includes:
   - Document citations `[Document 1, Excerpt 2]`
   - Quoted content from your document
   - Accurate information

---

## 🎵 Test 2: Audio Upload (Requires Whisper)

### Install Whisper First

**Option 1: Python (Recommended)**
```bash
pip install -U openai-whisper
whisper --version  # Verify installation
```

**Option 2: Node.js**
```bash
npm install -g whisper-node
```

### Automated Test

```bash
# After installing Whisper
cd sveltekit-frontend
node scripts/tests/test-audio-pipeline.mjs
```

**Note**: Requires test audio file at `scripts/tests/fixtures/test-audio.mp3`

### Manual UI Test

1. Record or download a test audio file (MP3, WAV, M4A)

2. Use `ChatPromptBar` upload button

3. Watch `AudioUploadWidget` show real-time progress:
   - ⏳ Uploading...
   - 🎤 Transcribing audio (Whisper)
   - 🧠 Analyzing content (ACE)
   - 📊 Indexing for search (Qdrant)
   - ✅ Complete!

4. View transcription details:
   - Full text
   - Language detected
   - Entities found
   - Legal tags

---

## 🔍 Infrastructure Verification

Run the verification script anytime:

```bash
cd sveltekit-frontend
node scripts/tests/verify-sprint4b-infrastructure.mjs
```

**Checks:**
- ✅ Qdrant chat_documents collection
- ✅ Ollama models (embeddinggemma, gemma4)
- ✅ LangExtract service health
- ✅ RabbitMQ running
- ✅ Database tables
- ⚠️  Whisper CLI availability

---

## 📋 Quick Verification Checklist

### Before Testing

- [ ] Dev server running (`npm run dev`)
- [ ] Qdrant running (port 6333)
- [ ] PostgreSQL running (port 5434)
- [ ] Ollama running (port 11434)
- [ ] RabbitMQ running (port 5672)
- [ ] LangExtract running (port 8095)
- [ ] Redis running (port 6379)

### For Document Upload

- [x] pdf-parse installed
- [x] chat_document_attachments table exists
- [x] Qdrant chat_documents collection created
- [x] Document embed consumer registered in hooks.server.ts

### For Audio Upload

- [ ] Whisper CLI installed
- [x] audio.process RabbitMQ queue exists
- [x] Audio processor integrated
- [x] Audio consumer registered in hooks.server.ts

---

## 🐛 Troubleshooting

### Document upload succeeds but no embedding

**Check RabbitMQ consumer:**
```bash
# Look for console output
docker logs deeds-web-app 2>&1 | grep "Document Embed"
```

**Check queue:**
```bash
docker exec deeds-rabbitmq rabbitmqctl list_queues name messages
```

### Qdrant indexing fails

**Check collection:**
```bash
curl http://localhost:6333/collections/chat_documents
```

**Check Qdrant health:**
```bash
curl http://localhost:6333/health
```

### Chat doesn't include document context

**Check attachment record:**
```sql
SELECT * FROM chat_document_attachments
WHERE embedding_status = 'completed'
ORDER BY upload_timestamp DESC
LIMIT 5;
```

**Check Qdrant search:**
```bash
curl -X POST http://localhost:6333/collections/chat_documents/points/search \
  -H 'Content-Type: application/json' \
  -d '{
    "limit": 5,
    "with_payload": true,
    "vector": [0.1, 0.2, ..., 0.768]  # Use actual embedding
  }'
```

---

## 📊 Expected Performance

### Document Pipeline (10-page PDF)
```
Upload:        < 1s
Text extract:  1-2s (pdf-parse)
Chunking:      50ms (20 chunks)
Embedding:     2-3s (embeddinggemma × 20)
Qdrant index:  500ms
─────────────────────
Total:         4-6 seconds
```

### Audio Pipeline (60s audio file)
```
Upload:        < 1s
Whisper GPU:   3s
LangExtract:   200ms
ACE analysis:  2s
Qdrant index:  500ms
─────────────────────
Total:         ~6 seconds (GPU)
               ~18 seconds (CPU fallback)
```

---

## 🎯 Success Criteria

### Document Upload ✅
- [ ] File uploads without errors
- [ ] Attachment record created in database
- [ ] Document chunked (visible in logs)
- [ ] Chunks embedded and indexed in Qdrant
- [ ] Chat message includes document context
- [ ] LLM response cites document correctly

### Audio Upload ⏳
- [ ] Audio file uploads without errors
- [ ] Evidence record created
- [ ] Whisper transcription completes
- [ ] Entities extracted (PERSON, DATE, MONEY, etc.)
- [ ] ACE analysis generates summary + tags
- [ ] Transcription indexed in Qdrant
- [ ] Evidence metadata updated with full results

---

## 🚀 Next Steps After Testing

Once document upload is verified:

1. **Install Whisper** - Enable audio pipeline
2. **Test with real files** - Legal PDFs, case recordings
3. **Load testing** - Multiple concurrent uploads
4. **MinIO integration** - Replace local filesystem (production)
5. **Error monitoring** - Set up alerting for failed uploads
6. **UI polish** - Add progress animations, error states

---

## 📝 Test Results Template

```
### Test Session: [Date]

**Document Upload:**
- Upload: ✅/❌
- Embedding: ✅/❌
- Chat context: ✅/❌
- Citations: ✅/❌

**Audio Upload:**
- Upload: ✅/❌
- Transcription: ✅/❌
- Entities: ✅/❌
- ACE analysis: ✅/❌
- Indexing: ✅/❌

**Performance:**
- Document (10 pages): ___s
- Audio (60s): ___s

**Issues Found:**
1. [Issue description]
2. [Issue description]

**Notes:**
[Any observations or feedback]
```

---

**Built with**: SvelteKit 2 • Svelte 5 • XState v5 • RabbitMQ • Qdrant • Ollama • PostgreSQL

**Ready to test!** 🎉
