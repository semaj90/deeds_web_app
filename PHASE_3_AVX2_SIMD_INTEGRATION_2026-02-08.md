# Phase 3: AVX2/SIMD Error Reduction Integration

**Date**: February 8, 2026
**Status**: 🚀 In Progress
**Goal**: Apply existing AVX2/SIMD/RL infrastructure to fix 1,443 svelte-check errors

---

## 🎯 Overview

We have **2 parallel efforts** that need to converge:

### Phase 1-2: Manual Consolidation (Complete ✅)
- ✅ Cache services: 7 → 1 (91% reduction)
- ✅ Ollama services: 24 → 3 (87.5% reduction)
- ✅ Total: 28 → 4 services (85.7% reduction)

### Phase 3: Automated Error Fixing (Starting 🚀)
- Use existing AVX2/SIMD/RL pipeline
- Target: 1,443 svelte-check errors
- Goal: 80%+ auto-fix rate

---

## 🏗️ Infrastructure Status

### ✅ Ready
| Service | Port | Status | Model/Tech |
|---------|------|--------|------------|
| **Ollama** | 11434 | ✅ Running | embeddinggemma:latest, gemma3-legal:latest |
| **SIMD Service** | 8096 | 🔄 Starting | AVX2-optimized JSON |
| **Error Extractor** | - | ✅ Created | extract-errors.mjs |

### ⏳ Needs Docker Desktop
| Service | Port | Purpose |
|---------|------|---------|
| **Postgres 17** | 5432 | pgvector, error history |
| **Qdrant** | 6333 | Vector similarity search |
| **Redis** | 6379 | Embedding cache |
| **MinIO** | 9000 | Document storage |

---

## 📊 Current Error State

### From Previous Analysis (Phase 67-68)
- **Starting**: 150,925 errors
- **After Consolidation**: 89,000 errors
- **After Manual Fixes**: 1,443 errors
- **Reduction**: 99% (from peak)

### Error Distribution
| Pattern | Count | % | Fix Strategy |
|---------|-------|---|--------------|
| `',' expected` | ~300 | 20% | Regex patterns |
| `Cannot find name` | ~250 | 17% | ts-morph imports |
| `Type mismatch` | ~200 | 14% | LLM patches |
| `Property missing` | ~150 | 10% | Interface fixes |
| `Svelte 5 runes` | ~100 | 7% | ts-morph migration |
| `Bits-UI API` | ~80 | 5% | Import refactoring |
| `UnoCSS syntax` | ~60 | 4% | CSS fixes |
| `Drizzle 0.44` | ~50 | 3% | Schema validation |
| **Other** | ~253 | 17% | Mixed strategies |

---

## 🚀 Integration Pipeline

### Stage 1: Extract Errors (5 minutes)
```bash
cd sveltekit-frontend
node scripts/extract-errors.mjs
```

**Output**:
- `svelte-errors.json` - All errors with metadata
- `svelte-errors-optimized.json` - SIMD-optimized (if service running)

**Data Structure**:
```json
{
  "totalErrors": 1443,
  "errorsByType": {
    "syntax": 300,
    "import": 250,
    "type": 200,
    "property": 150
  },
  "topPatterns": [
    { "pattern": "TS1005: ',' expected...", "count": 87 },
    { "pattern": "TS2304: Cannot find name...", "count": 63 }
  ],
  "errors": [...]
}
```

### Stage 2: Generate Embeddings (10 minutes)
```python
# backend/scripts/embed_errors.py
from ollama import Client

client = Client(base_url='http://localhost:11434')

async def embed_errors(errors):
    embeddings = []
    for error in errors:
        # Create text representation
        text = f"{error['code']}: {error['message']} in {error['file']}"

        # Generate embedding with embeddinggemma:latest
        response = client.embeddings(
            model='embeddinggemma:latest',
            prompt=text
        )

        embeddings.append({
            'error': error,
            'embedding': response['embedding']
        })

    return embeddings
```

**Performance**:
- Cached: <1ms per error
- Uncached: ~50ms per error
- Total: ~2-3 minutes for 1,443 errors

