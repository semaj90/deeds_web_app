# Case Notes Feature Enhancements - Testing Guide

**Quick Reference for Testing All 6 Features**

---

## Pre-Test Setup

### 1. Run Database Migrations
```bash
cd sveltekit-frontend
npm run db:migrate
```

### 2. Start Ollama (for AI features)
```bash
# Terminal 1
ollama serve

# Terminal 2 (after Ollama starts)
ollama pull gemma3-legal:latest
```

### 3. Start Development Server
```bash
# Terminal 3
npm run dev
```

### 4. Navigate to a Case
- Go to http://localhost:5173/dashboard
- Click on any case to open case detail page

---

## Feature 1: NES Modal UI ✅

### Test: Modal Opens and Closes

1. **Open Case Notes Modal**
   - Click "📝 Case Notes" button in header
   - ✅ Should see slide-out panel with notes editor
   - ✅ Should have dark theme with cyan accents

2. **Close Modal**
   - Click "✕" button in top-right
   - ✅ Modal should close smoothly
   - ✅ Focus should return to page

3. **Backdrop Click**
   - Click "📝 Case Notes" again
   - Click on the semi-transparent backdrop
   - ✅ Modal should close

4. **Keyboard Escape**
   - Click "📝 Case Notes" again
   - Press Escape key
   - ✅ Modal should close

---

## Feature 2: Case-Aware AI Contextual Chat ✅

### Test: Chat Opens with Case Context

1. **Open Chat Modal**
   - Click "🧠 AI Chat" button in header
   - ✅ Should see NES modal with chat interface
   - ✅ Should show "AI CONTEXTUAL CHAT" title

2. **Send Message**
   - Type: "What are the key facts in this case?"
   - Press Enter or click Send button
   - ✅ Should see user message appear
   - ✅ Should see typing indicator (3 dots)
   - ✅ Should see AI response with case context

3. **Citations**
   - Look for [NOTE:id], [EVID:id], etc. in response
   - ✅ Should see citations section below response
   - ✅ Citations should reference case data

4. **Multi-turn Conversation**
   - Send another message: "What are the risks?"
   - ✅ Should maintain conversation history
   - ✅ Should include previous messages in context

5. **Error Handling**
   - Stop Ollama service
   - Try to send a message
   - ✅ Should show error message
   - ✅ Should not crash

---

## Feature 3: Full-Text Search Inside Notes ✅

### Test: Search Notes by Content

1. **Create Test Notes**
   - Click "📝 Case Notes"
   - Create note with title "Evidence Analysis"
   - Content: "The defendant's fingerprints were found on the weapon"
   - Click Save
   - Create another note with title "Witness Statement"
   - Content: "The witness identified the defendant at the scene"
   - Click Save

2. **Search for Notes**
   - In notes list, look for search box (if implemented)
   - Type: "fingerprints"
   - ✅ Should see "Evidence Analysis" note highlighted
   - ✅ Should see preview with matching text

3. **Search Multiple Results**
   - Type: "defendant"
   - ✅ Should see both notes in results
   - ✅ Should show relevance ranking

4. **Clear Search**
   - Clear search box
   - ✅ Should show all notes again

---

## Feature 4: Note Version Diff View ✅

### Test: Version History (Database Ready)

1. **Create and Edit Note**
   - Create note: "Initial theory"
   - Edit content: "Updated theory with new evidence"
   - Click Save
   - Edit again: "Final theory after witness interview"
   - Click Save

2. **Check Database**
   - Open psql: `psql -U legal_admin -h localhost -d legal_ai_db`
   - Query: `SELECT * FROM case_note_versions;`
   - ✅ Should see 3 versions (initial + 2 updates)
   - ✅ Each should have different content

3. **Verify Cascade Delete**
   - Delete the note
   - Query: `SELECT * FROM case_note_versions WHERE note_id = '[note_id]';`
   - ✅ Should see 0 rows (versions deleted with note)

---

## Feature 5: Save AI Memo as Pinned Note ✅

