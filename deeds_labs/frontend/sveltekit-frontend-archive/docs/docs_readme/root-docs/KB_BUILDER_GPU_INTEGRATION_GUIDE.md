# 🚀 Knowledge Base Builder - GPU Integration Guide

**Date**: 2025-10-16
**Status**: Phase 1 Complete, Phase 2 In Progress

---

## 📊 System Architecture Overview

The Knowledge Base (KB) Builder integrates three critical components:

```
┌─────────────────────────────────────────────────────────────┐
│                   KB BUILDER PIPELINE                        │
│  (scripts/agentic-kb-builder.mjs + knowledge-base-builder)  │
└────────────┬────────────────────────────────────────────────┘
             │
             ├──── 1. Document Processing (AST Parsing)
             │     └─> Extract: functions, classes, types, props
             │
             ├──── 2. Embedding Generation (embeddinggemma:latest)
             │     └─> Via Ollama GPU or WebGPU-CUDA Bridge
             │
             ├──── 3. Storage Layer
             │     ├─> PostgreSQL (pgvector) - Persistent
             │     └─> Redis Cache - Fast retrieval
             │
             └──── 4. GPU Acceleration
                   ├─> Ollama (RTX 3060 Ti CUDA)
                   └─> WebGPU Fallback
```

---

## 🎯 Component Integration Map

### 1. Ollama GPU Server (`start-ollama-gpu.bat`)

**Purpose**: Primary embedding and inference engine with CUDA optimization

**Configuration**:
```batch
# GPU Settings
CUDA_VISIBLE_DEVICES=0              # Use first GPU (RTX 3060 Ti)
CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0

# Ollama Optimization
OLLAMA_GPU_LAYERS=30                # Offload 30 layers to GPU
OLLAMA_FLASH_ATTENTION=true         # Enable Flash Attention 2
OLLAMA_NUM_GPU=1                    # Single GPU mode
OLLAMA_GPU_OVERHEAD=0               # Minimize overhead

# Performance
OLLAMA_NUM_PARALLEL=4               # 4 concurrent requests
OLLAMA_MAX_QUEUE=512                # Queue up to 512 requests
OLLAMA_CONTEXT_LENGTH=4096          # 4K context window
```

**Models Used by KB Builder**:
- `embeddinggemma:latest` - 384-dimensional embeddings
- `gemma3:legal-latest` - Function calling for metadata extraction
- `nomic-embed-text` - Fallback embedding model

**API Endpoints**:
```typescript
// Embedding generation
POST http://localhost:11434/api/embeddings
{
  "model": "embeddinggemma:latest",
  "prompt": "Legal contract text...",
  "options": {}
}

// Inference (metadata extraction)
POST http://localhost:11434/api/generate
{
  "model": "gemma3:legal-latest",
  "prompt": "Extract entities from: ...",
  "stream": false
}
```

---

### 2. WebGPU-CUDA Bridge (`webgpu-cuda-bridge.ts`)

**Purpose**: Multi-tier GPU acceleration with intelligent fallback

**Processing Hierarchy**:
```
1. WebGPU (Browser GPU)         ← Fastest, browser-based
   ↓ (if fails)
2. Ollama (CUDA Server)         ← Primary backend
   ↓ (if fails)
3. Go CUDA Microservice         ← Ultimate fallback
   (http://localhost:8085)
```

**Task Types Supported**:
```typescript
type TaskType =
  | 'inference'          // LLM generation
  | 'embedding'          // Vector embeddings
  | 'tensor-ops'         // Matrix operations
  | 'image-processing';  // OCR, image analysis

// Priority Queue System
type Priority = 'low' | 'medium' | 'high' | 'critical';
```

**WebGPU Compute Shader** (lines 166-189):
```wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let index = global_id.x;
  if (index >= arrayLength(&inputData)) { return; }

  // Neural network layer computation
  let input_val = inputData[index];
  let weight = config[0];
  let bias = config[1];
  var result = input_val * weight + bias;

  // ReLU activation
  if (result < activation_threshold) {
    result = 0.0;
  }

  outputData[index] = result;
}
```

