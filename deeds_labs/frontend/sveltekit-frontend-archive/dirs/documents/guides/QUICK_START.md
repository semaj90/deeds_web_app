# 🚀 Quick Start Guide - Legal AI Platform

**Production-Ready SvelteKit 2 + Svelte 5 Full-Stack Application**

---

## ⚡ 5-Minute Quick Start

### Prerequisites
- Node.js 18+ installed
- Docker Desktop installed (optional for local development)
- 8GB+ RAM recommended

### Steps

```bash
# 1. Install dependencies (✅ DONE)
npm install

# 2. Setup environment variables (✅ DONE)
# .env file created with all required variables

# 3. Start Docker services (optional - for full features)
docker-compose up -d postgres redis rabbitmq qdrant

# 4. Pull AI models (if using Ollama)
docker exec ollama ollama pull gemma3-legal:latest
docker exec ollama ollama pull embeddinggemma:latest

# 5. Run database migrations
npm run db:migrate

# 6. Start development server
npm run dev

# 7. Open browser
# Navigate to: http://localhost:5173
```

---

## 🎯 What's Included

### ✅ Already Configured
- **Svelte 5** with runes and event attributes
- **SvelteKit 2** with SSR and API routes
- **TypeScript** strict mode
- **Drizzle ORM** for PostgreSQL + pgvector
- **XState v5** state machines
- **UnoCSS** atomic CSS
- **Bits-UI** headless components
- **Redis** caching layer
- **RabbitMQ** message queues (replaces BullMQ)

### 🔌 API Endpoints Ready
- `/api/contextual/state` - Context management
- `/api/contextual/predictions` - Predictive text
- `/api/contextual/chat` - AI chat (Ollama)
- `/api/vector-search` - Semantic search
- `/api/health` - Service health checks

---

## 🐳 Docker Services (Optional)

If you want full AI/ML features, start these services:

```bash
# Start all services
docker-compose up -d

# Or start individually
docker-compose up -d postgres    # Database with pgvector
docker-compose up -d redis       # Cache & sessions
docker-compose up -d rabbitmq    # Message queue
docker-compose up -d qdrant      # Vector database
docker-compose up -d ollama      # Local AI models (requires GPU)
```