### Test: Generate and Save AI Memo

1. **Create Multiple Notes**
   - Create 3-5 notes with case information
   - Include facts, evidence, legal issues

2. **Generate AI Memo**
   - Click "🧠 AI Memo" button in notes editor
   - ✅ Should show "Generating AI memo..." status
   - ✅ Should complete in 5-10 seconds

3. **Verify Memo Saved**
   - ✅ Should see new note at top of list
   - ✅ Should have title "AI Memo - [timestamp]"
   - ✅ Should have [AI] badge
   - ✅ Should have 📌 pin icon active

4. **Verify Content**
   - Click on AI memo note
   - ✅ Should see structured memo with:
     - Case Posture
     - Key Facts
     - Legal Issues
     - Risks/Weaknesses
     - Recommended Actions

5. **Edit Memo**
   - Edit the memo content
   - Click Save
   - ✅ Should update successfully
   - ✅ Should remain pinned

---

## Feature 6: Export Full Case Packet (PDF) ✅

### Test: Generate and Download PDF

1. **Create Case Data**
   - Create 3-5 notes (mix of regular and pinned)
   - Upload some evidence files
   - Generate AI memo (Feature 5)

2. **Export Packet**
   - Click "📄 Export Packet" button in header
   - ✅ Should show "Exporting..." status
   - ✅ Should complete in 10-15 seconds

3. **Verify PDF Download**
   - ✅ Should download file: `case_[id]_packet_[timestamp].pdf`
   - ✅ Should be valid PDF (can open in reader)

4. **Verify PDF Contents**
   - Open PDF in reader
   - ✅ Page 1: Cover page with case name, ID, status, timestamp
   - ✅ Page 2: Executive summary (AI-generated)
   - ✅ Page 3+: Evidence index (all evidence items)
   - ✅ Later pages: Pinned notes in order
   - ✅ All pages: Footer with page number and input hash

5. **Verify Determinism**
   - Export same case again
   - ✅ Should generate same PDF (same input hash)
   - ✅ Useful for audit purposes

---

## Integration Tests

### Test: Full Workflow

1. **Create Case with Evidence**
   - Create case
   - Upload evidence files
   - Create notes referencing evidence

2. **Use All Features**
   - Search notes (Feature 3)
   - Generate AI memo (Feature 5)
   - Open AI chat (Feature 2)
   - Export packet (Feature 6)

3. **Verify Data Consistency**
   - ✅ Notes appear in search
   - ✅ Memo appears in notes list
   - ✅ Chat references case data
   - ✅ PDF includes all data

---

## Performance Tests

### Test: Search Performance
- Create 100+ notes
- Search for common term
- ✅ Should return results in <100ms

### Test: PDF Generation
- Create case with 50+ notes
- Export packet
- ✅ Should complete in <30 seconds

### Test: Chat Response Time
- Send message to AI chat
- ✅ Should show response in <10 seconds

---

## Error Handling Tests

### Test: Missing Data
- Try to export packet with no notes
- ✅ Should show error or empty PDF

### Test: Ollama Offline
- Stop Ollama service
- Try to generate AI memo
- ✅ Should show error message
- ✅ Should not crash

### Test: Database Error
- Disconnect database
- Try to search notes
- ✅ Should show error message
- ✅ Should not crash

---

## Accessibility Tests

### Test: Keyboard Navigation
- Open modal with Tab key
- Navigate with Tab/Shift+Tab
- ✅ Should be able to reach all buttons
- ✅ Should be able to close with Escape

### Test: Screen Reader
- Use screen reader (NVDA, JAWS, etc.)
- ✅ Should announce modal title
- ✅ Should announce button labels
- ✅ Should announce form fields

### Test: Color Contrast
- Check modal colors with contrast checker
- ✅ Should meet WCAG AA standards

---

## Browser Compatibility Tests

### Test: Chrome/Edge
- ✅ All features should work

### Test: Firefox
- ✅ All features should work

### Test: Safari
- ✅ All features should work

