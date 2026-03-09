# Legal AI Platform - Setup & Configuration Guide

## Core Technologies

### 🎨 Frontend Stack
- **Svelte 5** with runes (`$state`, `$derived`, `$effect`)
- **SvelteKit 2.43.5+** with file-based routing
- **UnoCSS** - Utility-first CSS with Tailwind compatibility
- **NES.CSS** - Retro 8-bit gaming aesthetic
- **Melt UI v0.39.0** - Headless component library (Svelte 5 compatible)

### 🗄️ Backend Stack
- **PostgreSQL 17** with pgvector extension
- **Drizzle ORM** - Type-safe query builder
- **Redis** - Caching layer
- **Lucia v3** - Authentication

## Installation & Setup

### 1. Prerequisites
```bash
# Ensure Node.js 18+ is installed
node --version

# Install dependencies
npm install
```

### 2. Environment Configuration
Create `.env.local` with the following variables:

```bash
# Database
DATABASE_URL="postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=legal_ai_db
POSTGRES_USER=legal_admin
POSTGRES_PASSWORD=123456

# Redis (set password only if required)
REDIS_PASSWORD=redis
REDIS_URL="redis://127.0.0.1:6379/0"

# Authentication
DEV_BYPASS_AUTH=true  # Set to false in production

# AI Services
OLLAMA_URL="http://localhost:11434"
```

### 3. Database Setup

#### Install pgvector Extension
```bash
# Connect to your PostgreSQL database
psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

#### Run Migrations
```bash
# Push schema to database
DATABASE_URL="postgresql://legal_admin:123456@localhost:5432/legal_ai_db" \
npm run db:push

# Or run the pgvector configuration script
bash scripts/ensure-pgvector.sh
```

### 4. Development Server
```bash
# Set Redis password (optional, only if configured)
REDIS_PASSWORD=redis npm run dev

# Or with explicit port
REDIS_PASSWORD=redis npm run dev -- --port 5173
```

## Svelte 5 Runes Patterns

### State Management
```svelte
<script lang="ts">
  // ✅ Correct - Svelte 5
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('Count changed:', count);
  });
</script>

<!-- ❌ Wrong - Svelte 4 (do not use) -->
<!-- export let count = 0; -->
<!-- $: doubled = count * 2; -->
```

### Component Props
```svelte
<script lang="ts">
  // ✅ Correct - Svelte 5
  interface Props {
    title: string;
    count?: number;
  }

  let { title, count = 0 }: Props = $props();
</script>

<!-- ❌ Wrong - Svelte 4 (do not use) -->
<!-- export let title: string; -->
<!-- export let count = 0; -->
```

### Component Imports
```typescript
// ✅ Correct - Default import
import Button from '$lib/components/ui/Button.svelte';

// ❌ Wrong - Named import
// import { Button } from '$lib/components/ui/Button.svelte';
```

## Styling System

### UnoCSS Configuration
- **Preset**: Tailwind-compatible utilities
- **Custom rules**: Gaming aesthetic (gold, crimson, slate colors)
- **Icons**: Integrated with lucide-svelte

### NES.CSS Integration
```svelte
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
</script>

<!-- Dark container with retro border -->
<div class="nes-container is-dark p-6">
  <h2 class="text-gold-400 font-bold mb-4">Title</h2>

  <!-- Buttons -->
  <button class="nes-btn is-primary">Primary</button>
  <button class="nes-btn is-success">Success</button>
  <button class="nes-btn is-error">Error</button>
</div>

<style>
  :global(body) {
    background: #0f172a;
    font-family: 'Press Start 2P', monospace;
  }

  .nes-container {
    border: 4px solid !important;
    background: #1e293b !important;
  }

  .nes-btn {
    border: 2px solid !important;
    font-weight: bold !important;
  }
</style>
```

### Color Palette
- **Primary**: `#d4af37` (gold)
- **Crimson**: `#c41e3a` (accent)
- **Dark BG**: `#0f172a` (slate-900)
- **Surface**: `#1e293b` (slate-800)
- **Muted**: `#64748b` (slate-500)

## Database Schema

