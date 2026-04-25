# Complete SvelteKit + Ollama + pgvector Integration Guide

This guide covers the complete setup of a legal AI application using SvelteKit, Ollama with GPU acceleration, PostgreSQL with pgvector, and LangChain.

## 🏗️ Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   SvelteKit     │────▶│  Ollama Service  │────▶│  GGUF Models    │
│   Frontend      │     │  (GPU Accel.)    │     │  (Local LLM)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│   API Routes    │────▶│   LangChain      │
│   (+server.ts)  │     │   (RAG System)   │
└─────────────────┘     └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  PostgreSQL +   │◀────│  Vector Store    │
│   pgvector      │     │  (Embeddings)    │
└─────────────────┘     └──────────────────┘
```

## 📋 Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL 15+ with pgvector extension
- NVIDIA GPU with CUDA support
- Ollama installed and running
- GGUF model files from Unsloth

## 🚀 Installation Steps

### 1. Install Dependencies

```bash
# Navigate to your project
cd C:\Users\james\Desktop\deeds-web\deeds-web-app

# Install core dependencies
pnpm add @sveltejs/kit@latest svelte@latest vite@latest

# Install AI/ML dependencies
pnpm add langchain @langchain/community @langchain/core
pnpm add pg @types/pg
pnpm add pdf-parse mammoth

# Install UI dependencies
pnpm add bits-ui @unoCSS/svelte unocss

# Dev dependencies
pnpm add -D @sveltejs/adapter-node typescript
```

### 2. Configure UnoCSS

Create `uno.config.ts`:

```typescript
import { defineConfig, presetUno, presetIcons, presetWebFonts } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetWebFonts({
      fonts: {
        sans: 'Inter:400,500,600,700',
        mono: 'Fira Code:400,500',
      },
    }),
  ],
  theme: {
    colors: {
      // Custom theme colors
    }
  }
})
```

### 3. Configure Vite

Update `vite.config.ts`:

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import UnoCSS from 'unocss/vite';

export default defineConfig({
  plugins: [
    UnoCSS(),
    sveltekit()
  ],
  server: {
    fs: {
      allow: ['..']
    }
  }
});
```

### 4. Setup PostgreSQL with pgvector

```sql
-- Create database
CREATE DATABASE legal_ai;

-- Connect to database
\c legal_ai;

-- Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Run the initialization from vector-db.ts
-- The tables will be created automatically when the app starts
```

### 5. Environment Variables

Create `.env`:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/legal_ai

# Ollama
OLLAMA_BASE_URL=http://localhost:11434

# Application
PUBLIC_APP_NAME="Legal AI Assistant"
NODE_ENV=development
```

### 6. App Configuration

Update `app.html`:

```html
<!DOCTYPE html>
<html lang="en" class="%sveltekit.theme%">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover" class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

### 7. Create Layout

Create `src/routes/+layout.svelte`:

```svelte
<script>
  import 'uno.css'
  import '@unocss/reset/tailwind.css'
</script>

<slot />
```

## 🎮 Start the Application

### 1. Start Ollama with GPU

```bash
# In local-models directory
cd C:\Users\james\Desktop\deeds-web\deeds-web-app\local-models

# Run the GPU setup
.\RUN-GPU-SETUP.bat
```

### 2. Initialize Database

```bash
# Run database migrations
pnpm run db:init
```

### 3. Start Development Server

```bash
# Start SvelteKit
pnpm dev

# Your app will be available at http://localhost:5173
```

## 📁 File Structure

```
src/
├── lib/
│   ├── ai/
│   │   ├── ollama.ts         # Ollama service
│   │   ├── vector-db.ts      # pgvector integration
│   │   ├── langchain.ts      # LangChain RAG
│   │   └── types.ts          # TypeScript types
│   └── components/
│       ├── LegalChat.svelte  # Chat interface
│       └── DocumentAnalysis.svelte
├── routes/
│   ├── api/
│   │   ├── chat/+server.ts   # Chat API
│   │   └── extract-text/+server.ts
│   └── +page.svelte          # Main page
└── app.html

local-models/
├── Modelfile.gemma3-legal    # Legal model config
├── Modelfile.gemma3-quick    # Quick model config
├── *.gguf                    # Model files
└── setup scripts...
```

## 🧪 Usage Examples

### Basic Chat

```typescript
import { ollama } from '$lib/ai/ollama';

const response = await ollama.generate(
  'gemma3-legal',
  'What are the elements of a valid contract?'
);
```

### Document Analysis with RAG

```typescript
import { langchain } from '$lib/ai/langchain';

// Ingest document
const chunks = await langchain.ingestDocument(documentText, {
  title: 'Employment Contract',
  type: 'contract'
});

// Query with RAG
const qaChain = langchain.createQAChain();
const answer = await qaChain.call({
  query: 'What are the termination clauses?'
});
```

### Vector Search

```typescript
import { vectorDB } from '$lib/ai/vector-db';

// Search similar documents
const results = await vectorDB.hybridSearch(
  queryEmbedding,
  'non-compete clause',
  { limit: 5 }
);
```

## 🔧 Troubleshooting

### GPU Not Working
- Check `nvidia-smi` during inference
- Ensure `PARAMETER num_gpu -1` in Modelfile
- Restart Ollama service

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure pgvector extension is installed

### Slow Performance
- Use GPU-optimized quantization (q5_K_M)
- Increase `num_gpu` layers
- Check available VRAM

## 🚀 Production Deployment

### Build for Production

```bash
# Build the app
pnpm build

# Preview production build
pnpm preview
```

### Deploy with PM2

```bash
# Install PM2
npm install -g pm2

# Start the app
pm2 start build/index.js --name legal-ai

# Save PM2 config
pm2 save
pm2 startup
```

## 📚 Additional Resources

- [SvelteKit Documentation](https://kit.svelte.dev)
- [Ollama Documentation](https://ollama.ai)
- [LangChain Documentation](https://langchain.com)
- [pgvector Documentation](https://github.com/pgvector/pgvector)

---

**Remember**: Always ensure your GGUF model files are in the `local-models` directory and properly referenced in the Modelfiles!
