# 🚀 AI Chat - Quick Start Checklist

## ✅ Step-by-Step Testing Guide

### 1️⃣ Start Your Development Server
```bash
cd sveltekit-frontend
npm run dev
```

### 2️⃣ Open Reports Generator
Navigate to: **http://localhost:5174/reports-generator**

### 3️⃣ Click "🤖 AI Assistant" Tab
You should see:
- Purple gradient header with "🤖 AI Legal Assistant"
- Capability badges showing status (✅ WASM, ❌/✅ Native, ❌/✅ Remote)
- Mode selector dropdown
- Empty state with suggestions

### 4️⃣ Check Capabilities
Look at the header badges:
- **✅ WASM**: Browser inference available (WebGPU/WASM SIMD)
- **❌ Native**: Not available in browser (normal)
- **✅ Remote**: Backend services available

### 5️⃣ Send Your First Message
Try one of these:
```
Summarize the evidence in this case
```
```
What are the key legal considerations for the Security Camera Footage evidence?
```
```
Analyze the witness statement and identify potential weaknesses
```

### 6️⃣ Watch the Response Generate
You'll see:
1. Message appears in your bubble (right side, purple)
2. "Generating..." message with blinking cursor
3. Tokens streaming in real-time
4. Final response with metadata:
   - Method used (wasm/native/remote)
   - Tokens per second
   - Processing time

### 7️⃣ Test Different Modes (Optional)
Change the mode selector:
- **Auto** (default): Smart selection
- **WASM**: Force browser-only (if available)
- **Remote**: Force backend service (if available)

Send another message and compare performance.

---

## 🧪 Expected Results

### Browser-Only Mode (WASM):
```
Message: "Summarize this case"

Response appears with metadata:
🤖 Just now | wasm • 25.3 tok/s • 1234ms

The case involves [summary text]...
```

### With Backend Services (Remote):
```
Message: "Analyze all evidence and provide recommendations"

Response appears with metadata:
🤖 Just now | remote • 312.5 tok/s • 456ms

Based on the evidence provided:
1. [Analysis]
2. [Recommendations]
```

---

## 🐛 Troubleshooting

### Issue: All capabilities show ❌
**Fix**: This is normal if no backend services are running. WASM should still work in modern browsers.

**Verify**:
```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# Check if GPU service is running
curl http://localhost:8095/health
```

**Start services** (if needed):
```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start GPU service (if you have it configured)
npm run dev:full
```

### Issue: "❌ Sorry, I encountered an error"
**Common causes**:
1. No backends available AND WASM failed to load
2. Network timeout
3. Model not loaded

**Fix**:
1. Check browser console for detailed error
2. Ensure you're using Chrome/Edge (best WASM support)
3. Try mode: "Remote" if available

### Issue: Response is very slow
**Expected**: First message may take 2-5s (model loading)
**Subsequent messages**: Should be faster

**Verify**:
- Check capability badges - using the right mode?
- Switch to "Remote" if available for faster responses

### Issue: Chat UI doesn't render
**Fix**:
1. Clear browser cache
2. Check console for import errors
3. Restart dev server

---

## 📊 Performance Benchmarks

### Expected Performance:
| Mode | First Message | Subsequent Messages | Tokens/sec |
|------|---------------|---------------------|------------|
| WASM (Browser) | 2-5s | 1-3s | 20-35 |
| Native (Node) | 1-3s | 0.5-2s | 80-120 |
| Remote (TensorRT) | 0.3-1s | 0.2-0.8s | 250-500 |

### Factors Affecting Speed:
- **Prompt length**: Longer = slower
- **Model size**: gemma3:270m vs gemma3-legal:latest
- **Hardware**: GPU vs CPU
- **First run**: Model loading overhead

---

## 🎯 Quick Feature Test

### Test Streaming:
1. Send a long prompt (> 200 chars)
2. Watch tokens appear one by one
3. Cursor blinks while generating

### Test Context Awareness:
1. Note the available evidence in the sidebar
2. Ask: "What evidence do we have?"
3. Response should mention: Security Camera Footage, Witness Statement, Physical Evidence

### Test Mode Switching:
1. Send message in "Auto" mode
2. Change to "WASM" (if available)
3. Send same message
4. Compare metadata (method, speed)

---

## ✅ Success Checklist

- [ ] Chat UI loads without errors
- [ ] Capability badges display correctly
- [ ] Can send a message
- [ ] Response appears (even if slow)
- [ ] Metadata shows (method, tok/s, time)
- [ ] Can switch modes
- [ ] Clear chat works
- [ ] Messages scroll correctly
- [ ] Timestamps appear

---

## 🎉 Next Actions

### If Everything Works:
1. ✅ Try the examples in `src/lib/ai/unified-llama-examples.ts`
2. ✅ Read the full guide: `AI_CHAT_INTEGRATION_GUIDE.md`
3. ✅ Customize the chat UI styling
4. ✅ Add custom legal prompts for your use case

### If Issues Persist:
1. 📝 Check browser console for errors
2. 📝 Verify service endpoints are accessible
3. 📝 Review `AI_CHAT_INTEGRATION_GUIDE.md` troubleshooting section
4. 📝 Check that models are downloaded:
   ```bash
   ollama list
   # Should show: gemma3:270m or gemma3-legal:latest
   ```

---

## 💡 Pro Tips

### Get Better Responses:
1. **Be specific**: "Analyze the witness statement for credibility issues"
2. **Use legal terminology**: The model is trained on legal text
3. **Ask follow-ups**: Build on previous responses
4. **Set context**: Mention specific evidence pieces

### Optimize Performance:
1. **Short queries**: Use WASM mode (faster for < 100 tokens)
2. **Long analysis**: Use Remote mode (TensorRT acceleration)
3. **Batch questions**: Ask multiple things in one message

### Debugging:
1. **Open DevTools**: F12 → Console tab
2. **Look for logs**: `[Unified Llama]` prefix
3. **Check network**: Verify API calls in Network tab

---

## 📞 Support

- **Documentation**: See `AI_CHAT_INTEGRATION_GUIDE.md`
- **Examples**: See `src/lib/ai/unified-llama-examples.ts`
- **Architecture**: See `LLAMA_CPP_WASM_INTEGRATION_STATUS.md`

---

**Ready? Go to http://localhost:5174/reports-generator and click "🤖 AI Assistant"! 🚀**
