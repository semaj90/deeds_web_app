# RAG/KAG Knowledge Base Integration Guide

## Overview
This guide documents the integration of Retrieval-Augmented Generation (RAG) and Knowledge-Augmented Generation (KAG) systems with the Svelte 5 web application.

## System Architecture

### Components
1. **Qdrant Vector Database** (localhost:6333)
   - Stores embeddings of knowledge base articles
   - Enables semantic search across documentation
   - Collections: `phase72_ast_knowledge_base`, `svelte5_knowledge`

2. **Redis Cache** (localhost:6379)
   - Caches frequently accessed embeddings
   - Stores LLM response cache (1 hour TTL)
   - Session data for autonomous agents

3. **Ollama LLM** (localhost:11434)
   - Model: `gemma3-legal:latest`
   - Context window: 8192 tokens
   - Used for: Code analysis, error fixing, documentation generation

4. **Phase 79 Cognitive Engine**
   - Autonomous error fixing pipeline
   - AST-based code transformation
   - Validation scoring system (0-100)

## Knowledge Base Structure

### Article Format
```markdown
# Title (H1 - Main Topic)

## Section (H2 - Subtopic)

### Problem Description
Clear description of the issue with code examples

### Root Cause
Technical explanation of why the issue occurs

### Solution
Step-by-step fix with code snippets

### Prevention
Best practices to avoid the issue

### Related Files
- `path/to/file1.ts` (actual file paths)
- `path/to/file2.svelte`

### Tags
#category #technology #issue-type #component
```

### Tag Taxonomy

**Technology Tags**:
- `#svelte5` - Svelte 5 specific
- `#typescript` - TypeScript related
- `#drizzle` - Drizzle ORM
- `#lucia` - Lucia auth
- `#vscode` - Editor issues
- `#redis` - Caching layer
- `#qdrant` - Vector database

**Issue Type Tags**:
- `#error` - Runtime/compile errors
- `#warning` - TypeScript warnings
- `#migration` - Svelte 4 → 5 migration
- `#performance` - Optimization patterns
- `#cache` - Caching issues
- `#module-resolution` - Import/export problems

**Component Tags**:
- `#api` - API endpoints
- `#auth` - Authentication
- `#database` - PostgreSQL/Drizzle
- `#ui` - User interface components
- `#runes` - Svelte 5 reactivity
- `#testing` - Test patterns

**Resolution Tags**:
- `#fixed` - Issue resolved
- `#workaround` - Temporary solution
- `#best-practices` - Recommended approach
- `#debugging` - Diagnostic techniques

## Embedding Generation

### Vector Embedding Pipeline
```typescript
import { QdrantClient } from '@qdrant/js-client-rest';
import { embed } from '$lib/ai/embeddings';

async function indexKnowledgeBase() {
  const client = new QdrantClient({ url: 'http://localhost:6333' });

  // Read markdown files from data/knowledge/
  const articles = await readKnowledgeArticles();

  for (const article of articles) {
    // Extract sections
    const sections = parseMarkdownSections(article.content);

    for (const section of sections) {
      // Generate embedding
      const vector = await embed(section.text);

      // Store in Qdrant
      await client.upsert('svelte5_knowledge', {
        points: [{
          id: `${article.id}-${section.id}`,
          vector: vector,
          payload: {
            title: article.title,
            section: section.heading,
            content: section.text,
            tags: section.tags,
            filePath: article.filePath,
            relatedFiles: section.relatedFiles
          }
        }]
      });
    }
  }
}
```

### Semantic Search
```typescript
async function searchKnowledge(query: string, topK: number = 5) {
  const client = new QdrantClient({ url: 'http://localhost:6333' });

  // Generate query embedding
  const queryVector = await embed(query);

  // Search Qdrant
  const results = await client.search('svelte5_knowledge', {
    vector: queryVector,
    limit: topK,
    with_payload: true
  });

  return results.map(r => ({
    title: r.payload.title,
    section: r.payload.section,
    content: r.payload.content,
    tags: r.payload.tags,
    score: r.score
  }));
}
```

## LLM Integration

### Contextual Prompting
```typescript
async function generateWithContext(userQuery: string) {
  // 1. Search knowledge base
  const context = await searchKnowledge(userQuery, 3);

  // 2. Build augmented prompt
  const prompt = `
You are a Svelte 5 migration assistant. Use the following context to answer the question.

## Context:
${context.map(c => `
### ${c.title} - ${c.section}
${c.content}
`).join('\n')}

## Question:
${userQuery}

