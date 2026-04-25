# 🚨 Gemma3 Integration Troubleshooting Guide

Quick fixes for common issues when integrating your Gemma3 GGUF model.

## 🔥 Quick Fixes (Try These First)

### 1. Model File Not Found

```powershell
# Check if file exists
Test-Path ".\gemma3Q4_K_M\mo16.gguf"

# If false, verify your file location:
# ✅ Should be: C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mo16.gguf
# ❌ Not: /tmp/mo16.gguf (old Modelfile had wrong path)
```

### 2. Ollama Service Not Running

```bash
# Start Ollama service
ollama serve

# In another terminal, test:
curl http://localhost:11434/api/version
```

### 3. Model Import Failed

```bash
# Check current models
ollama list

# Remove bad model if exists
ollama rm gemma3-legal

# Import with corrected Modelfile
ollama create gemma3-legal -f Modelfile-Gemma3-Legal
```

### 4. Frontend API Errors

```bash
# Check if SvelteKit dev server is running
# Should see: "Local: http://localhost:5173"

# Test API endpoint directly:
curl http://localhost:5173/api/ai/test-gemma3
```

## 🔧 Common Error Solutions

### Error: "Failed to load model from file"

**Cause:** Wrong file path in Modelfile
**Solution:**

```bash
# Use the corrected Modelfile-Gemma3-Legal instead of Modelfile-Ultra-Light
ollama create gemma3-legal -f Modelfile-Gemma3-Legal
```

### Error: "Model 'gemma3-legal' not found"

**Cause:** Model not imported properly
**Solution:**

```bash
# Re-import with absolute path
cd "C:\Users\james\Desktop\deeds-web\deeds-web-app"
ollama create gemma3-legal -f Modelfile-Gemma3-Legal

# Verify creation
ollama list | findstr gemma
```

### Error: "API endpoint returns mock data"

**Cause:** Chat API still using fallback mode
**Solution:**

1. Check `src/routes/api/ai/chat/+server.ts` was updated
2. Restart SvelteKit dev server: `Ctrl+C` then `npm run dev`
3. Verify Ollama service is accessible

### Error: "TypeError: ollamaService.generate is not a function"

**Cause:** Service import issue
**Solution:**

```typescript
// In your API endpoint, check the import:
import { ollamaService } from "$lib/services/ollama-service";

// Verify the service file exists:
// src/lib/services/ollama-service.ts
```

### Error: "CORS error" or "Network error"

**Cause:** Service not accessible
**Solution:**

```bash
# Check if Ollama is running on correct port
netstat -an | findstr 11434

# If not running:
ollama serve
```

## 🧪 Quick Test Commands

### Test 1: Direct Model Test

```bash
ollama run gemma3-legal "What are the elements of a valid contract?"
```

**Expected:** Legal response about offer, acceptance, consideration, etc.

### Test 2: API Health Check

```bash
curl http://localhost:11434/api/version
```

**Expected:** JSON with Ollama version

### Test 3: SvelteKit API Test

```bash
curl -X GET http://localhost:5173/api/ai/test-gemma3
```

**Expected:** JSON with status and model info

### Test 4: Chat API Test

```bash
curl -X POST http://localhost:5173/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain contract law basics"}'
```

**Expected:** JSON response with legal explanation

## 📊 System Requirements Verification

### Memory Check

```powershell
# Check available RAM
Get-WmiObject -Class Win32_ComputerSystem | Select-Object TotalPhysicalMemory
```

**Required:** Minimum 4GB free for Q4_K_M model

### Disk Space Check

```powershell
# Check disk space
Get-WmiObject -Class Win32_LogicalDisk | Select-Object DeviceID, FreeSpace
```

**Required:** At least 5GB free space

### Port Availability

```bash
# Check if ports are available
netstat -an | findstr ":11434"  # Ollama
netstat -an | findstr ":5173"   # SvelteKit
netstat -an | findstr ":8001"   # vLLM (optional)
```

## 🔄 Complete Reset Process

If everything is broken, start fresh:

### Step 1: Clean Ollama

```bash
# Remove all models
ollama list
ollama rm gemma3-legal
ollama rm gemma3
# ... remove any other unwanted models
```

### Step 2: Clean Frontend

```bash
cd sveltekit-frontend
rm -rf node_modules
rm package-lock.json
npm install
```

### Step 3: Re-run Setup

```bash
# Use the complete setup script
.\SETUP-GEMMA3-COMPLETE.bat
```

## 🆘 Getting Detailed Logs

### Ollama Logs

```bash
# Run Ollama with verbose logging
OLLAMA_DEBUG=1 ollama serve
```

### SvelteKit Logs

```bash
# Check browser console (F12) for errors
# Check terminal where `npm run dev` is running
```

### Model Import Logs

```bash
# Verbose model creation
ollama create gemma3-legal -f Modelfile-Gemma3-Legal --verbose
```

## 📞 Support Checklist

Before asking for help, gather this information:

- [ ] Operating System and version
- [ ] Ollama version (`ollama --version`)
- [ ] Node.js version (`node --version`)
- [ ] Model file size and location
- [ ] Error messages (exact text)
- [ ] What you tried already
- [ ] Output of `ollama list`
- [ ] Content of your Modelfile

## 🎯 Performance Optimization

### If Model is Too Slow:

1. **Use Q4_0 instead of Q4_K_M** (faster, less memory)
2. **Reduce context length** in Modelfile: `PARAMETER num_ctx 4096`
3. **Lower prediction tokens**: `PARAMETER num_predict 512`
4. **Close other applications** to free RAM

### If Model Responses Are Poor:

1. **Check system prompt** in Modelfile
2. **Adjust temperature**: Lower = more consistent, Higher = more creative
3. **Verify model file** is the correct legal-trained version
4. **Test with specific legal queries** to verify training

## 📈 Success Indicators

You know it's working when:

- ✅ `ollama list` shows `gemma3-legal`
- ✅ `ollama run gemma3-legal "test"` gives responses
- ✅ Browser shows SvelteKit app at localhost:5173
- ✅ AI chat button appears and responds
- ✅ Responses contain legal terminology and concepts
- ✅ No console errors in browser (F12)

## 🚀 Advanced Configuration

### Custom System Prompts

Edit the Modelfile to customize behavior:

```
SYSTEM """You are a specialized Legal AI for [YOUR PRACTICE AREA].
Focus on [SPECIFIC REQUIREMENTS].
Always [YOUR GUIDELINES]."""
```

### Performance Tuning

```
PARAMETER temperature 0.1      # Consistency
PARAMETER top_p 0.8           # Focus
PARAMETER top_k 20            # Quality
PARAMETER repeat_penalty 1.05 # Avoid repetition
```

### Memory Optimization

```
PARAMETER num_ctx 4096        # Smaller context = less memory
PARAMETER num_batch 4         # Smaller batches = less memory
```

---

💡 **Pro Tip:** Keep the original working setup files as backup. The system has good architecture - most issues are configuration problems that can be fixed quickly.