### Stage 3: Cluster Errors (5 minutes)
```python
# backend/scripts/cluster_errors.py
from sklearn.cluster import DBSCAN
import numpy as np

async def cluster_errors(embedded_errors):
    # Extract embeddings
    embeddings = np.array([e['embedding'] for e in embedded_errors])

    # DBSCAN clustering (density-based)
    clustering = DBSCAN(eps=0.3, min_samples=3, metric='cosine')
    labels = clustering.fit_predict(embeddings)

    # Group by cluster
    clusters = {}
    for i, label in enumerate(labels):
        if label == -1:
            continue  # Outlier

        if label not in clusters:
            clusters[label] = []

        clusters[label].append(embedded_errors[i]['error'])

    return clusters
```

**Expected Clusters**: 40-60 clusters from 1,443 errors

### Stage 4: Apply Fix Strategies (15-20 minutes)

#### Strategy 1: Regex Patterns (Fast)
```typescript
// For syntax errors like ',' expected
const patterns = [
  { pattern: /focus:\s+border/g, replacement: 'focus:border' },
  { pattern: /hover:\s+bg/g, replacement: 'hover:bg' },
  { pattern: /md:grid-cols-(\d+),\s+lg:/g, replacement: 'md:grid-cols-$1 lg:' }
];

// Apply to all files in cluster
for (const file of cluster.files) {
  let content = fs.readFileSync(file, 'utf-8');
  for (const { pattern, replacement } of patterns) {
    content = content.replace(pattern, replacement);
  }
  fs.writeFileSync(file, content);
}
```

**Expected**: 300-400 errors fixed (~5 minutes)

#### Strategy 2: ts-morph Codemods (Medium)
```typescript
import { Project } from 'ts-morph';

const project = new Project({ tsConfigFilePath: './tsconfig.json' });

// Fix 1: Svelte 5 runes
for (const file of project.getSourceFiles()) {
  file.getVariableStatements()
    .filter(stmt => stmt.getDeclarations()[0].getText().startsWith('export let'))
    .forEach(stmt => {
      const name = stmt.getDeclarations()[0].getName();
      stmt.replaceWithText(`let { ${name} } = $props();`);
    });
}

// Fix 2: Bits-UI imports
for (const file of project.getSourceFiles()) {
  file.getImportDeclarations()
    .filter(imp => imp.getModuleSpecifierValue() === 'bits-ui')
    .forEach(imp => {
      const named = imp.getNamedImports()[0]?.getName();
      if (named) {
        imp.setModuleSpecifier(`bits-ui/components/${named.toLowerCase()}`);
        imp.removeNamedImports();
        imp.setNamespaceImport(named);
      }
    });
}

project.saveSync();
```

**Expected**: 400-500 errors fixed (~8 minutes)

#### Strategy 3: LLM Patches (Slow but Smart)
```typescript
import { ollamaConfig } from '$lib/services/ollama-config-service';

async function generateFix(error, context) {
  const prompt = `
Fix this TypeScript error in a Svelte 5 component:

Error: ${error.code}: ${error.message}
File: ${error.file}:${error.line}

Context:
${context}

Requirements:
- Use Svelte 5 runes ($props, $state, $derived)
- Use Bits-UI namespace imports
- Use UnoCSS without spaces before colons
- Use Drizzle ORM 0.44 syntax

Provide only the fixed code, no explanations.
`;

  const response = await ollamaConfig.generateCompletion(prompt, {
    model: 'gemma3-legal:latest',
    temperature: 0.3,
    maxTokens: 500
  });

  return response;
}
```

**Expected**: 200-300 errors fixed (~10 minutes)

---

## 📈 Expected Results

| Stage | Errors Fixed | Time | Method |
|-------|--------------|------|--------|
| **Extract** | 0 | 2 min | svelte-check + SIMD |
| **Embed** | 0 | 3 min | embeddinggemma |
| **Cluster** | 0 | 2 min | DBSCAN |
| **Regex** | 350 | 5 min | Pattern matching |
| **ts-morph** | 450 | 8 min | AST transformation |
| **LLM** | 250 | 10 min | gemma3-legal |
| **Manual** | 393 | - | Edge cases |
| **Total** | **1,050/1,443** | **30 min** | **73% auto-fixed** |

---