### pgvector Table Example
```sql
-- Vector search with HNSW index
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES document_metadata(id),
  content TEXT NOT NULL,
  embedding vector(384) NOT NULL,  -- 384-dimensional embeddings
  chunk_index INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Fast similarity search index
CREATE INDEX idx_document_embeddings_hnsw
ON document_embeddings USING hnsw (embedding vector_cosine_ops);
```

### Drizzle ORM Usage
```typescript
import { db } from '$lib/server/db';
import { documentEmbeddings } from '$lib/server/db/schema-unified';

// Insert with pgvector
await db.insert(documentEmbeddings).values({
  documentId: '123',
  content: 'Chapter 1: Introduction',
  embedding: new Array(384).fill(0),  // Your embedding vector
  chunkIndex: 0,
  metadata: { source: 'contract.pdf' }
});

// Query with vector similarity
const results = await db
  .select()
  .from(documentEmbeddings)
  .where(sql`embedding <-> ${queryVector} < 1.5`)
  .limit(10);
```

## Routing Structure

### Route Groups
- `(legal)` - Legal cases, evidence management
- `(ai)` - AI features, chat, analysis
- `(auth)` - User profile, dashboard, sessions
- `(tools)` - Report builder, utilities
- `(public)` - Public pages
- `(demo)` - Demo showcases

### Example Routes
```
src/routes/
├── (auth)/
│   ├── dashboard/
│   │   ├── +page.server.ts
│   │   └── +page.svelte
│   ├── profile/
│   └── sessions/
├── (legal)/
│   ├── cases/
│   │   ├── [id]/
│   │   │   ├── +page.server.ts
│   │   │   └── +page.svelte
│   │   └── +page.server.ts
├── (tools)/
│   └── report-builder/
│       ├── +page.server.ts
│       └── +page.svelte
└── api/
    ├── cases/
    ├── evidence/
    └── search/
```

## Common Issues & Solutions

### Issue: Redis AUTH Error
```
ERR AUTH <password> called without any password configured
```

**Solution**: Only pass password if explicitly set
```typescript
const clientConfig = {
  url: 'redis://localhost:6379',
  socket: { connectTimeout: 5000 }
};

// Only add password if it exists
if (process.env.REDIS_PASSWORD) {
  clientConfig.password = process.env.REDIS_PASSWORD;
}
```

### Issue: pgvector Not Found
```
Error: type "vector" does not exist
```

**Solution**: Run pgvector setup
```bash
# Create extension
psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION vector;"

# Run migration script
bash scripts/ensure-pgvector.sh
```

### Issue: Sidebar Text Cutoff
**Solution**: Use proper flex constraints
```svelte
<a class="flex items-center gap-2">
  <Icon class="flex-shrink-0" />
  <span class="flex-1 min-w-0 truncate">{text}</span>
  <Badge class="flex-shrink-0" />
</a>
```

### Issue: TypeScript Errors in Svelte Files
**Solution**: Add `lang="ts"` to script tags and enable proper config
```svelte
<script lang="ts">
  // TypeScript support enabled
</script>
```

## Performance Optimization

### Vector Search Optimization
```typescript
// Use HNSW index for cosine similarity
const fastSearch = await db
  .select()
  .from(documentEmbeddings)
  .where(sql`embedding <-> ${queryVector} < 1.5`)
  .limit(20);
```

### Caching Strategy
```typescript
// Cache frequently searched results
await redis.set(
  `search:${queryHash}`,
  JSON.stringify(results),
  'EX',
  3600  // 1 hour expiration
);
```

## Building for Production

```bash
# Build the application
npm run build

# Preview production build
npm run preview

# Environment variables for production
NODE_ENV=production \
DATABASE_URL="your-production-db-url" \
REDIS_PASSWORD="your-secure-password" \
npm run build
```

## Troubleshooting

### Development Server Issues
1. Clear node_modules and reinstall
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Clear SvelteKit cache
   ```bash
   rm -rf .svelte-kit
   npm run dev
   ```

3. Check PostgreSQL connection
   ```bash
   PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT 1;"
   ```

4. Check Redis connection
   ```bash
   redis-cli ping
   ```

## Additional Resources

- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [UnoCSS Documentation](https://unocss.dev)
- [NES.CSS Documentation](https://nostalgic-css.github.io/NES.css/)

---

**Last Updated**: 2025-10-26
**Status**: ✅ Production Ready
