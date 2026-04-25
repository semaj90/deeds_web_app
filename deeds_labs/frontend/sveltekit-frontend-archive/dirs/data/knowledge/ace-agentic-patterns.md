# ACE Agentic Patterns and Autonomous Workflows

## Tags
#ace #agentic #autonomous #gemma3 #llm #workflow #self-prompting #tool-calling

## Overview

The ACE (Autonomous Cognitive Engine) framework enables self-prompting, autonomous code fixing, and intelligent workflow orchestration. This guide covers:
- ACE agent architecture patterns
- Gemma3-legal model integration
- FastMCP server tool calling
- Phase 72-90 integration workflows
- Autonomous fixing loops

## ACE Agent Architecture

### Core Components

```javascript
// scripts/phase76-ace-prompt-engineer.mjs
export class ACEAgent {
  constructor(config) {
    this.llmProvider = config.llmProvider || 'ollama';
    this.model = config.model || 'gemma3-legal:latest';
    this.knowledgeBase = config.knowledgeBase || 'knowledge_base';
    this.maxIterations = config.maxIterations || 3;
    this.toolRegistry = new Map();
  }

  async run(task) {
    let context = await this.buildInitialContext(task);

    for (let i = 0; i < this.maxIterations; i++) {
      // Generate next prompt based on context
      const prompt = await this.generateContextualPrompt(context);

      // Execute LLM with tool calling
      const response = await this.executeLLM(prompt);

      // Parse tool calls and execute
      const toolResults = await this.executeTools(response.toolCalls);

      // Update context with results
      context = this.updateContext(context, response, toolResults);

      // Check if task complete
      if (this.isTaskComplete(context)) {
        return context.result;
      }
    }

    return context.partialResult;
  }
}
```

### Knowledge Integration

```javascript
async buildInitialContext(task) {
  // 1. RAG search for relevant knowledge
  const embedding = await this.generateEmbedding(task.description);
  const knowledge = await this.searchKnowledge(embedding, {
    collection: this.knowledgeBase,
    topK: 5,
    scoreThreshold: 0.5
  });

  // 2. Load codebase context
  const codeContext = await this.loadCodeContext(task.files || []);

  // 3. Load error history
  const errorHistory = await this.loadErrorHistory(task.errorTypes || []);

  return {
    task,
    knowledge,
    codeContext,
    errorHistory,
    iteration: 0,
    toolCalls: [],
    results: []
  };
}
```

### Self-Prompting Loop

```javascript
async generateContextualPrompt(context) {
  const { task, knowledge, codeContext, iteration } = context;

  return `
# Autonomous Code Analysis - Iteration ${iteration + 1}/${this.maxIterations}

## Task
${task.description}

## Relevant Knowledge
${knowledge.map(k => `- ${k.payload.section}: ${k.payload.content.substring(0, 200)}...`).join('\n')}

