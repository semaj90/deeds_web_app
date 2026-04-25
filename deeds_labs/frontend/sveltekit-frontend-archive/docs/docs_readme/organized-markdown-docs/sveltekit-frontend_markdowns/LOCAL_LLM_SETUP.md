# Local LLM Integration with SvelteKit

This guide will help you set up and test the local LLM integration using Ollama and llama.cpp with the Gemma3 Q4_K_M model for your legal AI assistant.

## 🚀 Quick Start

### 1. Start Local LLM Services

```bash
npm run llm:start
```

This command will:

- Start Ollama service on port 11434
- Start llama.cpp server on port 8080
- Load the Gemma3 model into Ollama

### 2. Test the Integration

```bash
npm run llm:test
```

This will run comprehensive tests to verify all services are working correctly.

### 3. Start the Web Application

```bash
npm run dev
```

The SvelteKit app will be available at http://localhost:5173

### 4. Test the UI

Visit http://localhost:5173/test-ai-ask to test the integration with a user-friendly interface.

## 📂 Directory Structure

Your project should have this structure:

```
Deeds-App-doesn-t-work--main (2)/
├── Ollama/                    # Ollama installation
│   ├── ollama.exe
│   └── ollama app.exe
├── llama.cpp/                 # llama.cpp source/build
│   ├── llama-server.exe       # (or in build/bin/Release/)
│   └── ...
├── gemma3Q4_K_M/             # Gemma3 model
│   └── mo16.gguf
└── web-app/
    └── sveltekit-frontend/    # Your SvelteKit app
```

## 🛠️ Available Scripts

| Script                       | Description                                 |
| ---------------------------- | ------------------------------------------- |
| `npm run llm:start`          | Start both Ollama and llama.cpp with Gemma3 |
| `npm run llm:start:ollama`   | Start only Ollama service                   |
| `npm run llm:start:llamacpp` | Start only llama.cpp service                |
| `npm run llm:test`           | Test all LLM services                       |
| `npm run llm:test:verbose`   | Detailed test output                        |
| `npm run llm:test:full`      | Start services and run tests                |
| `npm run dev:with-llm`       | Start LLMs and web app together             |

## 🔧 Manual Setup

### Option 1: PowerShell Scripts

```powershell
# Start services
.\scripts\start-local-llms.ps1 -Service both -LoadGemma

# Test integration
.\scripts\test-llm-integration.ps1 -Verbose
```

### Option 2: Manual Commands

```bash
# Start Ollama
cd Ollama
ollama.exe serve

# In another terminal, load Gemma model
ollama create gemma3-legal -f Modelfile.gemma3

# Start llama.cpp (in another terminal)
cd llama.cpp
llama-server.exe -m ..\gemma3Q4_K_M\mo16.gguf --host 0.0.0.0 --port 8080
```

## 🏥 Health Checks

### API Endpoints

- **Local Health**: GET http://localhost:5173/api/ai/health/local
- **Test Generation**: POST http://localhost:5173/api/ai/health/local
- **AI Ask**: POST http://localhost:5173/api/ai/ask

### Service Endpoints

- **Ollama**: http://localhost:11434/api/version
- **llama.cpp**: http://localhost:8080/health

## 🐛 Troubleshooting

### Common Issues

#### 1. Ollama Won't Start

- **Problem**: Port 11434 already in use
- **Solution**: Kill existing Ollama processes or use a different port

#### 2. Gemma Model Not Found

- **Problem**: Model file missing or wrong path
- **Solution**: Ensure `mo16.gguf` is in the `gemma3Q4_K_M` directory

#### 3. Generation Failing

- **Problem**: Model not properly loaded
- **Solution**:
  ```bash
  ollama list  # Check available models
  ollama pull gemma2:2b  # Pull a fallback model
  ```

#### 4. Services Not Connecting

- **Problem**: Firewall or network issues
- **Solution**: Check Windows Firewall and antivirus settings

#### 5. Memory Issues

- **Problem**: Insufficient RAM for model
- **Solution**: Close other applications, the Gemma3 Q4_K_M model needs ~4GB RAM

### Debug Commands

```bash
# Verbose testing
npm run llm:test:verbose

# Check specific service
curl http://localhost:11434/api/version
curl http://localhost:8080/health

# View Ollama logs
ollama logs

# List available models
ollama list
```

## 🔍 Integration Points

The local LLM integration works through several key components:

1. **Configuration**: `src/lib/config/local-llm.ts`
2. **Service Layer**: `src/lib/services/ollama-service.ts`
3. **API Endpoints**: `src/routes/api/ai/`
4. **UI Components**: `src/routes/test-ai-ask/`

## 📊 Performance Notes

- **Ollama**: Generally faster startup, easier model management
- **llama.cpp**: More direct control, potentially faster inference
- **Model Loading**: First generation takes ~10-30 seconds
- **Inference Speed**: ~2-10 tokens/second depending on hardware

## 🔄 Development Workflow

1. Start LLM services: `npm run llm:start`
2. Start development server: `npm run dev`
3. Test changes at: http://localhost:5173/test-ai-ask
4. Run tests: `npm run llm:test`
5. Check health: Click "Check Health" button in UI

## 📚 Additional Resources

- [Ollama Documentation](https://ollama.ai/docs)
- [llama.cpp Documentation](https://github.com/ggerganov/llama.cpp)
- [Gemma Model Information](https://huggingface.co/google/gemma-2-2b-it)

## 🆘 Getting Help

If you encounter issues:

1. Run `npm run llm:test:verbose` for detailed diagnostics
2. Check the browser console for errors
3. Review the terminal output for service startup messages
4. Ensure all paths in `src/lib/config/local-llm.ts` are correct
