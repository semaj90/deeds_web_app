# Legal AI Development Environment - Quick Reference

## 🚀 Quick Start

```bash
# First time setup
npm run setup

# Start development (choose one)
npm run dev:full        # All services with monitoring
npm run dev:enhanced    # Frontend + Go API
npm run dev:windows     # Windows-optimized with PowerShell
npm run dev            # Basic frontend only
```

## 🔍 Error Checking

```bash
npm run check:all       # Run all checks (TypeScript, Svelte, Lint)
npm run check:fast      # Quick TypeScript check only
npm run check:errors    # Comprehensive error analysis
npm run check:watch     # Watch mode for continuous checking
```

## 🧪 Testing

```bash
npm run test            # Run all tests
npm run test:quick      # Quick validation tests
npm run test:health     # Health check all services
npm run test:e2e        # End-to-end tests
npm run test:coverage   # Test coverage report
```

## 🎯 Services

```bash
# Go Microservice
npm run go:service      # Start Go API
npm run go:build        # Build Go executable
npm run go:health       # Check Go API health

# Redis
npm run redis:start     # Start Redis server
npm run redis:cli       # Open Redis CLI
npm run redis:flush     # Clear Redis cache

# Ollama
npm run ollama:start    # Start Ollama service
npm run ollama:health   # Check Ollama status
npm run ollama:models   # List available models
npm run ollama:pull     # Download gemma3-legal model
```

## 📊 Monitoring

```bash
npm run monitor         # Full system monitoring
npm run monitor:lite    # Lightweight monitoring
npm run monitor:gpu     # GPU usage monitoring (NVIDIA)
```

## 🔧 Maintenance

```bash
npm run clean           # Clean build artifacts
npm run clean:all       # Clean everything including node_modules
npm run reinstall       # Clean and reinstall all dependencies
npm run security        # Check for security vulnerabilities
npm run analyze         # Analyze bundle size
```

## 📁 Project Structure

```
sveltekit-frontend/
├── scripts/
│   ├── check-errors.mjs         # Fast error checking
│   ├── dev-full-wrapper.mjs     # Full dev environment
│   ├── health-check.mjs         # Service health checks
│   ├── monitor-lite.mjs         # Lightweight monitoring
│   ├── setup-environment.mjs    # Environment setup
│   └── start-dev-windows.ps1    # Windows startup script
├── src/
│   └── routes/
│       └── api/
│           └── ai/
│               └── vector-search/
│                   └── +server.ts  # Fixed vector search endpoint
├── package.json                  # Enhanced npm scripts
└── START-DEV.bat                # Windows launcher

../
├── main.go                      # Go microservice
├── START-GPU-LEGAL-AI-8084.bat # GPU service launcher
└── gpu-ai-control-panel.bat    # GPU control panel
```

## ⚡ Windows Quick Launch

Double-click `START-DEV.bat` for an interactive menu:
- Full Stack Mode
- Enhanced Mode (Frontend + API)
- Basic Mode (Frontend only)
- GPU Accelerated Mode
- Health & Error Checks

## 🎮 GPU Acceleration

For GPU-accelerated AI:
1. Ensure NVIDIA drivers are installed
2. Run: `cd .. && gpu-ai-control-panel.bat`
3. Or use: `npm run dev:windows` with `-GPUMode` flag

## 🔥 Common Issues & Solutions

### JSON Parse Error in Vector Search
✅ Fixed: Enhanced error handling and request validation

### Port Already in Use
✅ Fixed: Auto-detection and cleanup of ports

### Redis Not Available
✅ Fixed: Automatic fallback to memory cache

### Ollama Models Missing
Run: `ollama pull gemma3-legal:latest`

### Out of Memory
Use: `NODE_OPTIONS='--max-old-space-size=8192' npm run dev`

## 📝 Environment Variables

Create `.env.development`:
```env
NODE_ENV=development
VITE_LEGAL_AI_API=http://localhost:8084
VITE_OLLAMA_URL=http://localhost:11434
VITE_REDIS_URL=redis://localhost:6379
VITE_ENABLE_GPU=true
```

## 🚨 Emergency Commands

```bash
# Kill all Node processes (Windows)
taskkill /F /IM node.exe

# Kill all Go processes (Windows)
taskkill /F /IM go.exe

# Clear all ports
netstat -ano | findstr :5173
taskkill /F /PID <PID>
```

## 📊 Performance Tips

1. **Use incremental TypeScript compilation** (already configured)
2. **Enable GPU acceleration** for AI operations
3. **Use Redis caching** for repeated operations
4. **Monitor memory usage** with `npm run monitor:lite`
5. **Run health checks** before deployments

## 🔗 Access URLs

- Frontend: http://localhost:5173
- API: http://localhost:8084
- API Health: http://localhost:8084/api/health
- API Metrics: http://localhost:8084/api/metrics
- UnoCSS Inspector: http://localhost:5173/__unocss/
- WebSocket Monitor: ws://localhost:8085

---

**Pro Tip**: Run `npm run setup` first, then use `START-DEV.bat` for the easiest development experience on Windows!
