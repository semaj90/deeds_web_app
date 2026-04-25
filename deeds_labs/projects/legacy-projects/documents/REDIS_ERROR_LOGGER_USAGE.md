# How to Use Redis Auto-Solve Error Logger

## 🚀 Quick Start

### 1. Start the Redis Error Logging Server
```bash
# Terminal 1: Start the Go server
cd go-microservice
go run simd-redis-vite-server.go

# Should see:
# SIMD Redis Vite Server starting on :8080
# Proxying Vite dev server from :5173  
# Redis error logging active
# MCP Context7 auto-solve enabled
```

### 2. Start Your SvelteKit Development Server
```bash
# Terminal 2: Start SvelteKit (will be proxied through :8080)
cd sveltekit-frontend
npm run dev
```

### 3. Access Your App Through the Error Logger
```bash
# Instead of http://localhost:5173
# Use: http://localhost:8080

# All Vite errors will now be automatically:
# ✅ Logged to Redis
# ✅ Processed with MCP Context7  
# ✅ Written to logs/claude-pickup/
# ✅ Available for Claude Code
```

## 📱 Integration Options

### Option A: Automatic Integration (Recommended)
Add to your SvelteKit app's main layout:

```typescript
// sveltekit-frontend/src/app.html or src/routes/+layout.svelte
import { setupViteErrorLogging } from '$lib/services/vite-error-logger';

// Auto-setup error capture
if (typeof window !== 'undefined') {
  setupViteErrorLogging();
}
```

### Option B: Manual Error Logging
```typescript
// Anywhere in your SvelteKit app
import { viteErrorLogger } from '$lib/services/vite-error-logger';

// Log specific errors
viteErrorLogger.logManualError('typescript', 'My custom error', {
  component: 'MyComponent',
  context: 'user interaction'
});

// Get recent errors for display
const errors = await viteErrorLogger.getRecentErrors();
console.log('Recent errors:', errors);
```

### Option C: Svelte Component Integration
```svelte
<!-- Any .svelte component -->
<script>
  import { logComponentError } from '$lib/services/vite-error-logger';
</script>

<div use:logComponentError={{ 
  component: 'Button', 
  context: { version: '1.0' } 
}}>
  <!-- Your component content -->
</div>
```

## 🔧 Configuration

### Environment Variables
```bash
# .env file or export
REDIS_URL=localhost:6379          # Your Redis connection
OLLAMA_URL=http://localhost:11434 # For embeddings
CONTEXT7_ENDPOINT=http://localhost:3001  # MCP Context7
```

### Server Ports
- **:8080** - Redis error logger + Vite proxy
- **:5173** - Original Vite server (proxied)
- **:6379** - Redis server
- **:11434** - Ollama (embeddings)

## 📁 Output Files

### Error Logs Location
```
logs/claude-pickup/
├── vite-error-{timestamp}_{id}.json  # Full structured data
├── vite-error-{timestamp}_{id}.md    # Claude Code summary
└── README.md                         # Usage instructions
```

### Claude Code Integration
Claude Code automatically picks up files from `logs/claude-pickup/`:
- **JSON files**: Full error context with embeddings
- **MD files**: Human-readable summaries with fix suggestions
- **Auto-cleanup**: Files expire after 24 hours

## 🤖 Auto-Solve Features

### What Gets Auto-Solved
- **TypeScript errors**: Import issues, type mismatches
- **Svelte 5 errors**: Rune usage, component issues  
- **Build errors**: Module resolution, config problems
- **Runtime errors**: Hydration, reactive state issues

### Auto-Solve Output
```json
{
  "auto_solved": true,
  "solution": {
    "fixes": ["Specific fix 1", "Specific fix 2"],
    "confidence": 0.75,
    "library_docs": "Retrieved from MCP Context7",
    "claude_prompt": "Optimized for Claude Code",
    "copilot_summary": "GitHub Copilot ready"
  }
}
```

## 🔍 Real-Time Monitoring