### Service URLs
- **PostgreSQL:** localhost:5432
- **Redis:** localhost:6379
- **RabbitMQ:** localhost:5672 (Management: http://localhost:15672)
- **Qdrant:** http://localhost:6333
- **Ollama:** http://localhost:11434

---

## 🏃 Development Workflow

### Standard Development
```bash
# Start dev server (hot reload)
npm run dev

# Type checking
npm run check

# Build for production
npm run build

# Preview production build
npm run preview
```

### With GPU Acceleration
```bash
# Start with GPU detection
npm run dev:gpu

# Build WASM modules
npm run build:wasm
```

---

## 📁 Key Files & Directories

```
sveltekit-frontend/
├── src/
│   ├── routes/              # SvelteKit pages & API routes
│   │   ├── api/             # Backend API endpoints
│   │   │   ├── contextual/  # ✅ Contextual chat ready
│   │   │   ├── health/      # ✅ Health checks
│   │   │   └── vector-search/ # ✅ Vector search
│   │   ├── (app)/           # Protected app routes
│   │   └── +layout.svelte   # Root layout (UnoCSS, NES.css)
│   ├── lib/
│   │   ├── server/          # Server-only code
│   │   │   ├── db/          # ✅ Drizzle ORM client
│   │   │   ├── ai/          # ✅ Ollama integration
│   │   │   ├── cache/       # ✅ Redis client
│   │   │   └── queue/       # ✅ RabbitMQ client
│   │   ├── state/           # ✅ XState v5 machines
│   │   ├── components/ui/   # UI components
│   │   └── utils/           # Utilities
│   └── hooks.server.ts      # SvelteKit hooks
├── .env                     # ✅ Environment variables configured
├── package.json             # ✅ Dependencies installed
├── svelte.config.js         # ✅ SvelteKit config
├── uno.config.ts            # ✅ UnoCSS config
└── drizzle.config.ts        # ✅ Database config
```

---

## 🔧 Configuration

### Environment Variables (✅ Configured in .env)
All required variables are set. Key ones:

```bash
# Database
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db

# Redis
REDIS_URL=redis://:redis@localhost:6379/0

# RabbitMQ
RABBITMQ_URL=amqp://legal_admin:123456@localhost:5672

# Ollama AI
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3-legal:latest

# Qdrant
QDRANT_URL=http://localhost:6333

# Public URLs
PUBLIC_API_URL=http://localhost:5173/api
```

---

## 🎨 Svelte 5 Quick Reference

### Event Handlers
```svelte
<!-- ✅ Svelte 5 -->
<button onclick={() => handleClick()}>Click</button>

<!-- ❌ Old (deprecated) -->
<button on:click={() => handleClick()}>Click</button>
```

### Reactive State
```svelte
<script lang="ts">
  // ✅ Svelte 5
  let count = $state(0);
  let doubled = $derived(count * 2);

  // ❌ Old
  let count = 0;
  $: doubled = count * 2;
</script>
```

### Props
```svelte
<script lang="ts">
  // ✅ Svelte 5
  let { title, count = 0 } = $props();

  // ❌ Old
  export let title: string;
  export let count = 0;
</script>
```

---

## 🚀 Production Build

```bash
# 1. Ensure all services are running
docker-compose up -d

# 2. Pull AI models (if using Ollama)
docker exec ollama ollama pull gemma3-legal:latest

# 3. Run migrations
npm run db:migrate

# 4. Build WASM modules
npm run build:wasm

# 5. Build production
npm run build

# 6. Start production server
npm run preview

# 7. Navigate to http://localhost:4173
```

---

## 🔍 Troubleshooting

### Docker services not starting?
```bash
# Start Docker Desktop first
# Then run:
docker-compose up -d

# Check logs
docker-compose logs -f postgres
```

### Build errors?
```bash
# Clear cache and rebuild
npm run clean
npm install --force
npm run build
```

### Type errors?
```bash
# Run type checking
npm run check

# Fix Svelte 5 patterns
# See SVELTE-COMPLETE.md for migration guide
```

### Port already in use?
```bash
# Change port in .env
PORT=5174  # or any other port

# Restart dev server
npm run dev
```

---

## 📚 Documentation

- **SVELTE-COMPLETE.md** - Full production setup guide (18.3 KB)
- **PHASE34-40-ANALYSIS.md** - Technical analysis
- **PHASE40-ACTION-PLAN.md** - Execution roadmap
- **GIT-RESET-SAFE-CHECK.md** - Production status

---

## ✅ Health Checks

### Check Service Health
```bash
# Test API endpoint
curl http://localhost:5173/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-11-03T18:45:00Z",
  "services": {
    "database": true,
    "redis": true,
    "ollama": true
  }
}
```

### Validate Production Readiness
```bash
# Run automated validation
.\validate-production-ready.ps1

# Should show:
# ✅ Passed: 15+
# ❌ Failed: 0
# ⚠️  Warnings: 0-5 (non-blocking)
```

---

## 🎯 Next Steps

1. ✅ **Dependencies installed** - npm install complete
2. ✅ **Environment configured** - .env file ready
3. ⚠️  **Start Docker** - Run `docker-compose up -d`
4. ⚠️  **Pull AI models** - If using Ollama
5. ⚠️  **Run migrations** - `npm run db:migrate`
6. ⚠️  **Start dev server** - `npm run dev`

---

## 💡 Tips

- Use `npm run dev:gpu` for GPU-accelerated development
- Check `http://localhost:15672` for RabbitMQ management UI
- Use `http://localhost:8001` for Redis Insight
- Monitor Qdrant at `http://localhost:6333/dashboard`
- Ollama models at `http://localhost:11434/api/tags`

---

**Status:** ✅ **READY TO START**

Run `npm run dev` to begin development!

**Generated:** November 3, 2025