---

## Regression Tests

### Test: Existing Features Still Work
- ✅ Case detail page loads
- ✅ Evidence upload works
- ✅ Evidence review works
- ✅ Summary generation works

---

## Test Results Template

```
Feature 1: NES Modal UI
- [ ] Modal opens
- [ ] Modal closes (button)
- [ ] Modal closes (backdrop)
- [ ] Modal closes (Escape)
Status: ✅ PASS / ❌ FAIL

Feature 2: AI Contextual Chat
- [ ] Chat opens
- [ ] Message sends
- [ ] Response received
- [ ] Citations shown
- [ ] Multi-turn works
Status: ✅ PASS / ❌ FAIL

Feature 3: Full-Text Search
- [ ] Search box visible
- [ ] Search returns results
- [ ] Results highlighted
- [ ] Clear search works
Status: ✅ PASS / ❌ FAIL

Feature 4: Note Versioning
- [ ] Versions created
- [ ] Versions stored
- [ ] Cascade delete works
Status: ✅ PASS / ❌ FAIL

Feature 5: AI Memo Pinning
- [ ] Memo generated
- [ ] Memo saved
- [ ] Memo pinned
- [ ] Memo content correct
Status: ✅ PASS / ❌ FAIL

Feature 6: Case Packet Export
- [ ] PDF generated
- [ ] PDF downloaded
- [ ] PDF has cover page
- [ ] PDF has summary
- [ ] PDF has evidence index
- [ ] PDF has notes
- [ ] PDF has footers
Status: ✅ PASS / ❌ FAIL

Overall: ✅ ALL PASS / ❌ SOME FAILURES
```

---

## Quick Test Commands

```bash
# Check database migrations
psql -U legal_admin -h localhost -d legal_ai_db -c "\dt case_notes"

# Check full-text search index
psql -U legal_admin -h localhost -d legal_ai_db -c "\di idx_case_notes_fts"

# Check note versions table
psql -U legal_admin -h localhost -d legal_ai_db -c "\dt case_note_versions"

# Test search endpoint
curl -X GET "http://localhost:5173/api/cases/[caseId]/notes/search?q=test"

# Test memo save endpoint
curl -X POST "http://localhost:5173/api/cases/[caseId]/export/memo/save" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Memo"}'

# Test packet export endpoint
curl -X POST "http://localhost:5173/api/cases/[caseId]/export/packet" \
  -o case_packet.pdf

# Test contextual chat
curl -X POST "http://localhost:5173/api/ai/contextual-chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"What are the key facts?","caseId":"[caseId]"}'
```

---

## Troubleshooting

### Modal not opening
- Check browser console for errors
- Verify NesModal component is imported
- Check that showChatModal state is toggling

### Search not working
- Verify migration 0006 was run
- Check that tsvector column exists: `\d case_notes`
- Try manual query: `SELECT * FROM case_notes WHERE content_tsv @@ plainto_tsquery('english', 'test');`

### AI features not working
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Verify model is installed: `ollama list`
- Check OLLAMA_ENDPOINT in .env

### PDF export fails
- Verify pdf-lib is installed: `npm list pdf-lib`
- Check browser console for errors
- Verify case has data to export

---

## Success Criteria

✅ **All 6 features working**
- NES Modal UI opens/closes correctly
- AI Chat sends/receives messages with case context
- Full-text search returns relevant results
- Note versions are created and stored
- AI memo is generated and saved as pinned note
- Case packet PDF is generated and downloaded

✅ **No errors or crashes**
- All error cases handled gracefully
- No console errors
- No database errors

✅ **Performance acceptable**
- Search completes in <100ms
- PDF generation completes in <30s
- Chat response in <10s

✅ **Accessibility met**
- Keyboard navigation works
- Screen reader compatible
- Color contrast adequate

---

## Sign-Off

- [ ] All tests passed
- [ ] No critical issues
- [ ] Ready for production deployment

**Tested by:** _______________
**Date:** _______________
**Notes:** _______________

