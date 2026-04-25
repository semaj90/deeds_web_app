# 🤖 Best Practices for Agentic Multi-Tool Error Remediation Pipeline

**Complete guide for Phase 72-75: Building a self-improving LLM system with GRPO learning**

## 📋 Table of Contents

1. [High-Throughput Embedding Generation](#high-throughput-embedding-generation)
2. [AST Analysis & Knowledge Graph](#ast-analysis--knowledge-graph)
3. [Multi-Tool Orchestration](#multi-tool-orchestration)
4. [External Knowledge Integration](#external-knowledge-integration)
5. [LLM Prompt Engineering](#llm-prompt-engineering)
6. [Evaluation & Feedback Loops](#evaluation--feedback-loops)
7. [System Design & Scalability](#system-design--scalability)

---

## 1. High-Throughput Embedding Generation

### Batch Processing ✅ **IMPLEMENTED**

**Current:** 100 errors/batch → **Optimize to:** 2000 errors/batch

```javascript
// Bad: Small batches (high overhead)
const BATCH_SIZE = 100; // Too many API calls

// Good: Large batches (minimize overhead)
const BATCH_SIZE = 2000; // Recommended for Qdrant bulk upserts
```

**Impact:** 20x faster embedding generation (from hours to minutes)

### GPU Acceleration ✅ **IMPLEMENTED**

```bash
# Current setup
ENABLE_GPU=true
RTX_3060_OPTIMIZATION=true
OLLAMA_GPU_LAYERS=30
```

**Fallback strategy:**
- Primary: CUDA-accelerated `embeddinggemma:latest`
- Fallback: CPU-based local model
- Emergency: Remote API (OpenAI/Gemini)

### Streaming & Memory Management ✅ **IMPLEMENTED**

```javascript
// ✅ Good: Stream JSONL line-by-line
fs.createReadStream('errors.jsonl')
  .pipe(split())
  .on('data', (line) => processError(JSON.parse(line)));

// ❌ Bad: Load entire file
const errors = JSON.parse(fs.readFileSync('errors.jsonl'));
```

**Result:** Handle 53,227+ errors without RAM bloat

### Resume Capability 🔄 **TODO: Task 8**

```javascript
// Check existing vectors before inserting
const existingIds = await qdrant.scroll({
  collection_name: 'phase72_error_patterns',
  limit: 10000
});

// Skip already-embedded errors
const toEmbed = errors.filter(e => !existingIds.includes(e.id));
```

---

## 2. AST Analysis & Knowledge Graph

### Targeted AST Extraction

**Extract only what matters:**

```javascript
import { Project } from 'ts-morph';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

// ✅ Extract key info
for (const sourceFile of project.getSourceFiles()) {
  const imports = sourceFile.getImportDeclarations();
  const exports = sourceFile.getExportDeclarations();
  const functions = sourceFile.getFunctions();
  const classes = sourceFile.getClasses();

  // Don't parse entire AST - just what's needed
}
```

### Graph Schema Design (Neo4j)

```cypher
// Nodes
CREATE (f:File {path: 'src/lib/service.ts'})
CREATE (fn:Function {name: 'submitOrder'})
CREATE (s:Symbol {name: 'calculateTax'})
CREATE (e:Error {code: 'TS2304', message: 'Cannot find name calculateTax'})

// Relationships
CREATE (f)-[:CONTAINS]->(fn)
CREATE (fn)-[:USES]->(s)
CREATE (f)-[:HAS_ERROR]->(e)
CREATE (e)-[:REFERS_TO]->(s)
```

**Query examples:**

```cypher
// Find where symbol is defined
MATCH (s:Symbol {name: 'calculateTax'})<-[:EXPORTS]-(f:File)
RETURN f.path;

// Find all errors in a module
MATCH (f:File {path: 'OrderService.ts'})-[:HAS_ERROR]->(e:Error)
RETURN e;

// Find dependencies of error-prone files
MATCH (f:File)-[:HAS_ERROR]->(:Error)
MATCH (f)-[:IMPORTS]->(dep:File)
RETURN f.path, collect(dep.path);
```

### Link Errors to Code Context

```javascript
// Enrich error with AST metadata
const enhancedError = {
  ...error,
  context: {
    file: 'OrderService.ts',
    function: 'submitOrder',
    line: 42,
    imports: ['TaxUtils', 'PricingService'],
    missingSymbol: 'calculateTax',
    availableInFile: 'TaxUtils.ts'
  }
};
```

---

## 3. Multi-Tool Orchestration

### Tool Selection Rules ✅ **IMPLEMENTED**

```javascript
// fastmcp-agent-router.js pattern
const toolRouter = {
  'TS2307': 'web_search',        // Module not found
  'TS2322': 'gemma3-legal',      // Type mismatch
  'TS2304': 'ast_graph',         // Cannot find name
  'TS2339': 'ast_graph',         // Property doesn't exist
  default: 'general_llm'
};

function selectTool(error) {
  const errorCode = error.code;
  return toolRouter[errorCode] || toolRouter.default;
}
```

### Dynamic Planning (Advanced)

```javascript
// Planner → Executor → Evaluator pattern
class AgenticPipeline {
  async plan(error) {
    return [
      { step: 1, tool: 'web_search', query: error.code },
      { step: 2, tool: 'ast_graph', query: error.symbol },
      { step: 3, tool: 'code_llm', context: 'combined' }
    ];
  }

  async execute(plan) {
    const results = [];
    for (const step of plan) {
      const result = await this.runTool(step.tool, step.query);
      results.push(result);
    }
    return results;
  }

  async evaluate(results, error) {
    // Apply fix and re-check
    const stillHasError = await runTypeScriptCompiler();
    return !stillHasError;
  }
}
```

### Parallel Tool Calls

```javascript
// ✅ Good: Independent tools in parallel
const [webResult, astResult] = await Promise.all([
  webSearch(error.code),
  astQuery(error.symbol)
]);

// ❌ Bad: Sequential when not needed
const webResult = await webSearch(error.code);
const astResult = await astQuery(error.symbol); // Could be parallel!
```

### Tool Error Handling

```javascript
async function safeTool(toolFn, ...args) {
  try {
    return await toolFn(...args);
  } catch (error) {
    console.warn(`Tool failed: ${error.message}`);
    return { success: false, fallback: true };
  }
}

// Graceful degradation
const webResult = await safeTool(webSearch, query);
if (!webResult.success) {
  // Try local knowledge base instead
  return await localKnowledgeBase.search(query);
}
```

---

## 4. External Knowledge Integration

### Effective Web Queries

```javascript
// ❌ Bad: Generic query
const query = error.message; // Too vague

// ✅ Good: Specific, contextual query
const query = `TypeScript ${error.code} ${error.keywords} site:stackoverflow.com OR site:typescriptlang.org`;
```

### Source Filtering

```javascript
const TRUSTED_DOMAINS = [
  'typescriptlang.org',
  'github.com/microsoft/TypeScript',
  'stackoverflow.com',
  'developer.mozilla.org'
];

function filterResults(results) {
  return results
    .filter(r => TRUSTED_DOMAINS.some(d => r.url.includes(d)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Top 3 only
}
```

### Summarize Results

```javascript
async function extractKeyInsight(webPage) {
  // Don't dump entire page - extract the fix
  const codeBlocks = extractCodeBlocks(webPage);
  const acceptedAnswer = findAcceptedAnswer(webPage);

  return {
    summary: acceptedAnswer.text.slice(0, 300),
    code: codeBlocks[0],
    source: webPage.url
  };
}
```

### Knowledge Cache (KAG)

```javascript
// Exact-match cache for known errors
const knowledgeCache = {
  'TS1005': 'Syntax error - check for missing semicolon or bracket',
  'TS2304': 'Symbol not found - check imports or type definitions',
  'TS2307': 'Module not found - verify import path or install package'
};

function quickFix(error) {
  const cached = knowledgeCache[error.code];
  if (cached) return { fix: cached, confidence: 1.0 };

  // Fall through to LLM if not cached
  return null;
}
```

---

## 5. LLM Prompt Engineering

### Context Organization

```javascript
const prompt = `
# Error Analysis

## Error Details
- **Code:** ${error.code}
- **Message:** ${error.message}
- **File:** ${error.file}:${error.line}
- **Snippet:**
\`\`\`typescript
${error.codeSnippet}
\`\`\`

## Similar Past Errors
${similarErrors.map(e => `- ${e.message} → Fixed by: ${e.fix}`).join('\n')}

## AST Context
- Function: \`${context.function}\`
- Imports: ${context.imports.join(', ')}
- Missing Symbol: \`${context.missingSymbol}\` (defined in ${context.availableInFile})

## External Reference
From TypeScript docs: ${externalKnowledge.summary}

## Task
Given the above context, suggest a precise fix for this error.
Output format:
{
  "explanation": "...",
  "suggestedFix": "...",
  "confidence": 0.0-1.0
}
`;
```

### Chain-of-Thought Reasoning

```javascript
// Step 1: Reasoning
const reasoning = await llm.generate({
  prompt: `Analyze this error step-by-step:\n${errorContext}\n\nWhat are the possible causes?`
});

// Step 2: Solution
const solution = await llm.generate({
  prompt: `Given this analysis:\n${reasoning}\n\nProvide the fix.`
});

// Step 3: Self-Critique
const critique = await llm.generate({
  prompt: `Review this solution:\n${solution}\n\nDoes it fully address the error? Any issues?`
});
```

### Avoiding Hallucinations

```javascript
const prompt = `
**CRITICAL RULES:**
1. Only use types/functions you see in the provided context
2. If unsure, say "UNCERTAIN" rather than guessing
3. Do not invent APIs that don't exist
4. Base your answer on the actual code shown

${errorContext}
`;
```

### Model Cascading

```javascript
// Use right model for right task
async function intelligentRoute(task) {
  if (task.complexity === 'low') {
    return await fastModel.generate(task.prompt); // Quick answers
  } else if (task.complexity === 'medium') {
    return await gemma3.generate(task.prompt);    // Code reasoning
  } else {
    return await gpt4.generate(task.prompt);      // Complex analysis
  }
}
```

---

## 6. Evaluation & Feedback Loops

### Automatic Validation

```javascript
async function validateFix(error, suggestedFix) {
  // Apply fix to code
  await applyPatch(error.file, suggestedFix);

  // Re-run compiler
  const result = await execAsync('npx tsc --noEmit');

  // Check if error is gone
  const stillHasError = result.stderr.includes(error.code);

  if (stillHasError) {
    await revertPatch(error.file);
    return { success: false, newErrors: parseErrors(result.stderr) };
  }

  return { success: true };
}
```

### Retry Limits & Escalation

```javascript
const MAX_RETRIES = 3;

async function fixWithRetry(error) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const fix = await generateFix(error);
    const validation = await validateFix(error, fix);

    if (validation.success) {
      return { fixed: true, attempts: attempt };
    }

    console.log(`Attempt ${attempt} failed, retrying...`);
  }

  // Escalate to human
  await createJiraTicket({
    title: `Auto-fix failed: ${error.code}`,
    description: `Agent attempted ${MAX_RETRIES} fixes without success`,
    priority: 'high'
  });

  return { fixed: false, escalated: true };
}
```

### Continuous Learning

```javascript
// Log successes for future reference
async function logSuccess(error, fix) {
  await knowledgeBase.insert({
    errorCode: error.code,
    errorMessage: error.message,
    successfulFix: fix,
    confidence: 1.0,
    timestamp: new Date()
  });

  // Add to few-shot examples
  fewShotExamples.push({
    error: error.message,
    fix: fix,
    context: error.context
  });
}
```

---

## 7. System Design & Scalability

### Modular Architecture

```
sveltekit-frontend/
├── src/lib/services/error-analysis/
│   ├── types.ts                    # Shared types
│   ├── CacheService.ts             # Redis caching
│   ├── EmbeddingService.ts         # Qdrant embeddings
│   ├── ASTService.ts               # TypeScript AST
│   ├── GraphService.ts             # Neo4j KAG
│   ├── WebSearchService.ts         # External knowledge
│   ├── LLMService.ts               # Prompt engineering
│   ├── ValidationService.ts        # Auto-testing
│   └── OrchestrationService.ts     # Tool routing
├── scripts/
│   ├── generate-errors-jsonl.mjs   # Error collection
│   ├── embed-errors-phase72.mjs    # Embedding generation
│   ├── phase73-knowledge-graph-builder.mjs
│   ├── phase74-route-inventory.mjs
│   └── phase75-agentic-fixer.mjs   # 🆕 Auto-fix pipeline
└── docs/
    ├── AGENT_BEST_PRACTICES.md     # This file
    └── PHASE_75_SPEC.md             # Implementation plan
```

### Configuration Management

```javascript
// config/agent.config.js
export default {
  embedding: {
    batchSize: 2000,
    model: 'embeddinggemma:latest',
    dimensions: 768,
    useGPU: true
  },

  llm: {
    primaryModel: 'gemma3-legal:latest',
    fallbackModel: 'llama3.1:8b',
    temperature: 0.2,
    maxTokens: 2048
  },

  tools: {
    webSearch: {
      enabled: true,
      maxResults: 3,
      timeout: 5000
    },
    astAnalysis: {
      enabled: true,
      cacheResults: true
    }
  },

  validation: {
    autoApplyThreshold: 0.85,
    escalateThreshold: 0.5,
    maxRetries: 3
  }
};
```

### Performance Monitoring

```javascript
import { performance } from 'perf_hooks';

class PerformanceMonitor {
  metrics = {};

  start(operation) {
    this.metrics[operation] = performance.now();
  }

  end(operation) {
    const duration = performance.now() - this.metrics[operation];
    console.log(`⏱️  ${operation}: ${duration.toFixed(2)}ms`);

    // Log to monitoring service
    await logMetric({
      operation,
      duration,
      timestamp: new Date()
    });
  }
}

// Usage
const monitor = new PerformanceMonitor();
monitor.start('embedding_generation');
await generateEmbeddings(errors);
monitor.end('embedding_generation');
```

### Documentation

Create comprehensive guides for each component:

- `docs/EMBEDDING_GUIDE.md` - How embeddings work
- `docs/AST_ANALYSIS_GUIDE.md` - AST extraction patterns
- `docs/TOOL_ROUTING_GUIDE.md` - When to use which tool
- `docs/PROMPT_TEMPLATES.md` - LLM prompt library
- `docs/TROUBLESHOOTING.md` - Common issues & fixes

---

## 📊 Performance Targets

| Metric | Baseline | Target | Actual |
|--------|----------|--------|--------|
| Error collection | 90s | 10s | 66s ✅ |
| Embedding generation | 120min | 10min | 5min ✅ |
| Single error fix | 30s | 5s | - |
| Fix success rate | - | 70% | - |
| Auto-apply rate | - | 50% | - |

---

## 🚀 Implementation Roadmap

### ✅ **Completed (Tasks 1-7)**
1. Change detection & caching
2. Error collection (53,227 errors)
3. Embedding generation (Qdrant)
4. Knowledge graph (Phase 73)
5. Route inventory (Phase 74)
6. Multi-language analyzers
7. Best practices documentation

### 🔄 **In Progress (Tasks 8-17)**
8. JSONL SIMD parsing
9. Error clustering (CUDA)
10. GRPO learning pipeline
11. Tool orchestration
12. Auto-fix validation
13. Continuous learning
14. Visual dashboard
15. Production deployment
16. Performance optimization
17. End-to-end testing

---

## 📚 References

- TypeScript AST: https://ts-morph.com/
- Qdrant vector DB: https://qdrant.tech/
- Neo4j graph DB: https://neo4j.com/
- GRPO learning: https://arxiv.org/abs/2402.03300
- Agent patterns: https://lilianweng.github.io/posts/2023-06-23-agent/

---

**Last Updated:** December 19, 2025
**Maintainer:** Phase 72-75 Development Team
**Status:** Living document - updated as system evolves
