# 🚀 Legal AI Native Windows Orchestration Guide

## Architecture Overview

This legal AI system runs natively on Windows without Docker, using PM2 for process management and native Windows services. The architecture includes SvelteKit frontend, Node.js services, Python AutoGen middleware, Go high-performance services, and Rust WASM components.

```
┌─ SvelteKit Frontend (Port 5173) ─┐
│  └─ Svelte 5 + Vite + UnoCSS     │
│  └─ Bits UI + NieR Automata Theme│
└───────────────────────────────────┘
              │ HTTP API calls
              ▼
┌─ Node.js API Layer (Port 3000) ──┐
│  └─ Context7 MCP Server          │
│  └─ Enhanced RAG Engine          │
│  └─ Local Ollama Embeddings      │
└───────────────────────────────────┘
              │ Specialized calls
              ▼
┌─ Python AutoGen (Port 8000) ─────┐
│  └─ FastAPI + Multi-Agent        │
│  └─ Legal-specific AI reasoning  │
│  └─ CrewAI orchestration         │
└───────────────────────────────────┘
              │ Performance calls
              ▼
┌─ Go Services (Ports 8080+) ──────┐
│  └─ SIMD acceleration            │
│  └─ Legal-BERT ONNX inference    │
│  └─ GPU acceleration (CUDA)      │
└───────────────────────────────────┘
              │ WASM Bridge
              ▼
┌─ Rust Services (WASM) ───────────┐
│  └─ System filesystem access     │
│  └─ Windows service integration  │
│  └─ Low-level kernel programming │
└───────────────────────────────────┘
```

## Prerequisites

### Required Software

1. **Node.js** (v18+) with npm
2. **Python** (3.9+) with pip
3. **Go** (1.21+)
4. **Rust** (latest stable)
5. **PostgreSQL** 17 with pgvector extension
6. **Ollama** for local LLM inference
7. **PM2** for process management

### Optional Services

- **Redis** (for caching)
- **Qdrant** (for vector storage)
- **Neo4j** (for knowledge graphs)

## Quick Start

### 1. Environment Setup

```bash
# Clone repository
git clone <repository-url>
cd deeds-web-app

# Set environment variables
set DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db
set OLLAMA_URL=http://localhost:11434
set OLLAMA_EMBED_MODEL=nomic-embed-text
set NODE_ENV=development
```

### 2. Database Setup

```bash
# Start PostgreSQL service
net start postgresql-x64-17

# Create database and user
"C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres legal_ai_db
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d legal_ai_db -f database-schema.sql

# Verify connection
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U legal_admin -d legal_ai_db -h localhost -c "SELECT version();"
```

### 3. Service Installation

```bash
# Install Node.js dependencies
cd sveltekit-frontend && npm install
cd ../mcp && npm install

# Install Python dependencies
pip install fastapi uvicorn autogen-agentchat transformers torch

# Install Go dependencies
cd go-microservice
go mod init legal-ai-services
go get github.com/go-kratos/kratos/v2
go build -o legal-ai-server.exe

# Install Rust dependencies
cd rust-services
cargo build --release
```

### 4. Ollama Setup

```bash
# Start Ollama service
start /B ollama serve

# Pull required models
ollama pull nomic-embed-text
ollama pull llama3.2:latest
ollama pull gemma3-legal  # Optional legal-specific model
```

## Process Management with PM2

### PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'sveltekit-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: './sveltekit-frontend',
      env: {
        PORT: 5173,
        DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
        OLLAMA_URL: 'http://localhost:11434'
      }
    },
    {
      name: 'context7-server',
      script: './mcp/custom-context7-server.js',
      env: {
        PORT: 3000,
        OLLAMA_URL: 'http://localhost:11434',
        OLLAMA_EMBED_MODEL: 'nomic-embed-text',
        DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'
      }
    },
    {
      name: 'autogen-service',
      script: 'python',
      args: ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000'],
      cwd: './python-autogen',
      interpreter: 'python'
    },
    {
      name: 'go-legal-service',
      script: './go-microservice/legal-ai-server.exe',
      env: {
        PORT: 8080,
        DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'
      }
    }
  ]
};
```

### PM2 Commands

```bash
# Install PM2 globally
npm install -g pm2