**Integration with KB Builder**:
```typescript
// KB Builder uses WebGPU bridge for:
// 1. Batch embedding generation (100+ documents)
// 2. Parallel processing (16 workers via MCP)
// 3. Fallback when Ollama is unavailable

const bridge = new WebGPUCudaBridge();

// Add embedding task
await bridge.addTask({
  id: 'embed-doc-123',
  type: 'embedding',
  data: documentChunks,
  config: {
    model: 'embeddinggemma:latest',
    text: 'Legal document content...'
  },
  priority: 'high'
});
```

---

### 3. KB Builder AST Parsing (Action Plan Tasks)

**Current Status**: ⚠️ **IN PROGRESS**

From `ACTION_PLAN_KB_GPU_FIXES.md` (lines 246-252):

```markdown
### KB Builder Completion
- [ ] All 6 helper methods implemented with AST parsing
- [ ] 100+ documents processed successfully
- [ ] Embeddings stored in PostgreSQL
- [ ] Redis cache populated
- [ ] Performance: <2ms per document chunking
```

**Required Implementation**:

#### Step 1: Install Dependencies
```bash
cd sveltekit-frontend
npm install @babel/parser @babel/traverse
```

#### Step 2: Implement AST Helper Methods

**File**: `scripts/knowledge-base-builder.mjs` or `scripts/agentic-kb-builder.mjs`