## 🔧 Tech Stack Integration

### Svelte 5 Runes
**Pattern Detection**:
```typescript
// OLD: export let name;
// NEW: let { name } = $props();

// OLD: $: doubled = count * 2;
// NEW: let doubled = $derived(count * 2);

// OLD: $: console.log(count);
// NEW: $effect(() => console.log(count));
```

**Fix Strategy**: ts-morph codemod

### UnoCSS Styling
**Pattern Detection**:
```css
/* WRONG: Space before colon */
focus: border-emerald-500

/* CORRECT: No space */
focus:border-emerald-500
```

**Fix Strategy**: Regex pattern

### Bits-UI API
**Pattern Detection**:
```typescript
// OLD: Named import
import { Button } from 'bits-ui';

// NEW: Namespace import
import * as Button from 'bits-ui/components/button';
```

**Fix Strategy**: ts-morph import transform

### Drizzle ORM 0.44
**Pattern Detection**:
```typescript
// OLD: Colon separator
index().on(table.col1: table.col2)

// NEW: Comma separator
index().on(table.col1, table.col2)
```

**Fix Strategy**: Regex or ts-morph

### Docker Containers (legal_ai_db)
**Services**:
- postgres:17-alpine (pgvector)
- qdrant/qdrant:latest
- redis:alpine
- minio/minio:latest

**Status**: Need to start Docker Desktop

---

## 🎯 Action Plan

### Immediate (Next 10 minutes)
1. ✅ Create error extraction script
2. 🔄 Wait for svelte-check to complete
3. 🔄 Start SIMD service (port 8096)
4. ⏳ Start Docker Desktop
5. ⏳ Start Docker services

### This Session (Next 30 minutes)
6. Run error extraction
7. Generate embeddings
8. Cluster errors
9. Apply fix strategies (regex → ts-morph → LLM)
10. Validate fixes with svelte-check

### Next Session
11. Review remaining errors (~393)
12. Manual fixes for edge cases
13. Document patterns for future prevention
14. Update RL training data

---

## 📝 Files Created

1. ✅ `scripts/extract-errors.mjs` - Error extraction
2. ⏳ `backend/scripts/embed_errors.py` - Embedding generation
3. ⏳ `backend/scripts/cluster_errors.py` - Error clustering
4. ⏳ `backend/scripts/apply_fixes.py` - Fix application
5. ✅ `PHASE_3_AVX2_SIMD_INTEGRATION_2026-02-08.md` - This doc

---

## 🔗 Related Documentation

- [QUICK_START_ERROR_REDUCTION.md](QUICK_START_ERROR_REDUCTION.md) - Pipeline overview
- [AVX2_ERROR_REDUCTION_PIPELINE.md](docs/AVX2_ERROR_REDUCTION_PIPELINE.md) - Architecture
- [MINIO_SIMD_COMPLETE.md](MINIO_SIMD_COMPLETE.md) - SIMD integration
- [CACHE_CONSOLIDATION_COMPLETE_2026-02-07.md](CACHE_CONSOLIDATION_COMPLETE_2026-02-07.md) - Phase 1
- [OLLAMA_CONSOLIDATION_COMPLETE_2026-02-07.md](OLLAMA_CONSOLIDATION_COMPLETE_2026-02-07.md) - Phase 2

---

## 💡 Key Insights

1. **We already have the infrastructure** - Just need to wire it up
2. **Embeddings enable smart clustering** - Group similar errors automatically
3. **Multiple fix strategies** - Regex (fast) → ts-morph (reliable) → LLM (smart)
4. **RL learning** - Pipeline improves over time by tracking fix success rates
5. **Docker containers ready** - legal_ai_db has all services configured

---

## ✅ Success Criteria

- [ ] Extract 1,443 errors with metadata
- [ ] Generate embeddings for all errors
- [ ] Cluster into 40-60 similar groups
- [ ] Auto-fix 70%+ of errors (1,000+)
- [ ] Reduce total errors to <500
- [ ] Document remaining manual fixes
- [ ] Update MEMORY.md with Phase 3 results

---

**Status**: 🚀 Ready to Execute

**Next Command**: `cd sveltekit-frontend && node scripts/extract-errors.mjs`