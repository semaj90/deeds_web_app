# Case Notes Feature Enhancements - Quick Start Guide

**Get up and running in 5 minutes**

---

## Step 1: Run Database Migrations (1 minute)

```bash
cd sveltekit-frontend
npm run db:migrate
```

**What this does:**
- Creates `content_tsv` column on `case_notes` table
- Creates GIN index for full-text search
- Creates `case_note_versions` table for version history

**Verify:**
```bash
psql -U legal_admin -h localhost -d legal_ai_db -c "\dt case_notes"
psql -U legal_admin -h localhost -d legal_ai_db -c "\dt case_note_versions"
```

---

## Step 2: Start Ollama (2 minutes)

```bash
# Terminal 1
ollama serve

# Wait for "Listening on 127.0.0.1:11434"
# Then in Terminal 2:
ollama pull gemma3-legal:latest
```

**What this does:**
- Starts Ollama service on port 11434
- Downloads gemma3-legal model for AI features

**Verify:**
```bash
curl http://localhost:11434/api/tags
```

---

## Step 3: Start Development Server (1 minute)

```bash
# Terminal 3
cd sveltekit-frontend
npm run dev
```

**What this does:**
- Starts SvelteKit dev server on port 5173
- Hot-reloads on file changes

**Verify:**
- Open http://localhost:5173 in browser
- Should see login page

---

## Step 4: Test the Features (1 minute)

### 4a. Navigate to a Case
1. Login to the application
2. Go to Dashboard
3. Click on any case to open case detail page

### 4b. Test NES Modal
1. Click "📝 Case Notes" button
2. ✅ Should see slide-out panel with notes editor
3. Click "✕" to close
4. ✅ Should close smoothly

### 4c. Test AI Chat
1. Click "🧠 AI Chat" button
2. ✅ Should see NES modal with chat interface
3. Type: "What are the key facts in this case?"
4. Press Enter
5. ✅ Should see AI response with case context

### 4d. Test PDF Export
1. Click "📄 Export Packet" button
2. ✅ Should download PDF file
3. Open PDF in reader
4. ✅ Should see cover page, summary, evidence index, notes

---

## Troubleshooting

### Issue: Database migration fails
```bash
# Check if migrations already ran
psql -U legal_admin -h localhost -d legal_ai_db -c "\d case_notes"

# If content_tsv column exists, migration already ran
# If not, check error message and try again
```

### Issue: Ollama not starting
```bash
# Check if port 11434 is in use
netstat -an | grep 11434

# If in use, kill the process or use different port
# Check Ollama logs for errors
```

### Issue: Dev server won't start
```bash
# Check if port 5173 is in use
netstat -an | grep 5173

# If in use, kill the process or use different port
npm run dev -- --port 5174
```

### Issue: AI features not working
```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Verify model is installed
ollama list

# Check .env file has correct OLLAMA_ENDPOINT
cat .env | grep OLLAMA
```

---

## Full Testing Workflow

### 1. Create Test Case Data
```bash
# In browser, navigate to case detail page
# Create 3-5 notes with case information
# Upload some evidence files
```

### 2. Test Search
```bash
# In notes editor, look for search box
# Type a search term
# Verify results appear
```

### 3. Test AI Memo
```bash
# Click "🧠 AI Memo" button
# Wait for memo to generate
# Verify memo appears as pinned note at top
```

### 4. Test AI Chat
```bash
# Click "🧠 AI Chat" button
# Send message: "What are the key facts?"
# Verify response includes case context
```

### 5. Test PDF Export
```bash
# Click "📄 Export Packet" button
# Wait for PDF to generate
# Verify PDF downloads
# Open PDF and verify contents
```

---

## API Testing (Optional)

### Test Search Endpoint
```bash
curl -X GET "http://localhost:5173/api/cases/[caseId]/notes/search?q=test"
```

### Test Memo Save Endpoint
```bash
curl -X POST "http://localhost:5173/api/cases/[caseId]/export/memo/save" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Memo"}'
```

### Test PDF Export Endpoint
```bash
curl -X POST "http://localhost:5173/api/cases/[caseId]/export/packet" \
  -o case_packet.pdf
```

### Test Contextual Chat Endpoint
```bash
curl -X POST "http://localhost:5173/api/ai/contextual-chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"What are the key facts?","caseId":"[caseId]"}'
```

---

## Environment Variables

Make sure `.env` has these variables:

```
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db
OLLAMA_ENDPOINT=http://localhost:11434
```

---

## File Locations

### New Components
- `src/lib/components/nes/NesModal.svelte`
- `src/lib/components/cases/ContextualChatModal.svelte`

### New Services
- `src/lib/server/cases/caseSynthesis.ts`

### New Endpoints
- `src/routes/api/cases/[caseId]/notes/search/+server.ts`
- `src/routes/api/cases/[caseId]/export/memo/save/+server.ts`
- `src/routes/api/cases/[caseId]/export/packet/+server.ts`

### Updated Files
- `src/routes/api/ai/contextual-chat/+server.ts`
- `src/routes/(app)/cases/[id]/+page.svelte`

### Database Migrations
- `drizzle/0006_case_notes_fts.sql`
- `drizzle/0007_case_note_versions.sql`

---

## Success Criteria

✅ **All features working:**
- [ ] NES Modal opens/closes
- [ ] AI Chat sends/receives messages
- [ ] Full-text search works
- [ ] AI memo generates and saves
- [ ] PDF exports successfully

✅ **No errors:**
- [ ] No console errors
- [ ] No database errors
- [ ] No API errors

✅ **Performance acceptable:**
- [ ] Search completes in <100ms
- [ ] PDF generation completes in <30s
- [ ] Chat response in <10s

---

## Next Steps

1. ✅ Run migrations
2. ✅ Start Ollama
3. ✅ Start dev server
4. ✅ Test features
5. 📝 Report any issues
6. 🚀 Deploy to production

---

## Support

For detailed information, see:
- `IMPLEMENTATION_COMPLETE.md` - Full implementation details
- `TESTING_GUIDE.md` - Comprehensive testing procedures
- `design.md` - Architecture and design decisions
- `requirements.md` - Feature requirements

---

## Quick Commands Reference

```bash
# Database
npm run db:migrate                    # Run migrations
psql -U legal_admin -h localhost -d legal_ai_db  # Connect to DB

# Ollama
ollama serve                          # Start Ollama
ollama pull gemma3-legal:latest      # Download model
ollama list                           # List models

# Development
npm run dev                           # Start dev server
npm run dev -- --port 5174           # Use different port

# Testing
curl http://localhost:11434/api/tags # Check Ollama
curl http://localhost:5173/api/health # Check app
```

---

## Estimated Time

- Database setup: 1 minute
- Ollama setup: 2 minutes
- Dev server: 1 minute
- Testing: 1 minute
- **Total: ~5 minutes**

---

## Questions?

Check the documentation files:
1. `IMPLEMENTATION_COMPLETE.md` - What was built
2. `TESTING_GUIDE.md` - How to test
3. `design.md` - How it works
4. `requirements.md` - What it should do

