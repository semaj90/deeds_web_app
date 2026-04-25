# Phase 86: RAG + KAG LLM Contextual Engineering Patterns

**Version**: 1.0.0
**Updated**: 2025-12-27T13:50:30-08:00
**Purpose**: ACE Agent Prompting & LLM Output Optimization

---

## 🎯 Core Architecture

### RAG (Retrieval-Augmented Generation)

```
┌────────────────────────────────────────────────────────────────┐
│                     RAG RETRIEVAL FLOW                         │
│                                                                 │
│  Query → Embed (embeddinggemma:768D) → Vector Search          │
│              ↓                                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  PRIMARY: Qdrant (15 collections, 55,561 vectors)        │ │
│  │  - phase76_knowledge_base: Documentation KB              │ │
│  │  - phase72_ast_knowledge_base: Code patterns + AST       │ │
│  │  - surgical_fixes_phase66_85: Successful fix patterns    │ │
│  │  - phase81_ts_errors: TypeScript error embeddings        │ │
│  └──────────────────────────────────────────────────────────┘ │
│              ↓                                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  SECONDARY: PostgreSQL + pgvector (HNSW index)           │ │
│  │  - error_embeddings: 768D vectors, cosine similarity     │ │
│  │  - ts_errors: 33,599 errors with impact scoring          │ │
│  └──────────────────────────────────────────────────────────┘ │
│              ↓                                                  │
│  Top-K Results (score > 0.85) → Context Injection            │
└────────────────────────────────────────────────────────────────┘
```

### KAG (Knowledge-Augmented Generation)

```
┌────────────────────────────────────────────────────────────────┐
│                     KAG EXPANSION FLOW                          │
│                                                                 │
│  Initial Results → Graph Query → Related Entities              │
│              ↓                                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  KNOWLEDGE GRAPH (PostgreSQL knowledge_graph table)      │ │
│  │                                                           │ │
│  │  Relationships:                                           │ │
│  │  - (Error)-[:MENTIONS]->(File)                           │ │
│  │  - (Error)-[:CITES]->(KBEntry)                           │ │
│  │  - (Error)-[:DEPENDS_ON]->(Error)                        │ │
│  │  - (KBEntry)-[:FIXES]->(Error)                           │ │
│  │  - (File)-[:IMPORTS]->(File)                             │ │
│  │  - (Pattern)-[:MATCHES]->(Error)                         │ │
│  │  - (Fix)-[:APPLIED_TO]->(Error)                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│              ↓                                                  │
│  Expanded Context (related fixes, patterns, files)            │
└────────────────────────────────────────────────────────────────┘
```

---

## 🧠 ACE Prompting Patterns

### Pattern 1: Error-First Context

**Purpose**: Maximize fix quality by providing error context before code

```javascript
// scripts/phase76-ace-prompt-engineer.mjs
const errorFirstPrompt = `
You are an expert TypeScript developer fixing code errors.

## Error Details
- Code: ${error.error_code}
- Message: ${error.error_message}
- File: ${error.file_path}
- Line: ${error.line_number}
- Impact Score: ${error.impact_score}

## Similar Past Fixes (RAG Retrieved)
${ragResults.map(r => `- ${r.pattern_name}: ${r.fix_strategy} (score: ${r.score})`).join('\n')}

## Related Patterns (KAG Expanded)
${kagResults.map(r => `- ${r.relationship}: ${r.entity}`).join('\n')}

