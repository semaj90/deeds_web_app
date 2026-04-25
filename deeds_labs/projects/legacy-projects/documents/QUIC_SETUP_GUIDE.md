# Enhanced QUIC Development Setup

## 🚀 **New npm scripts added to your package.json:**

```bash
npm run dev:quic          # Enhanced QUIC with Docker + zx (Cross-platform)
npm run dev:quic:win      # Enhanced QUIC with Docker + batch (Windows optimized)
npm run dev:quic:simple   # Simple QUIC without Docker (original behavior)
```

## ⚡ **What `npm run dev:quic` now does:**

1. **🐳 Docker Infrastructure Setup:**
   - Automatically starts PostgreSQL, Redis, MinIO in containers
   - Creates Docker network for service communication
   - Waits for services to be healthy before proceeding

2. **🔧 Environment Configuration:**
   - Sets RTX 3060 optimizations
   - Configures GPU acceleration
   - Sets memory optimization (3GB)
   - Enables QUIC/HTTP3 support

3. **📡 QUIC Frontend:**
   - Starts Vite on 127.0.0.1:5174 with strict port
   - Optimized for local QUIC connections
   - Full authentication system support

4. **⚙️ Enhanced Features:**
   - Dynamic port management
   - Service health checks
   - Auto-retry logic for service startup
   - Cross-platform compatibility (zx + batch)

## 🎯 **Usage Examples:**

### **Windows (Recommended):**
```bash
npm run dev:quic:win
```

### **Cross-platform (zx):**
```bash
npm run dev:quic
```

### **Simple QUIC (no Docker):**
```bash
npm run dev:quic:simple
```

## 🌐 **URLs after startup:**

- **Frontend**: http://127.0.0.1:5174
- **Protected Route**: http://127.0.0.1:5174/protected
- **Login**: http://127.0.0.1:5174/auth/login
- **Register**: http://127.0.0.1:5174/auth/register

## 🔧 **Environment Variables Set:**

```env
NODE_OPTIONS=--max-old-space-size=3072
ENABLE_GPU=true
RTX_3060_OPTIMIZATION=true
CONTEXT7_MULTICORE=true
OLLAMA_GPU_LAYERS=30
QUIC_ENABLED=true
DATABASE_URL=postgresql://legal_admin:123456@localhost:5433/legal_ai_db
REDIS_URL=redis://localhost:6379
```

## 📊 **Performance Benefits:**

- ✅ **QUIC Protocol**: Lower latency connections
- ✅ **GPU Optimization**: RTX 3060 acceleration
- ✅ **Memory Management**: 3GB heap size
- ✅ **Docker Infrastructure**: Clean isolated services
- ✅ **Authentication**: Full Lucia v3 support

## 🛠️ **Troubleshooting:**

If `npm run dev:quic` fails:
1. Ensure Docker Desktop is running
2. Check port 5174 is available
3. Try `npm run dev:quic:simple` for basic QUIC
4. Use `npm run dev:quic:win` on Windows for better compatibility

Your QUIC setup now has **Docker infrastructure + zx automation**! 🎉