```javascript
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

class KnowledgeBaseBuilder {
  constructor() {
    this.embeddingModel = 'embeddinggemma:latest';
    this.ollamaEndpoint = 'http://localhost:11434';
    this.webgpuBridge = null; // Initialize in constructor
  }

  // ✅ Method 1: Extract Functions (AST-based)
  extractFunctions(code, filePath) {
    const functions = [];

    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });

      traverse(ast, {
        FunctionDeclaration(path) {
          functions.push({
            name: path.node.id?.name || 'anonymous',
            type: 'function',
            params: path.node.params.map(p => p.name || 'unknown'),
            lineStart: path.node.loc?.start.line,
            lineEnd: path.node.loc?.end.line,
            file: filePath,
            async: path.node.async,
            generator: path.node.generator
          });
        },
        ArrowFunctionExpression(path) {
          const parent = path.parent;
          const name = parent.type === 'VariableDeclarator'
            ? parent.id.name
            : 'anonymous';

          functions.push({
            name,
            type: 'arrow',
            params: path.node.params.map(p => p.name || 'unknown'),
            lineStart: path.node.loc?.start.line,
            lineEnd: path.node.loc?.end.line,
            file: filePath,
            async: path.node.async
          });
        }
      });
    } catch (error) {
      console.warn(`⚠️ AST parsing failed for ${filePath}:`, error.message);
      // Fallback to regex-based extraction
      return this.extractFunctionsRegex(code, filePath);
    }

    return functions;
  }

  // ✅ Method 2: Extract Classes (AST-based)
  extractClasses(code, filePath) {
    const classes = [];

    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy']
      });

      traverse(ast, {
        ClassDeclaration(path) {
          const methods = [];
          const properties = [];

          path.traverse({
            ClassMethod(methodPath) {
              methods.push({
                name: methodPath.node.key.name || 'unknown',
                kind: methodPath.node.kind, // 'constructor' | 'method' | 'get' | 'set'
                static: methodPath.node.static,
                async: methodPath.node.async,
                params: methodPath.node.params.map(p => p.name || 'unknown')
              });
            },
            ClassProperty(propPath) {
              properties.push({
                name: propPath.node.key.name || 'unknown',
                static: propPath.node.static,
                readonly: propPath.node.readonly
              });
            }
          });

          classes.push({
            name: path.node.id?.name || 'anonymous',
            methods,
            properties,
            extends: path.node.superClass?.name || null,
            lineStart: path.node.loc?.start.line,
            lineEnd: path.node.loc?.end.line,
            file: filePath
          });
        }
      });
    } catch (error) {
      console.warn(`⚠️ Class extraction failed for ${filePath}:`, error.message);
      return this.extractClassesRegex(code, filePath);
    }

    return classes;
  }

  // ✅ Method 3: Extract TypeScript Types
  extractTypes(code, filePath) {
    const types = [];

    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['typescript']
      });

      traverse(ast, {
        TSTypeAliasDeclaration(path) {
          types.push({
            name: path.node.id.name,
            kind: 'type',
            typeAnnotation: path.node.typeAnnotation.type,
            lineStart: path.node.loc?.start.line,
            file: filePath
          });
        },
        TSInterfaceDeclaration(path) {
          const properties = path.node.body.body.map(prop => ({
            name: prop.key?.name || 'unknown',
            type: prop.typeAnnotation?.typeAnnotation?.type || 'unknown',
            optional: prop.optional || false
          }));

          types.push({
            name: path.node.id.name,
            kind: 'interface',
            properties,
            extends: path.node.extends?.map(e => e.expression.name) || [],
            lineStart: path.node.loc?.start.line,
            file: filePath
          });
        },
        TSEnumDeclaration(path) {
          types.push({
            name: path.node.id.name,
            kind: 'enum',
            members: path.node.members.map(m => m.id.name),
            lineStart: path.node.loc?.start.line,
            file: filePath
          });
        }
      });
    } catch (error) {
      console.warn(`⚠️ Type extraction failed for ${filePath}:`, error.message);
    }

    return types;
  }

  // ✅ Method 4: Extract Svelte Component Exports
  extractExports(content, filePath) {
    const exports = [];
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);

    if (!scriptMatch) return exports;

    const scriptContent = scriptMatch[1];

    try {
      const ast = parse(scriptContent, {
        sourceType: 'module',
        plugins: ['typescript']
      });

      traverse(ast, {
        ExportNamedDeclaration(path) {
          if (path.node.declaration) {
            if (path.node.declaration.type === 'VariableDeclaration') {
              path.node.declaration.declarations.forEach(decl => {
                exports.push({
                  name: decl.id.name,
                  type: 'named',
                  kind: path.node.declaration.kind, // 'const' | 'let' | 'var'
                  file: filePath
                });
              });
            } else if (path.node.declaration.type === 'FunctionDeclaration') {
              exports.push({
                name: path.node.declaration.id.name,
                type: 'function',
                file: filePath
              });
            }
          }
        },
        ExportDefaultDeclaration(path) {
          exports.push({
            name: 'default',
            type: 'default',
            file: filePath
          });
        }
      });
    } catch (error) {
      console.warn(`⚠️ Export extraction failed for ${filePath}:`, error.message);
    }

    return exports;
  }

  // ✅ Method 5: Extract Svelte Props (Svelte 5 Runes)
  extractProps(script, filePath) {
    const props = [];

    // Svelte 5: let prop = $state()
    const stateRegex = /let\s+(\w+)\s*=\s*\$state\((.*?)\)/g;
    let match;

    while ((match = stateRegex.exec(script)) !== null) {
      props.push({
        name: match[1],
        defaultValue: match[2].trim() || 'undefined',
        type: 'state',
        reactive: true,
        file: filePath
      });
    }

    // Svelte 5: let derived = $derived()
    const derivedRegex = /let\s+(\w+)\s*=\s*\$derived\((.*?)\)/g;
    while ((match = derivedRegex.exec(script)) !== null) {
      props.push({
        name: match[1],
        expression: match[2].trim(),
        type: 'derived',
        reactive: true,
        file: filePath
      });
    }

    // Svelte 5: $props() destructuring
    const propsRegex = /let\s*\{([^}]+)\}\s*=\s*\$props\(\)/g;
    while ((match = propsRegex.exec(script)) !== null) {
      const propsList = match[1].split(',').map(p => p.trim());
      propsList.forEach(prop => {
        const [name, defaultValue] = prop.split('=').map(s => s.trim());
        props.push({
          name,
          defaultValue: defaultValue || 'undefined',
          type: 'props',
          reactive: true,
          file: filePath
        });
      });
    }

    return props;
  }

  // ✅ Method 6: Extract Svelte Events
  extractEvents(template, filePath) {
    const events = [];

    // Svelte 5: onclick={handler}
    const eventRegex = /(on\w+)=\{([^}]+)\}/g;
    let match;

    while ((match = eventRegex.exec(template)) !== null) {
      events.push({
        event: match[1],         // 'onclick', 'onchange', etc.
        handler: match[2].trim(), // 'handleClick', 'doSomething', etc.
        file: filePath
      });
    }

    // Also capture inline arrow functions
    const inlineEventRegex = /(on\w+)=\{(\([^)]*\)\s*=>\s*[^}]+)\}/g;
    while ((match = inlineEventRegex.exec(template)) !== null) {
      events.push({
        event: match[1],
        handler: 'inline',
        code: match[2].trim(),
        file: filePath
      });
    }

    return events;
  }

  // Regex fallbacks (when AST parsing fails)
  extractFunctionsRegex(code, filePath) {
    const functions = [];
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        functions.push({
          name: match[1],
          type: 'function',
          file: filePath,
          method: 'regex-fallback'
        });
      }
    });

    return functions;
  }

  extractClassesRegex(code, filePath) {
    const classes = [];
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
    let match;

    while ((match = classRegex.exec(code)) !== null) {
      classes.push({
        name: match[1],
        extends: match[2] || null,
        file: filePath,
        method: 'regex-fallback'
      });
    }

    return classes;
  }

  // GPU-accelerated embedding generation
  async generateEmbeddings(documents) {
    console.log(`🧮 Generating embeddings for ${documents.length} documents...`);

    const embeddings = [];
    const batchSize = 10; // Process 10 at a time

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      // Try WebGPU bridge first (parallel processing)
      if (this.webgpuBridge?.isInitialized) {
        const tasks = batch.map(doc => this.webgpuBridge.addTask({
          type: 'embedding',
          data: doc.content,
          config: {
            model: this.embeddingModel,
            text: doc.content
          },
          priority: 'high'
        }));

        const results = await Promise.all(tasks);
        embeddings.push(...results);
      } else {
        // Fallback to Ollama direct
        for (const doc of batch) {
          const response = await fetch(`${this.ollamaEndpoint}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: this.embeddingModel,
              prompt: doc.content
            })
          });

          const result = await response.json();
          embeddings.push({
            docId: doc.id,
            embedding: result.embedding,
            dimensions: 384
          });
        }
      }

      console.log(`   Progress: ${Math.min(i + batchSize, documents.length)}/${documents.length}`);
    }

    return embeddings;
  }

  // Store in PostgreSQL with pgvector
  async storeEmbeddings(embeddings) {
    console.log(`💾 Storing ${embeddings.length} embeddings in PostgreSQL...`);

    // Implementation would use Drizzle ORM or direct pg connection
    // See: src/lib/server/db/schema.ts for schema definition

    const { db } = await import('../src/lib/server/db/index.js');
    const { knowledgeBaseAgentic } = await import('../src/lib/server/db/schema.js');

    for (const emb of embeddings) {
      await db.insert(knowledgeBaseAgentic).values({
        chunkId: emb.docId,
        content: emb.content,
        embedding: emb.embedding, // pgvector handles vector type
        summary: emb.summary,
        keywords: emb.keywords,
        entities: emb.entities,
        chunkType: emb.type,
        sourceFile: emb.file,
        ocrProcessed: false,
        agentProcessed: true,
        relevanceScore: emb.score || 0.0
      });
    }

    console.log(`✅ Stored ${embeddings.length} embeddings successfully`);
  }

  // Cache in Redis for fast retrieval
  async cacheEmbeddings(embeddings) {
    console.log(`⚡ Caching ${embeddings.length} embeddings in Redis...`);

    const redis = await import('../src/lib/server/redis.js').then(m => m.default);

    for (const emb of embeddings) {
      await redis.set(
        `kb:embed:${emb.docId}`,
        JSON.stringify(emb),
        'EX',
        86400 // 24 hour TTL
      );
    }

    console.log(`✅ Cached ${embeddings.length} embeddings successfully`);
  }
}