## Answer:
Provide a detailed answer based on the context above. Include code examples where appropriate.
  `.trim();

  // 3. Generate with LLM
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_ctx: 8192
      }
    })
  });

  const data = await response.json();
  return data.response;
}
```

### Multi-Step Reasoning (Phase 79)
```typescript
interface ReasoningStep {
  thought: string;
  action: 'search' | 'analyze' | 'generate' | 'validate';
  result: any;
}

async function cognitiveLoop(task: string): Promise<ReasoningStep[]> {
  const steps: ReasoningStep[] = [];
  let currentThought = task;

  for (let i = 0; i < 3; i++) {
    // 1. Plan next action
    const plan = await llm.generate(`
Given the task: ${task}
Previous steps: ${JSON.stringify(steps)}

What should the next action be?
Options: search, analyze, generate, validate
    `);

    // 2. Execute action
    let result;
    if (plan.action === 'search') {
      result = await searchKnowledge(plan.query);
    } else if (plan.action === 'analyze') {
      result = await analyzeCode(plan.filePath);
    } else if (plan.action === 'generate') {
      result = await generatePatch(plan.context);
    } else if (plan.action === 'validate') {
      result = await validatePatch(plan.patch);
    }

    // 3. Record step
    steps.push({
      thought: plan.reasoning,
      action: plan.action,
      result: result
    });

    // 4. Check if done
    if (plan.action === 'validate' && result.score > 80) {
      break;
    }
  }

  return steps;
}
```

## Caching Strategy

### Redis Cache Layers
```typescript
// Layer 1: Embedding cache (7 days TTL)
const EMBEDDING_CACHE_KEY = (text: string) => `embed:${hash(text)}`;
await redis.set(EMBEDDING_CACHE_KEY(text), JSON.stringify(vector), 'EX', 604800);

// Layer 2: Search results cache (1 hour TTL)
const SEARCH_CACHE_KEY = (query: string) => `search:${hash(query)}`;
await redis.set(SEARCH_CACHE_KEY(query), JSON.stringify(results), 'EX', 3600);

// Layer 3: LLM response cache (30 minutes TTL)
const LLM_CACHE_KEY = (prompt: string) => `llm:${hash(prompt)}`;
await redis.set(LLM_CACHE_KEY(prompt), response, 'EX', 1800);
```

### Cache Invalidation
```typescript
// Invalidate on knowledge base update
await redis.del(`search:*`); // Clear all search caches
await redis.del(`llm:*`);    // Clear LLM caches
// Keep embedding cache (embeddings don't change)

// Selective invalidation
const tagsToInvalidate = ['#svelte5', '#migration'];
for (const tag of tagsToInvalidate) {
  await redis.del(`search:*:${tag}:*`);
}
```

## Error Resolution Workflow

### Phase 79 Pipeline
```bash
# 1. Collect errors
npm run phase78:collect-errors

# 2. Generate patches with RAG context
npm run phase79:engine

# 3. Review recommendations
cat data/recommendations.jsonl | jq '.patches[] | select(.score > 80)'

# 4. Apply patches
npm run phase79:apply-patches

# 5. Validate
npm run check
```

### Autonomous Fixing Loop
```typescript
async function autoFixErrors() {
  let iteration = 0;
  const maxIterations = 5;

  while (iteration < maxIterations) {
    // 1. Collect errors
    const errors = await collectTypeScriptErrors();
    if (errors.length === 0) break;

    // 2. Group by category
    const grouped = groupErrorsByPattern(errors);

    // 3. For each category, search knowledge base
    for (const [pattern, errorList] of Object.entries(grouped)) {
      const context = await searchKnowledge(pattern, 3);

      // 4. Generate patch
      const patch = await generatePatch({
        errors: errorList,
        context: context,
        files: await readAffectedFiles(errorList)
      });

      // 5. Validate patch
      const score = await validatePatch(patch);

      // 6. Apply if high confidence
      if (score > 80) {
        await applyPatch(patch);
        console.log(`✅ Applied patch for ${pattern} (score: ${score})`);
      } else {
        console.log(`⏭️ Skipped patch for ${pattern} (score: ${score})`);
      }
    }

    iteration++;
  }
}
```

## Best Practices

### 1. Knowledge Base Maintenance
- Update articles when patterns change
- Add new articles for recurring issues
- Tag articles consistently
- Include actual file paths in "Related Files"
- Keep code examples up-to-date