## Current Code Context (±60 lines)
\`\`\`typescript
${codeContext}
\`\`\`

## Instructions
1. Analyze the error in context of similar past fixes
2. Apply the most relevant fix strategy
3. Return ONLY the fixed code, no explanations
`;
```

### Pattern 2: Multi-Shot Fix Examples

**Purpose**: Improve fix accuracy with few-shot learning

```javascript
const multiShotPrompt = `
## Example 1: Missing Comma (TS1005)
Before: \`import { A B } from 'module'\`
After:  \`import { A, B } from 'module'\`

## Example 2: Glued Declaration (TS1128)
Before: \`const x = 1const y = 2\`
After:  \`const x = 1; const y = 2;\`

## Example 3: Unterminated String (TS1002)
Before: \`const s = "hello\`
After:  \`const s = "hello";\`

## Now fix this error:
${currentError}

## Code:
${codeContent}
`;
```

### Pattern 3: Confidence Gating

**Purpose**: Only auto-apply high-confidence fixes

```javascript
// phase86-autonomous-loop.mjs pattern
async function decideAction(ragScore, kagScore, llmConfidence) {
  const combinedScore = (ragScore * 0.4) + (kagScore * 0.3) + (llmConfidence * 0.3);

  if (combinedScore >= 0.85) {
    return { action: 'AUTO_APPLY', reason: 'High confidence match' };
  } else if (combinedScore >= 0.70) {
    return { action: 'SUGGEST', reason: 'Medium confidence, needs review' };
  } else if (combinedScore >= 0.50) {
    return { action: 'WEB_SEARCH', reason: 'Low confidence, search for docs' };
  } else {
    return { action: 'SKIP', reason: 'No confident match' };
  }
}
```

---

## 📊 LLM Output Optimization

### Schema 1: Structured Fix Response

```typescript
interface LLMFixResponse {
  fix_applied: boolean;
  confidence: number;  // 0.0 - 1.0
  strategy: string;    // "missing-comma" | "add-semicolon" | etc.
  diff: {
    file: string;
    before: string;
    after: string;
    line_start: number;
    line_end: number;
  };
  validation: {
    tsc_passed: boolean;
    errors_before: number;
    errors_after: number;
  };
  metadata: {
    rag_score: number;
    kag_score: number;
    llm_model: string;
    tokens_used: number;
  };
}
```

### Schema 2: Token Accounting

```typescript
interface TokenUsage {
  provider: "gemini" | "claude" | "ollama";
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd?: number;  // For paid APIs
  errors_fixed: number;
  efficiency: number; // errors_fixed / total_tokens * 1000
}
```

### Schema 3: ACE Leaderboard Entry

```typescript
interface ACELeaderboardEntry {
  provider: string;
  model: string;
  phase: "phase86";
  cycle: number;
  errors_fixed: number;
  tokens_spent: number;
  efficiency: number;  // errors per 1k tokens
  fix_success_rate: number;  // 0.0 - 1.0
  avg_confidence: number;
  timestamp: string;
}
```

---

## 🔧 FastMCP Tool Schemas

### Tool: qdrant_search

```javascript
{
  name: "qdrant_search",
  description: "Search knowledge base for similar patterns/fixes",
  parameters: {
    query: { type: "string", required: true },
    limit: { type: "number", default: 5 },
    threshold: { type: "number", default: 0.5 },
    collection: { type: "string", default: "phase76_knowledge_base" }
  },
  returns: {
    results: [{ score: number, title: string, url: string, summary: string }]
  }
}
```

### Tool: postgres_query

```javascript
{
  name: "postgres_query",
  description: "Query PostgreSQL for errors, graph, or embeddings",
  parameters: {
    query: { type: "string", required: true }
  },
  returns: {
    rows: Array,
    rowCount: number
  }
}
```

### Tool: read_file

```javascript
{
  name: "read_file",
  description: "Read file contents for code context",
  parameters: {
    filepath: { type: "string", required: true },
    startLine: { type: "number", optional: true },
    endLine: { type: "number", optional: true }
  },
  returns: {
    content: [{ type: "text", text: string }]
  }
}
```

### Tool: write_file

```javascript
{
  name: "write_file",
  description: "Write fixed content to file",
  parameters: {
    filepath: { type: "string", required: true },
    content: { type: "string", required: true }
  },
  returns: {
    content: [{ type: "text", text: string }]
  }
}
```

### Tool: ripgrep

```javascript
{
  name: "ripgrep",
  description: "Search codebase for patterns/symbols",
  parameters: {
    pattern: { type: "string", required: true },
    globs: { type: "string", default: "**/*" },
    cwd: { type: "string", default: "." },
    maxResults: { type: "number", default: 50 }
  },
  returns: {
    matches: [{ file: string, line: number, text: string }],
    count: number
  }
}
```

---

## 🎯 Pattern Recognition Rules

### TS1005: Missing Delimiter

```javascript
const TS1005_PATTERNS = [
  {
    regex: /import\s*{\s*(\w+)\s+(\w+)/,
    label: 'missing-comma-import',
    fix: (match) => `import { ${match[1]}, ${match[2]}`
  },
  {
    regex: /class\s+\w+\s*{\s*(\w+)\s*:\s*\w+\s+(\w+)/,
    label: 'missing-comma-class-member',
    fix: (match) => match[0].replace(match[1] + ' ' + match[2], match[1] + ', ' + match[2])
  },
  {
    regex: /;\s*from\s*'/,
    label: 'missing-semicolon-before-import',
    fix: (match) => match[0].replace(';', ';')
  }
];
```

### TS1128: Unexpected Token

```javascript
const TS1128_PATTERNS = [
  {
    regex: /}\s*{/,
    label: 'glued-blocks',
    fix: (match) => '}\n\n{'
  },
  {
    regex: /const\s+\w+\s*=\s*[^;]+const/,
    label: 'missing-semicolon-between-declarations',
    fix: (match) => match[0].replace(/const$/, ';\nconst')
  }
];
```

### TS1109: Expression Expected

```javascript
const TS1109_PATTERNS = [
  {
    regex: /\/[^/\n]*\n/,
    label: 'unterminated-regex',
    fix: (match) => match[0].replace(/\n/, '/\n')
  },
  {
    regex: /=\s*\n/,
    label: 'trailing-assignment',
    fix: (match) => '= undefined;\n'
  }
];
```

---

## 📈 Metrics & Logging

### Log Entry Schema

```javascript
{
  kind: "llm_call" | "tool_call" | "fix_applied" | "validation",
  timestamp: "2025-12-27T13:50:30-08:00",
  provider: "gemini" | "ollama" | "claude",
  model: "gemma3-legal:latest",
  phase: "phase86",
  cycle: 1,

  // For llm_call
  tokens_in: 1024,
  tokens_out: 512,
  total_tokens: 1536,

  // For fix_applied
  error_code: "TS1005",
  file_path: "src/lib/cache/gpu-leftover-cache.ts",
  confidence: 0.92,
  strategy: "missing-comma",

  // For validation
  tsc_passed: true,
  errors_before: 33599,
  errors_after: 33598,
  delta: -1
}
```

### Query Examples

```bash
# Gemini token usage
cat logs/phase86/*.jsonl | jq 'select(.provider == "gemini") | .total_tokens' | jq -s 'add'

# Fix success rate
cat logs/phase86/*.jsonl | jq 'select(.kind == "fix_applied") | .confidence' | jq -s 'add / length'

# Errors fixed by pattern
cat logs/phase86/*.jsonl | jq 'select(.kind == "fix_applied") | .strategy' | sort | uniq -c

# Token efficiency
cat logs/phase86/*.jsonl | jq 'select(.provider == "gemini") | (.errors_fixed / .total_tokens * 1000)' | jq -s 'add / length'
```

---

## 🚀 Deployment Checklist

### Phase 86 Readiness

- [x] FastMCP Server operational (port 3002)
- [x] Qdrant collections created (15 collections)
- [x] PostgreSQL + pgvector ready
- [x] Phase86 autonomous loop script ready
- [ ] Embed 10,000 errors (currently 100)
- [ ] Fix pattern labels ("undefined" → deterministic)
- [ ] Enable web search (Firecrawl/SearxNG)

### Commands

```bash
# Start FastMCP
node scripts/fastmcp-server.mjs

# Run Phase 86 (single iteration)
node scripts/phase86-autonomous-loop.mjs

# Run Phase 86 (5 iterations)
node scripts/phase86-autonomous-loop.mjs --iterations 5

# Ingest embeddings
node scripts/phase87-ingest-error-corpus.mjs --limit 10000

# Validate fixes
npx tsc --noEmit | head -20
```

---

## 📚 Related Documents

- `PHASE86-READINESS-CHECKLIST.md` - Full deployment guide
- `FASTMCP-STATUS-REPORT.md` - Server status & next steps
- `PHASE76-87-RAG-KAG-ARCHITECTURE.md` - System inventory
- `PHASE76-RAG-KAG-DATA-FLOW.md` - Data flow diagram
- `GEMINI.md` - Gemini agent integration
- `ace-agentic-patterns.md` - Original ACE patterns

---

## 🔄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-27 | Initial RAG+KAG ACE patterns |