export default KnowledgeBaseBuilder;
```

---

## 🔄 Complete KB Builder Workflow

### Phase 1: Document Indexing

```javascript
const builder = new KnowledgeBaseBuilder();

// 1. Index source code
const sourceFiles = await glob('src/**/*.{ts,js,svelte}');
const documents = [];

for (const file of sourceFiles) {
  const content = await fs.readFile(file, 'utf-8');

  // Extract using AST methods
  const functions = builder.extractFunctions(content, file);
  const classes = builder.extractClasses(content, file);
  const types = builder.extractTypes(content, file);

  // Create chunks
  documents.push({
    id: `${file}:functions`,
    content: JSON.stringify(functions),
    metadata: { type: 'functions', file },
    file
  });

  documents.push({
    id: `${file}:classes`,
    content: JSON.stringify(classes),
    metadata: { type: 'classes', file },
    file
  });
}

console.log(`📊 Extracted ${documents.length} code chunks`);
```

### Phase 2: Embedding Generation (GPU-Accelerated)

```javascript
// Start Ollama GPU server first
// > start-ollama-gpu.bat

// Generate embeddings using GPU
const embeddings = await builder.generateEmbeddings(documents);

console.log(`✅ Generated ${embeddings.length} embeddings`);
// Expected: 384-dimensional vectors from embeddinggemma:latest
```

### Phase 3: Storage

```javascript
// Store in PostgreSQL (persistent)
await builder.storeEmbeddings(embeddings);