### 2. Embedding Quality
- Use meaningful section headings (H2/H3)
- Keep sections focused (200-500 tokens)
- Include code examples in context
- Add cross-references between articles

### 3. Prompt Engineering
- Provide 3-5 relevant context chunks
- Order by relevance score
- Include file paths for grounding
- Use clear section delimiters

### 4. Cache Management
- Monitor Redis memory usage
- Set appropriate TTLs
- Invalidate on schema changes
- Use namespaced keys

### 5. LLM Selection
- **Ollama (gemma3-legal)**: Fast, local, offline
- **Gemini 2.0**: Web search, thinking mode
- **Claude**: Complex reasoning, long context
- **GPT-4**: Best quality, highest cost

## Monitoring & Metrics

### Key Metrics
```typescript
interface RAGMetrics {
  // Search performance
  avgSearchLatency: number;      // ms
  cacheHitRate: number;          // %

  // Embedding quality
  avgCosineSimilarity: number;   // 0-1
  topKRelevance: number;         // % relevant in top-5

  // LLM performance
  avgGenerationTime: number;     // ms
  avgTokensUsed: number;

  // Autonomous fixing
  patchSuccessRate: number;      // %
  avgValidationScore: number;    // 0-100
  errorsReduced: number;         // count
}
```

### Logging
```typescript
// Log RAG queries for analysis
await redis.lpush('rag:query:log', JSON.stringify({
  timestamp: Date.now(),
  query: userQuery,
  topResults: results.map(r => r.title),
  avgScore: results.reduce((sum, r) => sum + r.score, 0) / results.length
}));

// Trim log to last 1000 entries
await redis.ltrim('rag:query:log', 0, 999);
```

## Testing

### Unit Tests
```typescript
// tests/rag/search.test.ts
import { expect, test } from 'vitest';
import { searchKnowledge } from '$lib/ai/rag';

test('searchKnowledge returns relevant results', async () => {
  const results = await searchKnowledge('Svelte 5 runes state management');

  expect(results.length).toBeGreaterThan(0);
  expect(results[0].tags).toContain('#svelte5');
  expect(results[0].score).toBeGreaterThan(0.7);
});

test('searchKnowledge caches results', async () => {
  const query = 'TypeScript module resolution';

  // First call
  const start1 = performance.now();
  await searchKnowledge(query);
  const time1 = performance.now() - start1;

  // Second call (cached)
  const start2 = performance.now();
  await searchKnowledge(query);
  const time2 = performance.now() - start2;

  expect(time2).toBeLessThan(time1 * 0.5); // At least 50% faster
});
```

### Integration Tests
```typescript
// tests/rag/autonomous-fixing.test.ts
import { expect, test } from 'vitest';
import { autoFixErrors } from '$lib/ai/phase79';

test('autoFixErrors reduces error count', async () => {
  const initialErrors = await collectTypeScriptErrors();

  await autoFixErrors();

  const finalErrors = await collectTypeScriptErrors();
  expect(finalErrors.length).toBeLessThan(initialErrors.length);
});
```

## API Endpoints

### Search Knowledge Base
```typescript
// GET /api/knowledge/search?q=query&limit=5
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401);

  const query = url.searchParams.get('q') || '';
  const limit = Number(url.searchParams.get('limit')) || 5;

  const results = await searchKnowledge(query, limit);

  return json({ results });
};
```

### Generate with Context
```typescript
// POST /api/knowledge/generate
// Body: { query: string, includeContext: boolean }
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401);

  const { query, includeContext } = await request.json();

  let response;
  if (includeContext) {
    response = await generateWithContext(query);
  } else {
    response = await llm.generate(query);
  }

  return json({ response });
};
```

## Future Enhancements

### Planned Features
1. **Fine-tuned Embeddings**: Train custom embedding model on codebase
2. **Graph RAG**: Add knowledge graph relations (e.g., "fixes" → "error pattern")
3. **Multi-modal RAG**: Include screenshots, diagrams in knowledge base
4. **Federated Search**: Query multiple knowledge bases (docs, GitHub, Stack Overflow)
5. **A/B Testing**: Compare LLM providers for specific tasks

### Research Areas
- **Self-healing Code**: Automatic patch application with rollback
- **Proactive Suggestions**: Detect anti-patterns before errors occur
- **Code Review AI**: Suggest improvements based on best practices
- **Documentation Generation**: Auto-generate knowledge base articles from code changes

## Tags
#rag #kag #knowledge-base #llm #embeddings #qdrant #redis #phase79 #autonomous-fixing #svelte5 #typescript #best-practices #architecture
