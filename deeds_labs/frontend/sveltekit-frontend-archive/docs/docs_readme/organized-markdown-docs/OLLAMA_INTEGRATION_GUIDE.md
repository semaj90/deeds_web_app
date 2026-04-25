# 🤖 Ollama Integration Guide

## Overview

This guide explains how to integrate and use Ollama with your SvelteKit 2.0 + Svelte 5 legal AI application.

## 🚀 Quick Start

### Option 1: Full Development Environment

```bash
# Start everything (Ollama + SvelteKit)
npm start

# Or with GPU acceleration
npm run start:gpu
```

### Option 2: Quick Start (Services Already Running)

```bash
# Just start frontend (assumes Ollama is already running)
npm run start:quick
```

### Option 3: Manual Step-by-Step

```bash
# 1. Start Ollama service
npm run ollama:start

# 2. Setup legal AI models
npm run ollama:setup

# 3. Start SvelteKit development server
npm run dev

# 4. Test integration
npm run test:integration
```

## 🔧 Available Commands

### Ollama Management

```bash
npm run ollama:start        # Start Ollama service
npm run ollama:stop         # Stop Ollama service
npm run ollama:restart      # Restart Ollama service
npm run ollama:status       # Check Ollama status
npm run ollama:health       # Health check
npm run ollama:models       # List available models
npm run ollama:setup        # Setup legal AI models
npm run ollama:gpu          # Start with GPU acceleration
```

### Development Workflows

```bash
npm start                   # Full development environment
npm run start:quick         # Quick frontend-only start
npm run start:gpu           # GPU-accelerated development
npm run start:prod          # Production deployment

npm run dev:frontend        # SvelteKit development server only
npm run dev:full            # Full stack (Ollama + Frontend)
npm run dev:gpu             # GPU-accelerated full stack
npm run dev:quick           # Quick development (assumes services running)
```

### Testing & Validation

```bash
npm run test:integration    # Test Ollama + SvelteKit integration
npm run test:quick          # Quick integration test
npm run ai:test             # Comprehensive AI pipeline test
npm run health              # System health check
```

## 🏗️ Architecture

### SvelteKit 2.0 + Svelte 5 Frontend

- **Location**: `sveltekit-frontend/`
- **Framework**: SvelteKit 2.0 with Svelte 5 runes
- **UI**: bits-ui, Tailwind CSS, UnoCSS
- **State**: Enhanced stores with XState integration

### Ollama Service Integration

- **Service**: `src/lib/server/services/OllamaService.ts`
- **API Routes**: `src/routes/api/ai/`
- **Chat Interface**: `src/lib/components/OllamaChatInterface.svelte`
- **Models**: Legal-specialized models (gemma3-legal, etc.)

### API Endpoints

```typescript
// Health check
GET /api/ai/health

// Chat with AI
POST /api/ai/chat
{
  "message": "Legal question here",
  "model": "gemma3-legal",
  "useRAG": true,
  "temperature": 0.7
}

// Stream chat (TODO)
POST /api/ai/chat/stream
```

## 🔗 Integration Points

### 1. Backend Services

```typescript
// OllamaService.ts - Core service
import { ollamaService } from "$lib/server/services/OllamaService";

// Generate legal AI response
const response = await ollamaService.generate(
  "gemma3-legal",
  "What are the elements of prosecution?"
);

// Get embeddings for RAG
const embeddings = await ollamaService.embeddings(
  "nomic-embed-text",
  "Legal document text"
);
```

### 2. SvelteKit API Routes

```typescript
// +server.ts - API endpoint
import { json } from "@sveltejs/kit";
import { ollamaService } from "$lib/server/services/OllamaService";

export const POST: RequestHandler = async ({ request }) => {
  const { message, model } = await request.json();
  const response = await ollamaService.generate(model, message);
  return json({ response });
};
```

### 3. Svelte 5 Frontend Components

```svelte
<!-- OllamaChatInterface.svelte -->
<script lang="ts">
  // Svelte 5 reactive state
  let message = $state('');
  let response = $state('');
  let isLoading = $state(false);

  async function sendMessage() {
    isLoading = true;
    const result = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, model: 'gemma3-legal' })
    });
    response = await result.json();
    isLoading = false;
  }
</script>
```

### 4. Database Integration

```typescript
// RAG with PostgreSQL + pgvector
import { db } from "$lib/server/db";
import { documents } from "$lib/server/db/schema";
import { sql } from "drizzle-orm";

// Vector similarity search
const similarDocs = await db
  .select()
  .from(documents)
  .where(sql`embedding <-> ${embedding} < 0.7`)
  .orderBy(sql`embedding <-> ${embedding}`)
  .limit(5);
```

## 🎯 Demo Page

Visit the AI demo page to test the integration:

**URL**: `http://localhost:5173/ai-demo`

**Features**:

- System status monitoring
- Model selection
- Interactive chat interface
- Performance metrics
- Quick start guide

## 🐛 Troubleshooting

### Ollama Not Starting

```bash
# Check Docker status
ps

# Restart Ollama container
npm run ollama:restart

# Check logs
logs deeds-ollama-gpu
```

### Models Not Available

```bash
# List current models
npm run ollama:models

# Re-setup models
npm run ollama:setup

# Manually pull model
exec deeds-ollama-gpu ollama pull gemma3:7b
```

### Frontend Connection Issues

```bash
# Test API health
curl http://localhost:5173/api/ai/health

# Check SvelteKit logs
npm run dev

# Run integration test
npm run test:integration
```

### Performance Issues

```bash
# Use GPU acceleration
npm run start:gpu

# Check system resources
 stats

# Optimize memory
npm run deploy:optimized
```

## 📚 Additional Resources

- [SvelteKit 2.0 Documentation](https://kit.svelte.dev/)
- [Svelte 5 Documentation](https://svelte.dev/)
- [Ollama Documentation](https://ollama.ai/docs)
- [Legal AI Models Guide](./docs/legal-ai-models.md

## 🎉 Success Indicators

When everything is working correctly, you should see:

✅ **Health Check**: All services healthy
✅ **Models**: Legal AI models available
✅ **Frontend**: SvelteKit dev server running
✅ **Chat**: AI responses generating
✅ **Performance**: Reasonable response times

Access your application at: **http://localhost:5173**