// Cache in Redis (fast access)
await builder.cacheEmbeddings(embeddings);
```

### Phase 4: Verification

```sql
-- Check PostgreSQL storage
SELECT
  chunk_type,
  COUNT(*) as count,
  AVG(relevance_score) as avg_score
FROM knowledge_base_agentic
GROUP BY chunk_type;

-- Expected output:
-- chunk_type | count | avg_score
-- functions  | 1234  | 0.85
-- classes    | 567   | 0.82
-- types      | 890   | 0.78
```

---

## 📈 Performance Targets

From ACTION_PLAN_KB_GPU_FIXES.md:

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| AST Methods Implemented | 6/6 | 0/6 | ⚠️ **TODO** |
| Documents Processed | 100+ | 0 | ⚠️ **TODO** |
| Embeddings in PostgreSQL | 100+ | 0 | ⚠️ **TODO** |
| Redis Cache Populated | Yes | No | ⚠️ **TODO** |
| Document Chunking Speed | <2ms | N/A | ⚠️ **TODO** |

---

## 🚀 Quick Start Commands

### 1. Install Dependencies
```bash
cd sveltekit-frontend
npm install @babel/parser @babel/traverse
```

### 2. Start GPU Services
```bash
# Terminal 1: Start Ollama GPU server
start-ollama-gpu.bat

# Terminal 2: Start PostgreSQL + Redis
docker-compose up -d redis legal-db

# Terminal 3: Start dev server
REDIS_PASSWORD="redis" npm run dev
```

### 3. Run KB Builder
```bash
# Build knowledge base
node scripts/agentic-kb-builder.mjs

# OR with custom config
node scripts/knowledge-base-builder.mjs --model embeddinggemma:latest --batch-size 10
```

### 4. Verify Results
```bash
# Check MCP server health
curl http://localhost:3002/mcp/health

# Check Ollama models
curl http://localhost:11434/api/tags

# Check Redis cache
redis-cli
> KEYS kb:embed:*
> GET kb:embed:src/lib/services/agentic-rag-orchestrator.ts:functions
```

---

## 🔧 Troubleshooting

### Issue: WebGPU Not Available
**Solution**: System will automatically fall back to Ollama → CUDA microservice

### Issue: Ollama Connection Refused
**Solution**:
```bash
# Check if Ollama is running
tasklist | findstr ollama

# If not, start it
start-ollama-gpu.bat
```

### Issue: AST Parsing Fails
**Solution**: System automatically falls back to regex-based extraction (see `extractFunctionsRegex`)

### Issue: Slow Embedding Generation
**Optimization**:
```javascript
// Increase batch size
const batchSize = 20; // Default: 10

// Enable parallel processing
OLLAMA_NUM_PARALLEL=8 // Default: 4
```

---

## 📚 Next Steps

1. **Implement AST Methods** (8 hours estimated)
   - Add all 6 methods to `scripts/agentic-kb-builder.mjs`
   - Test with 100+ documents
   - Verify performance (<2ms per chunk)

2. **Integration Testing** (4 hours)
   - Test GPU acceleration path
   - Verify fallback mechanisms
   - Load test with 1000+ documents

3. **Performance Optimization** (3 hours)
   - Benchmark embedding generation speed
   - Optimize batch sizes
   - Tune GPU layer allocation

---

## 🎯 Success Criteria

- [x] Ollama GPU server configured and running
- [x] WebGPU-CUDA bridge operational
- [ ] 6/6 AST helper methods implemented
- [ ] 100+ documents processed successfully
- [ ] Embeddings stored in PostgreSQL
- [ ] Redis cache populated
- [ ] Performance: <2ms per document chunking
- [ ] End-to-end KB build completes in <5 minutes

---

**Last Updated**: 2025-10-16
**Estimated Completion**: 15 hours (AST implementation + testing + optimization)