# Start all services
pm2 start ecosystem.config.js

# Monitor services
pm2 monit

# View logs
pm2 logs

# Restart services
pm2 restart all

# Stop services
pm2 stop all

# Delete all processes
pm2 delete all
```

## Batch Scripts for Automation

### start-all-services.bat

```batch
@echo off
echo 🚀 Starting Legal AI Native Windows Stack...

echo 1. Starting PostgreSQL...
net start postgresql-x64-17

echo 2. Starting Ollama...
start /B ollama serve

echo 3. Starting optional services...
if exist redis-windows\redis-server.exe (
  start /B redis-windows\redis-server.exe --port 6379
)
if exist qdrant-windows\qdrant.exe (
  start /B qdrant-windows\qdrant.exe
)

echo 4. Starting PM2 services...
pm2 start ecosystem.config.js

echo 5. Waiting for services to initialize...
timeout /t 10 /nobreak

echo 6. Opening application...
start http://localhost:5173

echo ✅ All services started successfully!
pause
```

### stop-all-services.bat

```batch
@echo off
echo 🛑 Stopping Legal AI Services...

echo 1. Stopping PM2 services...
pm2 delete all

echo 2. Stopping Ollama...
taskkill /f /im ollama.exe

echo 3. Stopping optional services...
taskkill /f /im redis-server.exe 2>nul
taskkill /f /im qdrant.exe 2>nul

echo 4. Stopping PostgreSQL (optional - comment out if needed)
REM net stop postgresql-x64-17

echo ✅ All services stopped!
pause
```

## WASM Integration for Rust Services

### Rust Service Setup

```rust
// rust-services/webasm-bridge/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WindowsServiceBridge {
    // Windows service integration
}

#[wasm_bindgen]
impl WindowsServiceBridge {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WindowsServiceBridge {
        WindowsServiceBridge {}
    }
    
    #[wasm_bindgen]
    pub fn get_system_info(&self) -> String {
        // Access Windows system information
        serde_json::to_string(&get_windows_info()).unwrap()
    }
    
    #[wasm_bindgen]
    pub fn access_filesystem(&self, path: &str) -> String {
        // Secure filesystem access for legal documents
        access_secure_path(path)
    }
}

// Compile to WASM
// wasm-pack build --target web --out-dir ../sveltekit-frontend/src/lib/wasm
```

### TypeScript Integration

```typescript
// sveltekit-frontend/src/lib/wasm/rust-bridge.ts
import init, { WindowsServiceBridge } from './pkg';

let bridge: WindowsServiceBridge | null = null;

export async function initRustBridge() {
  await init();
  bridge = new WindowsServiceBridge();
  return bridge;
}

export function getSystemInfo(): object {
  if (!bridge) throw new Error('Rust bridge not initialized');
  return JSON.parse(bridge.get_system_info());
}

export function accessFilesystem(path: string): string {
  if (!bridge) throw new Error('Rust bridge not initialized');
  return bridge.access_filesystem(path);
}
```

## Advanced Orchestration Patterns

### WebGPU Integration for Tensor Operations

```javascript
// Matrix operations for AI workloads
async function initWebGPUTensorOps() {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  
  // GPU-accelerated tensor operations for legal document analysis
  const computeShader = `
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      // Legal document similarity computation
    }
  `;
  
  return device;
}
```

### Message Queue Coordination (NATS)

```javascript
// NATS integration for service coordination
import { connect } from 'nats';

const nc = await connect({ servers: "nats://localhost:4222" });

// Publish legal analysis requests
nc.publish("legal.analysis.request", JSON.stringify({
  caseId: "CASE-001",
  documentPath: "/documents/contract.pdf",
  analysisType: "liability"
}));