## Code Context
${codeContext.files.map(f => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n')}

## Available Tools
${Array.from(this.toolRegistry.keys()).join(', ')}

## Previous Actions
${context.toolCalls.map(tc => `- ${tc.tool}: ${tc.status}`).join('\n')}

## Instructions
Analyze the code, use available tools to gather more context or make changes, and provide a structured response with tool calls.

Response format:
{
  "analysis": "Your analysis here",
  "toolCalls": [
    { "tool": "tool_name", "args": { ... } }
  ],
  "nextSteps": ["step 1", "step 2"],
  "confidence": 0-100
}
`;
}
```

## Gemma3-Legal Model Integration

### Model Configuration

```javascript
// Best practices for gemma3-legal:latest
const GEMMA3_CONFIG = {
  model: 'gemma3-legal:latest',

  // Temperature: Lower for code generation, higher for creative tasks
  temperature: 0.2,  // Code fixing
  // temperature: 0.7,  // Documentation generation

  // Top-p: Nucleus sampling (0.9 = consider top 90% probability mass)
  top_p: 0.9,

  // Top-k: Limit to top K tokens (40 good for code)
  top_k: 40,

  // Repetition penalty: Prevent repetitive output
  repeat_penalty: 1.1,

  // Context window: Gemma3 supports 8192 tokens
  num_ctx: 8192,

  // Stop sequences
  stop: ['</thinking>', '```\n\n', 'User:'],

  // Streaming for real-time feedback
  stream: false
};
```

### Prompt Engineering for Gemma3

```javascript
function buildGemma3Prompt(task, context) {
  return `<|im_start|>system
You are an expert TypeScript and SvelteKit developer. You specialize in:
- Svelte 5 reactive runes ($state, $derived, $effect)
- TypeScript 5.6 type system and generics
- SvelteKit API routes and server-side patterns
- Error analysis and automated code fixing

Your responses are precise, actionable, and follow best practices.
<|im_end|>

<|im_start|>user
${task.description}

## Context
${context.knowledge.map(k => `### ${k.payload.section}\n${k.payload.content}`).join('\n\n')}

## Code to Analyze
\`\`\`typescript
${context.code}
\`\`\`

## Requirements
1. Identify all issues
2. Provide working fix
3. Explain reasoning
4. Rate confidence (0-100)
<|im_end|>

<|im_start|>assistant
`;
}
```

### Response Parsing

```javascript
function parseGemma3Response(response) {
  // Gemma3 often wraps thinking in tags
  const thinkingMatch = response.match(/<thinking>([\s\S]*?)<\/thinking>/);
  const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;

  // Extract code blocks
  const codeBlocks = [];
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = codeRegex.exec(response)) !== null) {
    codeBlocks.push({
      language: match[1] || 'text',
      code: match[2].trim()
    });
  }

  // Extract JSON if present
  const jsonMatch = response.match(/```json\n([\s\S]*?)```/);
  const structured = jsonMatch ? JSON.parse(jsonMatch[1]) : null;

  return {
    thinking,
    codeBlocks,
    structured,
    rawResponse: response
  };
}
```

## FastMCP Tool Integration

### Tool Registry

```javascript
// scripts/phase76-acp-cli.mjs
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(name, schema, handler) {
    this.tools.set(name, { schema, handler });
  }

  async execute(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool not found: ${toolName}`);

    // Validate args against schema
    this.validate(args, tool.schema);

    // Execute with error handling
    try {
      return await tool.handler(args);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: toolName
      };
    }
  }
}

// Register knowledge base tools
toolRegistry.register('knowledge:search', {
  description: 'Semantic search in knowledge base',
  parameters: {
    query: { type: 'string', required: true },
    topK: { type: 'number', default: 5 },
    collection: { type: 'string', default: 'knowledge_base' }
  }
}, async (args) => {
  const embedding = await generateEmbedding(args.query);
  return await searchQdrant(args.collection, embedding, args.topK);
});

toolRegistry.register('llm:generate', {
  description: 'Generate text with LLM',
  parameters: {
    prompt: { type: 'string', required: true },
    provider: { type: 'string', default: 'ollama' },
    model: { type: 'string', default: 'gemma3-legal:latest' },
    maxTokens: { type: 'number', default: 2048 }
  }
}, async (args) => {
  return await callLLM(args.provider, args.prompt, {
    model: args.model,
    max_tokens: args.maxTokens
  });
});

toolRegistry.register('code:analyze', {
  description: 'Analyze TypeScript code with AST',
  parameters: {
    filePath: { type: 'string', required: true }
  }
}, async (args) => {
  const code = await fs.readFile(args.filePath, 'utf-8');
  return analyzeTypeScriptAST(code, args.filePath);
});
```

### Tool Calling Pattern

```javascript
async function executeWithTools(prompt, availableTools) {
  // 1. Initial LLM call
  const response = await callLLM('ollama', prompt, {
    model: 'gemma3-legal:latest',
    temperature: 0.2
  });

  // 2. Parse tool calls from response
  const parsed = parseGemma3Response(response);

  if (!parsed.structured?.toolCalls) {
    return { response, toolResults: [] };
  }

  // 3. Execute tools in parallel where possible
  const toolResults = await Promise.all(
    parsed.structured.toolCalls.map(async (call) => {
      try {
        const result = await toolRegistry.execute(call.tool, call.args);
        return { tool: call.tool, success: true, result };
      } catch (error) {
        return { tool: call.tool, success: false, error: error.message };
      }
    })
  );

  // 4. Follow-up prompt with tool results
  const followUpPrompt = `
${prompt}

## Tool Execution Results
${toolResults.map(r => `
### ${r.tool}
Status: ${r.success ? '✅ Success' : '❌ Failed'}
${r.success ? JSON.stringify(r.result, null, 2) : `Error: ${r.error}`}
`).join('\n')}

Based on these results, provide your final analysis and recommendations.
`;

  const finalResponse = await callLLM('ollama', followUpPrompt, {
    model: 'gemma3-legal:latest',
    temperature: 0.2
  });

  return { response: finalResponse, toolResults };
}
```

## Phase Integration Workflows

### Phase 72: RAG/KAG AST Integration

```javascript
// Knowledge base → Qdrant → AI recommendations
async function phase72Pipeline(knowledgeBasePath) {
  // 1. Load AST knowledge base
  const astKB = await loadJSON(knowledgeBasePath);

  // 2. Generate embeddings for each node
  const embeddings = await Promise.all(
    astKB.nodes.map(async (node) => {
      const text = `${node.type}: ${node.name}\n${node.documentation || ''}`;
      return await generateEmbedding(text);
    })
  );

  // 3. Upsert to Qdrant
  await qdrant.upsert('phase72_ast_knowledge_base', {
    points: astKB.nodes.map((node, i) => ({
      id: node.id,
      vector: embeddings[i],
      payload: {
        type: node.type,
        name: node.name,
        path: node.path,
        errors: node.errors || [],
        documentation: node.documentation
      }
    }))
  });

  // 4. Generate AI recommendations
  const highErrorNodes = astKB.nodes
    .filter(n => n.errors && n.errors.length > 5)
    .sort((a, b) => b.errors.length - a.errors.length);

  for (const node of highErrorNodes.slice(0, 10)) {
    const recommendation = await generateRecommendation(node);
    console.log(`\n## ${node.name}\n${recommendation}`);
  }
}
```

### Phase 76: Knowledge Builder & MCP Server

```javascript
// Crawl docs → Index → Serve via MCP
async function phase76KnowledgePipeline(urls) {
  // 1. Crawl documentation
  const docs = await crawlDocs(urls, {
    maxPages: 100,
    includePatterns: ['/docs/', '/api/', '/tutorial/']
  });

  // 2. Parse and chunk
  const chunks = [];
  for (const doc of docs) {
    const sections = parseMarkdownSections(doc.content);
    chunks.push(...sections.map(s => ({
      url: doc.url,
      title: doc.title,
      section: s.heading,
      content: s.content,
      doc_id: doc.id
    })));
  }

  // 3. Generate embeddings
  const embeddings = await Promise.all(
    chunks.map(c => generateEmbedding(`${c.section}\n${c.content}`))
  );

  // 4. Index to Qdrant
  await qdrant.upsert('knowledge_base', {
    points: chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      vector: embeddings[i],
      payload: chunk
    })),
    wait: true
  });

  // 5. Start MCP server
  startMCPServer({
    port: 3003,
    tools: ['knowledge:search', 'llm:generate', 'code:analyze']
  });
}
```

### Phase 79: Cognitive Engine

```javascript
// Autonomous error fixing with RAG knowledge
async function phase79CognitiveEngine(errorFiles) {
  for (const file of errorFiles) {
    console.log(`\n🔧 Processing ${file.path}...`);

    // 1. Analyze errors
    const errors = await analyzeErrors(file.path);

    // 2. Build context with RAG
    const errorContext = errors.map(e => e.message).join(' ');
    const embedding = await generateEmbedding(errorContext);
    const knowledge = await searchQdrant('knowledge_base', embedding, 5);

    // 3. Generate fix with knowledge context
    const prompt = `
Fix these TypeScript errors in ${file.path}:
${errors.map(e => `- Line ${e.line}: ${e.message}`).join('\n')}

## Relevant Knowledge
${knowledge.map(k => `### ${k.payload.section}\n${k.payload.content}`).join('\n\n')}

Provide a complete fixed version of the code.
`;

    const fix = await callLLM('ollama', prompt, {
      model: 'gemma3-legal:latest',
      temperature: 0.2
    });

    // 4. Apply fix and validate
    const fixedCode = extractCodeBlock(fix);
    await fs.writeFile(file.path, fixedCode);

    const newErrors = await analyzeErrors(file.path);
    console.log(`✅ Fixed ${errors.length - newErrors.length}/${errors.length} errors`);
  }
}
```

## Autonomous Fixing Loop

### Iterative Improvement

```javascript
async function autonomousFixingLoop(config) {
  const maxCycles = config.maxCycles || 5;
  let cycle = 0;
  let totalFixed = 0;

  while (cycle < maxCycles) {
    console.log(`\n🔄 Cycle ${cycle + 1}/${maxCycles}`);

    // 1. Discover errors
    const errors = await discoverErrors({
      tsConfigPath: config.tsConfigPath,
      includePatterns: config.includePatterns
    });

    if (errors.length === 0) {
      console.log('✅ No errors found. Exiting loop.');
      break;
    }

    console.log(`Found ${errors.length} errors`);

    // 2. Prioritize errors
    const prioritized = prioritizeErrors(errors, {
      strategy: 'high-impact-first', // or 'low-hanging-fruit'
      batchSize: config.batchSize || 10
    });

    // 3. Fix batch
    const batch = prioritized.slice(0, config.batchSize || 10);
    const fixResults = await fixErrorBatch(batch, {
      useRAG: true,
      validateAfter: true,
      rollbackOnFailure: true
    });

    // 4. Analyze results
    const fixed = fixResults.filter(r => r.success).length;
    totalFixed += fixed;

    console.log(`Fixed ${fixed}/${batch.length} errors`);

    // 5. Safety gate: stop if no progress
    if (fixed === 0) {
      console.log('⚠️ No progress made. Stopping to prevent infinite loop.');
      break;
    }

    cycle++;
  }

  return { cycles: cycle, totalFixed };
}
```

### Safety Gates

```javascript
class SafetyGate {
  constructor(config) {
    this.maxFileChanges = config.maxFileChanges || 50;
    this.maxErrorsIntroduced = config.maxErrorsIntroduced || 5;
    this.changedFiles = new Set();
    this.errorsBefore = null;
  }

  async beforeFix(filePath) {
    if (this.changedFiles.size >= this.maxFileChanges) {
      throw new Error(`Safety gate: reached max file changes (${this.maxFileChanges})`);
    }

    // Snapshot current errors
    this.errorsBefore = await analyzeErrors(filePath);
  }

  async afterFix(filePath) {
    const errorsAfter = await analyzeErrors(filePath);

    // Check if we introduced more errors
    const introduced = errorsAfter.length - this.errorsBefore.length;
    if (introduced > this.maxErrorsIntroduced) {
      // Rollback
      await git.restore(filePath);
      throw new Error(`Safety gate: introduced ${introduced} new errors in ${filePath}`);
    }

    this.changedFiles.add(filePath);
  }
}
```

## Best Practices

### 1. Context Window Management

```javascript
function truncateContext(context, maxTokens = 6000) {
  // Gemma3 supports 8192 tokens, leave 2192 for response

  // Priority: task > knowledge > code > history
  let budget = maxTokens;

  const truncated = {
    task: context.task, // Always include full task
    knowledge: [],
    code: [],
    history: []
  };

  budget -= estimateTokens(context.task);

  // Add knowledge until budget exhausted
  for (const k of context.knowledge) {
    const tokens = estimateTokens(k.content);
    if (budget - tokens < 0) break;
    truncated.knowledge.push(k);
    budget -= tokens;
  }

  // Add most relevant code snippets
  for (const c of context.code.slice(0, 3)) {
    const tokens = estimateTokens(c.content);
    if (budget - tokens < 0) break;
    truncated.code.push(c);
    budget -= tokens;
  }

  return truncated;
}
```

### 2. Error Recovery

```javascript
async function robustToolCall(toolName, args, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await toolRegistry.execute(toolName, args);
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      console.warn(`Tool ${toolName} failed (attempt ${i + 1}/${maxRetries}): ${error.message}`);

      // Exponential backoff
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

### 3. Validation Before Commit

```javascript
async function validateFix(filePath, fix) {
  // 1. Syntax check
  try {
    ts.createSourceFile(filePath, fix, ts.ScriptTarget.Latest, true);
  } catch (error) {
    return { valid: false, reason: 'Syntax error', error };
  }

  // 2. Type check
  const errors = await analyzeErrors(filePath, fix);
  if (errors.length > 0) {
    return { valid: false, reason: 'Type errors', errors };
  }

  // 3. Run tests if available
  const testResults = await runTests({ file: filePath });
  if (!testResults.success) {
    return { valid: false, reason: 'Test failures', testResults };
  }

  return { valid: true };
}
```

### 4. Knowledge Base Prioritization

```javascript
function rankKnowledge(results, task) {
  return results
    .map(r => ({
      ...r,
      relevanceScore: r.score,
      recencyScore: getRecencyScore(r.payload.updated_at),
      usageScore: r.payload.usage_count || 0,
      sourceScore: getSourceScore(r.payload.source) // official docs > blog > user content
    }))
    .map(r => ({
      ...r,
      finalScore:
        r.relevanceScore * 0.5 +
        r.recencyScore * 0.2 +
        r.usageScore * 0.2 +
        r.sourceScore * 0.1
    }))
    .sort((a, b) => b.finalScore - a.finalScore);
}
```

## Phase 86: RAG + KAG Autonomous Loop Integration

### Overview

Phase 86 combines RAG (Retrieval-Augmented Generation) and KAG (Knowledge-Augmented Generation) for fully autonomous error fixing:

```
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 86 AUTONOMOUS LOOP                           │
│                                                                  │
│  1. Pull Target (Postgres Priority Queue)                       │
│     SELECT * FROM ts_errors WHERE status='open'                │
│     ORDER BY impact_score DESC LIMIT 1                          │
│                                                                  │
│  2. Get Code Context (read_file ±60 lines)                      │
│     FastMCP: POST /function-call {name: "read_file", ...}      │
│                                                                  │
│  3. RAG Retrieval (Qdrant + pgvector)                           │
│     - Qdrant: Top 8 patterns from phase72_ast_knowledge_base   │
│     - pgvector: Similar errors via HNSW cosine similarity      │
│                                                                  │
│  4. KAG Expansion (knowledge_graph)                             │
│     - Query related fixes by file, error_code, pattern         │
│     - Expand context with graph relationships                   │
│                                                                  │
│  5. Apply Patch (write_file)                                    │
│     - Generate minimal fix via LLM                              │
│     - Apply with FastMCP write_file tool                        │
│                                                                  │
│  6. Verify (run_command: tsc --noEmit)                          │
│     - Check error count before/after                            │
│     - Rollback if worsened                                      │
│                                                                  │
│  7. Write Outcome (Postgres + KB)                               │
│     - Mark error fixed/unchanged/worsened                       │
│     - Ingest successful fix as new KB entry                     │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 86 Implementation

```javascript
// scripts/phase86-autonomous-loop.mjs
async function runLoop() {
  // 1. Check FastMCP server
  const healthRes = await fetch('http://127.0.0.1:3002/health');
  console.log("✅ FastMCP server ready");

  // 2. Get next error from priority queue
  const { rows } = await pool.query(`
    SELECT * FROM ts_errors
    WHERE status = 'open'
    ORDER BY impact_score DESC
    LIMIT 1
  `);

  if (rows.length === 0) {
    console.log("✅ No open errors. System healthy.");
    return;
  }

  const error = rows[0];
  console.log(`🎯 TARGET: [${error.error_code}] in ${error.file_path}`);

  // 3. RAG: Search knowledge base
  const { embedding } = await ollama.embeddings({
    model: 'embeddinggemma:latest',
    prompt: error.error_message
  });

  const hits = await qdrant.search('phase72_ast_knowledge_base', {
    vector: embedding,
    limit: 1,
    with_payload: true
  });

  // 4. Read file context
  const fileRes = await callAgent('read_file', { filepath: error.file_path });
  const fileContent = fileRes.content[0].text;

  // 5. Decide strategy based on confidence
  let fixStrategy;
  if (hits.length > 0 && hits[0].score > 0.85) {
    fixStrategy = hits[0].payload.fix_strategy;
    console.log(`💡 KNOWN PATTERN: ${hits[0].payload.pattern_name} (${hits[0].score})`);
  } else {
    fixStrategy = "Analyze the error and fix the TypeScript error.";
    console.log(`🤖 Using generic LLM fix (no confident match)`);
  }

  // 6. Generate fix
  const prompt = `
You are an expert TypeScript developer.
Fix this error: ${error.error_message}
File: ${error.file_path}
Strategy: ${fixStrategy}

\`\`\`typescript
${fileContent}
\`\`\`

Return ONLY the fixed code. No explanations.
`;

  const response = await ollama.chat({
    model: 'gemma3-legal:latest',
    messages: [{ role: 'user', content: prompt }],
    options: { temperature: 0.1 }
  });

  // 7. Apply fix
  const fixedContent = response.message.content
    .replace(/^```typescript\n/, '')
    .replace(/\n```$/, '');

  await callAgent('write_file', {
    filepath: error.file_path,
    content: fixedContent
  });

  // 8. Validate
  const valRes = await callAgent('run_command', {
    command: `npx tsc --noEmit ${error.file_path}`
  });

  console.log(`Validation: ${valRes.content[0].text}`);
}
```

### Confidence Gating

```javascript
// Decide action based on combined RAG + KAG + LLM scores
function decideAction(ragScore, kagScore, llmConfidence) {
  const combined = (ragScore * 0.4) + (kagScore * 0.3) + (llmConfidence * 0.3);

  if (combined >= 0.85) {
    return { action: 'AUTO_APPLY', reason: 'High confidence match' };
  } else if (combined >= 0.70) {
    return { action: 'SUGGEST', reason: 'Medium confidence, needs review' };
  } else if (combined >= 0.50) {
    return { action: 'WEB_SEARCH', reason: 'Low confidence, fetch docs' };
  } else {
    return { action: 'SKIP', reason: 'No confident match' };
  }
}
```

### Token Accounting for ACE Leaderboard

```javascript
// Log every LLM call for competitive analysis
const logEntry = {
  kind: "llm_call",
  timestamp: new Date().toISOString(),
  provider: "gemini" | "ollama" | "claude",
  model: "gemma3-legal:latest",
  phase: "phase86",
  cycle: 1,

  // Token metrics
  tokens_in: 1024,
  tokens_out: 512,
  total_tokens: 1536,

  // Fix metrics
  error_code: "TS1005",
  file_path: "src/lib/cache/gpu-leftover-cache.ts",
  confidence: 0.92,
  strategy: "missing-comma",

  // Efficiency
  errors_fixed: 1,
  efficiency: 0.65  // errors_fixed / total_tokens * 1000
};
```

### Pattern Recognition (TS1005, TS1128, TS1109)

```javascript
// Deterministic pattern labels (replaces "undefined" patterns)
const PATTERN_RULES = {
  TS1005: [
    { regex: /import\s*{\s*\w+\s+\w+/, label: 'missing-comma-import' },
    { regex: /class.*{\s*\w+:\s*\w+\s+\w+/, label: 'missing-comma-class' },
    { regex: /;\s*from\s*'/, label: 'missing-semicolon-import' }
  ],
  TS1128: [
    { regex: /}\s*{/, label: 'glued-blocks' },
    { regex: /const.*=.*const/, label: 'missing-semicolon-decl' }
  ],
  TS1109: [
    { regex: /\/[^/\n]*\n/, label: 'unterminated-regex' },
    { regex: /=\s*\n/, label: 'trailing-assignment' }
  ]
};

function detectPattern(errorCode, fileContent) {
  const rules = PATTERN_RULES[errorCode] || [];
  for (const { regex, label } of rules) {
    if (regex.test(fileContent)) {
      return label;
    }
  }
  return 'unknown';
}
```

## Monitoring and Metrics

```javascript
class AgentMetrics {
  constructor() {
    this.runs = [];
  }

  recordRun(run) {
    this.runs.push({
      timestamp: Date.now(),
      task: run.task,
      iterations: run.iterations,
      toolCalls: run.toolCalls.length,
      success: run.success,
      duration: run.duration,
      errorsFixed: run.errorsFixed,
      errorsRemaining: run.errorsRemaining
    });
  }

  getStats() {
    return {
      totalRuns: this.runs.length,
      successRate: (this.runs.filter(r => r.success).length / this.runs.length * 100).toFixed(2),
      avgIterations: (this.runs.reduce((sum, r) => sum + r.iterations, 0) / this.runs.length).toFixed(2),
      avgDuration: (this.runs.reduce((sum, r) => sum + r.duration, 0) / this.runs.length).toFixed(2),
      totalErrorsFixed: this.runs.reduce((sum, r) => sum + r.errorsFixed, 0)
    };
  }
}
```
