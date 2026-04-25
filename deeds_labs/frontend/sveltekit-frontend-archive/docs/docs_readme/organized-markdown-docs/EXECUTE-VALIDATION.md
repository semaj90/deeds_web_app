# 🚀 LEGAL AI SYSTEM - IMMEDIATE EXECUTION GUIDE

## ⚡ Quick Start Commands

### Terminal 1: Start Ollama with GPU
```powershell
$env:CUDA_VISIBLE_DEVICES="0"
$env:OLLAMA_GPU_COMPUTE_CAPABILITY="7.5"
ollama serve
```

### Terminal 2: Import Legal Model
```powershell
ollama create gemma3-legal -f local-models/Modelfile.gemma3-legal
ollama pull nomic-embed-text
```

### Terminal 3: Install Dependencies & Start Dev Server
```powershell
cd sveltekit-frontend
npm install lucide-svelte uuid pdf-parse --save
npm run dev
```

### Terminal 4: Start Context7 MCP Server
```powershell
node context7-mcp-server.js
```

### Terminal 5: Execute Validation
```powershell
.\manual-validation.ps1
```

## 🎯 Test URLs

Once all services are running, test these endpoints:

### Frontend Interfaces
- **Legal AI Suite**: http://localhost:5173/legal-ai-suite
- **AI Assistant Demo**: http://localhost:5173/demo/ai-assistant  
- **System Summary**: http://localhost:5173/demo/system-summary

### API Endpoints (Test with Postman/curl)
- **Multi-PDF Processing**: `POST http://localhost:5173/api/legal/ingest`
- **Enhanced RAG Query**: `POST http://localhost:5173/api/enhanced-rag/query`
- **Evidence Synthesis**: `POST http://localhost:5173/api/evidence/synthesize`

## 📊 Expected Results

### ✅ Success Indicators
- **GPU Status**: CUDA visible devices detected
- **Ollama**: Models loaded, responding < 5s
- **SvelteKit**: Dev server on port 5173
- **MCP Server**: Context7 healthy on port 40000
- **APIs**: 200 OK or 401 Unauthorized (auth layer working)

### 🔧 Troubleshooting
- **GPU Issues**: Check NVIDIA drivers, CUDA toolkit
- **Ollama Offline**: Restart service, check port 11434
- **SvelteKit Errors**: Run `npm install`, check TypeScript
- **MCP Failed**: Restart Context7 server, check port 40000

## 🧪 Manual Testing Workflow

### 1. Upload Legal PDFs
- Navigate to Legal AI Suite
- Select multiple PDF files
- Choose jurisdiction (federal/state/local)
- Click "Process Documents"
- Verify entities extracted, prosecution scores calculated

### 2. Test Enhanced RAG
- Enter legal query: "contract liability clauses"
- Execute RAG query
- Verify semantic search results
- Check fact-checking status
- Review prosecution relevance scores

### 3. Validate System Logs
- Monitor real-time logs in UI
- Check GPU acceleration status
- Verify processing speeds
- Confirm case AI summary scores

## 🎯 Performance Targets

- **Document Processing**: < 30s per PDF
- **RAG Queries**: < 3s response time
- **GPU Utilization**: > 70% during processing
- **Memory Usage**: < 8GB total system
- **API Response**: < 2s for most endpoints

## 📋 Validation Status

Run `.\manual-validation.ps1` and verify:
- [ ] GPU acceleration confirmed
- [ ] Ollama service healthy
- [ ] SvelteKit dev server running
- [ ] Context7 MCP operational
- [ ] Legal API endpoints accessible
- [ ] Enhanced RAG returning results
- [ ] Multi-PDF processing functional
- [ ] Real-time logging active

## 🔄 Iteration Process

1. **Execute validation script**
2. **Report any failing endpoints**
3. **Fix issues systematically**
4. **Re-run validation**
5. **Repeat until all systems operational**

## Status: READY FOR MANUAL EXECUTION
All components implemented and ready for testing.