// Subscribe to analysis results
const sub = nc.subscribe("legal.analysis.result");
for await (const m of sub) {
  const result = JSON.parse(m.data);
  console.log("Analysis complete:", result);
}
```

## Monitoring and Health Checks

### Health Check Script

```bash
# health-check.bat
@echo off
echo 🏥 Legal AI System Health Check

echo Checking PostgreSQL...
"C:\Program Files\PostgreSQL\17\bin\pg_isready.exe" -h localhost -p 5432

echo Checking Ollama...
curl -s http://localhost:11434/api/tags

echo Checking PM2 services...
pm2 status

echo Checking SvelteKit frontend...
curl -s http://localhost:5173/api/health

echo ✅ Health check complete!
```

### Performance Monitoring

```javascript
// Performance metrics collection
export class PerformanceMonitor {
  static async collectMetrics() {
    return {
      database: await this.checkDatabaseLatency(),
      ollama: await this.checkOllamaResponseTime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString()
    };
  }
  
  static async checkDatabaseLatency() {
    const start = performance.now();
    await db.select().from(cases).limit(1);
    return performance.now() - start;
  }
  
  static async checkOllamaResponseTime() {
    const start = performance.now();
    await fetch('http://localhost:11434/api/tags');
    return performance.now() - start;
  }
}
```

## Security Considerations

### 1. Database Security

- Use connection pooling with proper timeout settings
- Enable row-level security (RLS) for multi-tenant isolation
- Regular backups with encryption
- Audit logging for evidence tampering detection

### 2. API Security

- Rate limiting on all endpoints
- JWT token validation
- CORS configuration for frontend-only access
- Input sanitization and validation

### 3. File System Security

- Sandboxed document processing
- Virus scanning integration
- Access control lists (ACLs)
- Audit trails for document access

## Troubleshooting

### Common Issues

1. **Port Conflicts**: Use `netstat -an | findstr :5173` to check port usage
2. **Ollama Not Responding**: Restart with `taskkill /f /im ollama.exe && ollama serve`
3. **Database Connection**: Verify credentials and service status
4. **PM2 Process Crashes**: Check logs with `pm2 logs`

### Debug Mode

```bash
# Enable debug logging
set DEBUG=*
set NODE_ENV=development
set MCP_DEBUG=true

# Start with verbose logging
pm2 start ecosystem.config.js --log-type
```

## Development Workflow

1. **Start Development**: Run `start-all-services.bat`
2. **Code Changes**: Hot-reload enabled for SvelteKit
3. **Test Changes**: Use `npm run check` for TypeScript validation
4. **Monitor Services**: Use `pm2 monit` for real-time monitoring
5. **Stop Development**: Run `stop-all-services.bat`

## Production Deployment

### Windows Service Registration

```batch
# Register as Windows service using NSSM
nssm install LegalAIStack pm2
nssm set LegalAIStack Application pm2
nssm set LegalAIStack AppParameters start ecosystem.config.js
nssm set LegalAIStack AppDirectory C:\path\to\legal-ai
nssm start LegalAIStack
```

### Performance Optimization

- Enable Node.js clustering for CPU-bound tasks
- Use Redis for session and cache storage
- Configure PostgreSQL for high performance
- Implement CDN for static assets
- Enable gzip compression

## Support and Maintenance

### Log Locations

- PM2 logs: `%USERPROFILE%\.pm2\logs\`
- PostgreSQL logs: `C:\Program Files\PostgreSQL\17\data\log\`
- Application logs: `./logs/`

### Backup Procedures

```bash
# Database backup
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U legal_admin -d legal_ai_db > backup_$(date +%Y%m%d).sql

# Configuration backup
copy ecosystem.config.js backup\
copy .env backup\
```

This orchestration guide provides a comprehensive native Windows deployment without Docker dependencies, optimized for legal AI workloads with proper security, monitoring, and maintenance procedures.