### WebSocket Connection
```javascript
// Connect to real-time error stream
const ws = new WebSocket('ws://localhost:8080/api/vite/ws');

ws.onmessage = (event) => {
  const errorLog = JSON.parse(event.data);
  console.log('New error:', errorLog);
  
  if (errorLog.auto_solved) {
    console.log('✅ Auto-solved:', errorLog.solution.fixes);
  }
};
```

### HTTP API Endpoints
```bash
# Get recent errors
curl http://localhost:8080/api/vite/errors

# Search errors by keyword
curl http://localhost:8080/api/vite/errors?q=typescript

# Manual error logging
curl -X POST http://localhost:8080/api/vite/error \
  -H "Content-Type: application/json" \
  -d '{"type":"typescript","message":"Test error"}'
```

## 🧪 Testing

### Test the System
```bash
# Run the test suite
node test-error-logger.js

# Should generate 4 test errors:
# ✅ TypeScript error (Button.svelte)
# ✅ Svelte error (Layout component)  
# ✅ Build error (Import resolution)
# ✅ Runtime error (Hydration mismatch)
```

### Simulate Errors
```javascript
// In browser console (when on localhost:8080)
console.error('Vite build failed: Cannot resolve module');
// Will be automatically logged and processed
```

## 🔄 Workflow Integration

### Daily Development Workflow
1. **Morning**: Start `go run simd-redis-vite-server.go`
2. **Development**: Code normally on `http://localhost:8080`
3. **Errors happen**: Auto-logged and analyzed
4. **Claude Code**: Auto-picks up error summaries
5. **Fix errors**: Using AI-generated suggestions
6. **Evening**: Review error patterns in Redis

### Claude Code Integration
- Files appear in `logs/claude-pickup/`
- Claude Code automatically sees new error files
- Each error has full context + suggested fixes
- Embeddings enable semantic error search

### Team Integration
- Shared Redis instance logs all team errors
- Error patterns visible across projects  
- Auto-solve learns from team's codebase
- Knowledge sharing through error embeddings

## ⚙️ Advanced Usage

### Custom Error Types
```typescript
// Define custom error categories
viteErrorLogger.logManualError('legal-ai', 'Document parsing failed', {
  document_type: 'contract',
  ai_model: 'gemma-3',
  confidence: 0.23
});
```

### Error Pattern Analysis
```bash
# Redis CLI commands for analysis
docker exec legal-ai-redis redis-cli

# Get error stream
LRANGE vite:errors:stream 0 10

# Search by pattern (when vector search is enabled)
# Search for similar TypeScript errors using embeddings
```

### MCP Context7 Integration
The system automatically calls your existing MCP Context7 services:
- `mcp-context72-get-library-docs.ts` - Fetches relevant docs
- `context7-autosolve-integration.ts` - Attempts solutions
- `context7-mcp-integration.ts` - Orchestrates the process

## 🚨 Troubleshooting

### Common Issues
```bash
# Redis not connected
docker ps | grep redis  # Check if running
docker exec legal-ai-redis redis-cli ping  # Test connection

# Server won't start
cd go-microservice && go mod tidy  # Install dependencies
netstat -an | grep :8080  # Check port availability

# No errors being logged
# Check browser console: http://localhost:8080 (not :5173)
# Verify vite-error-logger.ts is imported
```

### Debug Mode
```bash
# Enable verbose logging
export DEBUG=true
go run simd-redis-vite-server.go
```

## 📊 Production Deployment

### Docker Compose Addition
```yaml
# Add to your docker-compose.yml
redis-error-logger:
  build: ./go-microservice
  ports:
    - "8080:8080"
  environment:
    - REDIS_URL=redis:6379
    - OLLAMA_URL=http://ollama:11434
  depends_on:
    - redis
    - ollama
```

---

## 🎯 Summary

**Start Command**: `go run simd-redis-vite-server.go`  
**Access URL**: `http://localhost:8080` (instead of :5173)  
**Error Files**: `logs/claude-pickup/*.json` and `*.md`  
**Auto-Solve**: Enabled with 75% confidence scoring  
**Claude Integration**: Automatic pickup from logs directory  

Your Vite errors now become **AI-powered debugging sessions** with full context, embeddings, and solution suggestions!