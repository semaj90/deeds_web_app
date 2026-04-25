# 🚀 Professional Development Setup

## Professional PATH Configuration (Recommended)

Instead of complex `cmd /c` commands, use the clean, portable approach:

```bash
# Add to ~/.bashrc for permanent setup
export PATH="$PATH:/c/Program Files/LLVM/bin"
export CC=clang
export CXX=clang++
export CGO_ENABLED=1
export CGO_LDFLAGS=-lkernel32
```

**Why this is better:**
- ✅ Portable across environments  
- ✅ Standard professional practice
- ✅ Works with all tools automatically
- ✅ No complex quoting needed

## Local LLM Models Setup

Your custom models are ready:
- `gemma-legal.gguf` - Legal AI specialist
- `deeds-web.gguf` - Property/real estate expert

```bash
# Create Ollama models from your GGUF files
ollama create gemma-legal -f Modelfile-legal
ollama create deeds-web -f Modelfile-deeds
```

## Go-Enhanced Vite Server Architecture

**The Problem We Solved:**
- SvelteKit dev server (:5173) + Go API server (:8081) = CORS issues
- Multiple ports to remember
- Complex proxy configuration

**Our Solution:**
- Single unified server on :3000
- Go server handles API routes directly  
- Proxies everything else to Vite
- Zero CORS issues (same origin)

```
┌─────────────────────────────────────────┐
│  Browser: http://localhost:3000         │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  Go Enhanced Server (:3000)             │
│  ├─ /api/* → Go handlers                │
│  ├─ /ws → WebSocket                     │  
│  └─ /* → Proxy to Vite (:5173)         │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  SvelteKit Dev Server (:5173)           │
│  [Background process]                   │
└─────────────────────────────────────────┘
```

## Development Workflow Options

### Option 1: One-Command Start (Recommended)
```bash
cd sveltekit-frontend
npm run dev:enhanced
```
This runs:
- SvelteKit dev server (:5173) in background
- Go enhanced server (:3000) with proxy
- Access at: http://localhost:3000

### Option 2: Windows Batch Script
```bash
# From project root
./start-dev-concurrent.bat
```
This sets up PATH properly and starts everything.

### Option 3: Manual (for debugging)
```bash
# Terminal 1: SvelteKit
cd sveltekit-frontend && npm run dev

# Terminal 2: Go Enhanced Server
cd go-microservice && go run dev-proxy-server.go batch_embed.go main.go
```

## API Endpoints Available

When using the enhanced server on :3000:

### Go API Routes
- `POST /api/batch-embed` - SIMD-accelerated batch embeddings
- `POST /api/ai/chat` - Chat with gemma-legal model
- `POST /api/upload` - File upload with processing
- `GET /api/health` - Go service health
- `GET /ws?docId=123` - WebSocket for real-time updates

### Proxied SvelteKit Routes  
- `/` - Main application
- `/cases` - Case management
- `/evidence` - Evidence handling
- `/ai` - AI assistant interface
- All other SvelteKit routes

## Component Library (Barrel Files)

Your components are organized with professional barrel exports:

```javascript
// src/lib/index.js (barrel file)
export { default as AIButton } from './components/ai/AIButton.svelte';
export { default as AIChatInterface } from './components/ai/AIChatInterface.svelte';
export { default as EnhancedEvidenceCanvas } from './components/canvas/EnhancedEvidenceCanvas.svelte';

// Clean imports for users
import { AIButton, AIChatInterface } from 'legal-ai-components';
```

## Testing the Setup

```bash
# Check Go server health
curl http://localhost:3000/api/health

# Test batch embedding
curl -X POST http://localhost:3000/api/batch-embed \
  -H "Content-Type: application/json" \
  -d '{"docId":"test","chunks":["Legal document text"]}'

# Test WebSocket (in browser console)
const ws = new WebSocket('ws://localhost:3000/ws?docId=test');
ws.onmessage = (e) => console.log('Received:', JSON.parse(e.data));
```

## Troubleshooting

### PATH Not Working
```bash
# Verify Clang is found
which clang
clang --version

# If not found, add to ~/.bashrc:
echo 'export PATH="$PATH:/c/Program Files/LLVM/bin"' >> ~/.bashrc
source ~/.bashrc
```

### Go Build Fails
```bash
# Check environment
echo $CC $CXX $CGO_ENABLED $CGO_LDFLAGS

# Should show:
# clang clang++ 1 -lkernel32
```

### Port Conflicts
- SvelteKit dev: Change port in `vite.config.js`
- Go server: Change `goServerPort` in `dev-proxy-server.go`

## Production Notes

This setup is optimized for development. For production:
- Build SvelteKit: `npm run build`
- Deploy Go server as reverse proxy
- Use proper process management (PM2, systemd)
- Configure production CORS headers

## Next Steps

1. Start development: `npm run dev:enhanced`
2. Open http://localhost:3000
3. Test AI features with your custom models
4. Develop with zero CORS issues
5. Real-time updates via WebSocket