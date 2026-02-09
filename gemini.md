# Phase 72 – Gemini / FastMCP Agent

## 🚀 Phase 107 Svelte 5 Hardening (January 19, 2026)

### Session Summary
- **Dev Server**: Running at http://localhost:5175
- **Vite**: v6.4.1 with UnoCSS Inspector
- **Mass Syntax Repair**: 3,392 files fixed

### Svelte 5 Runes Verified
```svelte
// Props
let { caseId, onClose }: Props = $props();

// State
let messages = $state<Message[]>([]);
let isLoading = $state(false);

// Effects
$effect(() => {
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
});
```

### Tech Stack Confirmed Working
| Component | Version | Status |
|-----------|---------|--------|
| SvelteKit | 2.x | ✅ |
| Svelte | 5.x | ✅ Runes |
| Drizzle ORM | 0.44 | ✅ |
| bits-ui | v1/v2 | ✅ Svelte 5 |
| XState | v5 | ✅ |
| UnoCSS | Latest | ✅ |
| IndexedDB + LokiJS | Client cache | ✅ |
| PostgreSQL + pgvector | Vector DB | ✅ |
| Qdrant | Auto-tagged | ✅ |
| Redis | Cache | ✅ |
| RabbitMQ | Queue | ✅ |

### Critical Learnings
1. **Cascade Effect**: Deleting corrupted files can reveal 70k+ hidden errors
2. **Safe Fix Patterns**: `{, prop:` → `{ prop:` and `a;, b;` → `a; b;`
3. **Revert Strategy**: Keep git checkpoints before mass repairs
4. **Full Rewrites**: Files with >200 errors should be completely rewritten

### bits-ui v2 → Svelte 5 Migration Guide (January 2026)

**Key API Changes:**
| bits-ui v0.x (Svelte 4) | bits-ui v1.x (Svelte 5) |
|-------------------------|-------------------------|
| `el` prop | `ref` prop |
| `asChild` prop | `child` snippet |
| `let:` directives | `children` or `child` snippet props |
| `transition` props | Svelte transitions + `child` + `forceMount` |
| `<slot>` | `{@render children()}` |

**Component Patterns:**
```svelte
<!-- bits-ui v1.x with Svelte 5 -->
<script lang="ts">
  import { Button } from 'bits-ui';

  // Svelte 5 runes
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<Button.Root onclick={() => count++}>
  Count: {count} (doubled: {doubled})
</Button.Root>
```

**Migration Steps:**
1. Update bits-ui: `npm install bits-ui@latest`
2. Replace `el` → `ref` in all component usages
3. Convert `asChild` to `child` snippets
4. Replace `<slot>` with `{@render children()}`
5. Use Svelte 5 event handlers: `onclick` not `on:click`

**shadcn-svelte Replacement:**
- bits-ui v1.x is now the foundation (not shadcn-svelte)
- Use raw bits-ui components with custom styling
- melt-ui is alternative headless option

---


## 🛡️ Phase 107.1 - Smart Validation Strategy (January 19, 2026)

### The Problem: Error Cascades
BLINDLY fixing syntax errors (e.g., adding missing commas) in deeply corrupted files often **increases** the error count because the parser then proceeds to find semantic errors that were previously masked by the syntax crash.

### The Solution: Validation Loop
We now use `scripts/smart-file-fixer.cjs` which employs a "Try-Verify-Revert" strategy:
1. **Try**: Apply specific pattern fixes (`;,` -> `;`, `prop, val` -> `prop: val`)
2. **Verify**: Run `tsc --noEmit` locally
3. **Revert**: If error count INCREASES, revert the file immediately

### Current Progress
- **Error Count**: 29,375 (Baseline before recent fixes)
- **Top Fixed Files** (Manual Rewrites):
  - `som-webgpu-cache.ts`: ✅ Fully Fixed (-197 errors)
  - `sveltekit-gpu-cache-integration.ts`: ✅ Fully Fixed (-232 errors)
  - `rag-pipeline-enhanced.ts`: ✅ Fully Fixed (-224 errors)
  - `simd-markdown-parser.ts`: ✅ Fully Fixed (-192 errors)
  - `design-system.ts`: ✅ Fully Fixed (-186 errors)
  - `law-mapping.ts`: ✅ Fully Fixed (-179 errors)
  - `ingestion-workflow-machine.ts`: ✅ Fully Fixed (-171 errors)
  - `message-queue.ts`: ✅ Fully Fixed (-168 errors)
  - `ai-service.ts`: ✅ Fully Fixed (-166 errors)
  - `knowledge-base.ts`: ✅ Fully Fixed (-142 errors)
  - `elasticsearch-search.ts`: ✅ Fully Fixed (-134 errors)
  - `minio-service.ts`: ✅ Fully Fixed (-132 errors)
  - `case-link.service.ts`: ✅ Fully Fixed (-125 errors)
  - `gemma3-vlm-embedder.ts`: ✅ Fully Fixed (-124 errors)
  - `evidenceProcessingMachine.ts`: ✅ Fully Fixed (-123 errors)
  - `src/lib/server/integrations/minio.ts`: ✅ Refactored & Typed (-123 errors)

## 🛡️ Phase 107.2 - WebGPU & UI Hardening (January 31, 2026)

### Major Corrupted Files Repaired
Systematic regeneration of files with severe syntax corruption (comma/semicolon mixups, one-liner collapse):

**Services & WebGPU Engines:**
- `ai-evidence-analyzer.ts`: ✅ Regenerated (Was ~480 errors)
- `webgpu-evidence-graph.ts`: ✅ Regenerated
- `legal-document-graph.ts`: ✅ Regenerated
- `dimensional-tensor-store.ts`: ✅ Regenerated
- `webgpu-similarity-engine.ts`: ✅ Regenerated

**Critical UI Components:**
- `ProductionLayout.svelte`: ✅ Full rewrite (Svelte 5 + bits-ui)
- `LegalCaseForm.svelte`: ✅ Fixed CSS corruption & derived state
- `CanvasBoard.svelte`: ✅ Fixed types & reactivity
- `AuthGuard.svelte`: ✅ Fixed CSS
- `StatsCard.svelte`, `Textarea.svelte`, `ErrorPanel.svelte`: ✅ Expanded from one-liners
- `Svelte5Alert.svelte`: ✅ Fixed syntax redundancy

### Next Steps
1. Re-run `svelte-check` to establish new baseline (Expect < 28k)
2. Address remaining red components in `src/lib/components/ui`
3. Verify WebGPU initialization in browser

### Next Actions
1. Run automated validation loop on mid-tier error files (`smart-file-fixer`)
2. Verify Drizzle schema integrity
3. Consolidate duplicate MinIO services (Phase 3)

---


## 🔍 Phase 2 Verification (Target: ~10k Errors)
**Goal:** Reduce error count to stable 10k baseline before major feature work.

### Fix Strategy
1. **Smart Validation Loop**: `smart-file-fixer.cjs` for all syntax repairs
2. **Manual Rewrites**: Logic-heavy files (`simd-json-parser.ts`, `minio-service.ts`)
3. **Import Cleanup**: `scripts/fix-import-corruption.cjs` (0 issues found so far)

### Environment Setup
- **Python Middleware**: RAG + KAG + DAG (FastMCP Phase ACE)
- **AI Models**:
  - `gemma3-legal:latest` (Ollama Endpoint)
  - `embeddinggemma:latest` (Vector Embeddings)
  - `ibmdocling-258m` (Image Analysis / VLM)
- **Go Microservice**: SIMD JSON parser service at `http://localhost:8097/json`
- **GPU Inference**: RTX 3060 Ti + Triton Inference (PTX)

### Task 2.5: Phase 2 Verification Plan
- [ ] Run `npm run check` baseline
- [ ] Verify `simd-json-parser.ts` functionality
- [ ] Test Python middleware connectivity
- [ ] Update `copilot.md`, `gemini.md`, `claude.md` with findings

---

## 🔧 Phase 103.1 ACE Error Fixing (January 16, 2026)

### Current Status
- **TSC Errors**: 20,385 (down from 21,432)
- **Reduction**: -1,047 (-4.9%)

### Key Learnings

**✅ SAFE Patterns (Apply Automatically):**
| Pattern | Example | Fixes |
|---------|---------|-------|
| `index_signature` | `[key, string]` → `[key: string]` | ~10 |
| `interface_property` | `prop, Type;` → `prop: Type;` | ~10 |
| `loop_corruption` | `let: any i = 0` → `let i = 0` | ~5 |

**⚠️ UNSAFE Patterns (Causes Regressions):**
| Pattern | Example | Impact |
|---------|---------|--------|
| `constructor_colon_to_comma` | `new Class(a: b)` → `new Class(a, b)` | +194 errors |

### Full File Rewrites (Most Effective)
Files with >200 errors should be completely rewritten. Each rewrite removes 300-400 errors.

**Fixed This Session:**
- `legal-ai-integration.ts` - 358 errors ✅
- `change-detection-service.ts` - 358 errors ✅
- `minio-service.ts` - 330 errors ✅

### Scripts Available
```bash
node scripts/phase103.1-ace-autofix.mjs           # Dry-run
node scripts/phase103.1-ace-autofix.mjs --apply --max=100
```

### References
- See `documents/TYPE_FIXING_STRATEGY.md` for full strategy
- See `documents/TOP_100_ERROR_FILES.md` for prioritized file list

---

## 🎯 Phase 67-68 Error Reduction (January 11, 2026)

### Massive Error Reduction Results
- **Starting:** 150,925 errors
- **After Phase 67-68:** ~89,000 errors
- **Reduction:** -61,000 errors (**-41%**)

### Effective Fixer Scripts Created
| Script | Purpose | Files Fixed |
|--------|---------|-------------|
| `fix-syntax-corruption.mjs` | Phantom commas `{, ` | 2,080 |
| `fix-syntax-patterns.mjs` | Colon-in-generics, `??` | 2,038 |
| `fix-missing-imports-enhanced.ts` | Auto-import Node.js/Svelte | 50+ |
| `fix-implicit-any.ts` | Add `: any` to params | 354 |

### Error Distribution Analysis (89k remaining)
```
',' expected: 26,414 (30%)  → Syntax corruption
Cannot find name: 18,741 (21%) → Missing imports
Declaration expected: 4,953 (5%) → Broken braces
Type refers to...: 3,330 (4%) → import type misuse
Property missing: 3,065 (3%) → Interface mismatch
```

### 2025 Best Practices Applied

**TypeScript 5.7:**
- Enhanced variable initialization checks
- Path rewriting for relative imports
- ES2024 target support (`Object.groupBy`, `Promise.withResolvers`)
- V8 compile caching for faster `tsc`

**ts-morph 27.x:**
- TypeScript 5.9 support
- `findReferencesAsNodes()` for safe refactoring
- `setType()` for adding type annotations
- `addImportDeclaration()` for auto-imports

---

## 🐰 RabbitMQ 4.0 Streaming (January 2026)

### Quorum Queues (Recommended for HA)
```typescript
// npm install rabbitmq-stream-js-client amqplib
import { connect } from 'rabbitmq-stream-js-client';

const client = await connect({
  hostname: 'localhost',
  port: 5552,
  username: 'guest',
  password: 'guest',
  vhost: '/'
});

// Create stream
await client.createStream({ stream: 'legal-documents' });

// Producer
const producer = await client.declarePublisher({
  stream: 'legal-documents',
  publisherRef: 'legal-ai-producer'
});

await producer.send(Buffer.from(JSON.stringify({ docId: '123', content: '...' })));
```

### Best Practices
| Practice | Description |
|----------|-------------|
| **Multi-node cluster** | 3, 5, or 7 nodes for Raft consensus |
| **Dead-letter exchange** | Configure DLX for messages exceeding 20 retries |
| **Retention policy** | Set `max-length` or TTL to prevent buildup |
| **Queue length** | Keep queues short for optimal RAM usage |

### Stream vs Queue
- **Streams**: Append-only logs, non-destructive reads, replayable
- **Quorum Queues**: Traditional queue semantics with HA

---

## 📄 LangChain.js Document Chunking (2025)

### Chunking Strategies Comparison
| Strategy | Best For | Accuracy | Speed |
|----------|----------|----------|-------|
| **Semantic** | Knowledge bases | 70% better | Slower |
| **Recursive Character** | General RAG | Balanced | Fast |
| **Token-based** | Cost optimization | Good | Fastest |

### Optimal Parameters
```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,      // Sweet spot: 256-512 tokens
  chunkOverlap: 50,    // 10-20% overlap
  separators: ['\n\n', '\n', '. ', ' ', '']
});

const chunks = await splitter.splitText(legalDocument);
```

### Streaming with SSE
```typescript
// Server-Sent Events for real-time updates
import { JsonOutputParser } from '@langchain/core/output_parsers';

const parser = new JsonOutputParser();
const stream = await chain.stream({ input: query });

for await (const chunk of stream) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```

---

## Environment Assumptions

## FastMCP Tools Relevant to Phase72

### Tool: `phase72.run_gpu_pipeline`
**Shell command:**
```bash
npm run phase72:gpu:pipeline
```

**Required env:**
```json
{
  "env": {
    "PHASE72_PYTHON": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe"
  }
}
```

**What it does:**
1. Runs `svelte-check` to collect TypeScript errors
2. Calls Python GPU vectorizer (`phase72_gpu_vectorizer.py`)
3. Exports 8D embeddings to `svelte-check-vectors.json`
4. Ready for WebGPU clustering

**Expected output:**
```json
{
  "status": "success",
  "errorCount": 12000,
  "vectors": 12000,
  "device": "cuda:0",
  "latency_ms": 1500
}
```

## TypeScript AST Fixing - Critical Learnings (Phase 90-91)

### Cascade Error Pattern Recognition

**Discovery Date:** January 8, 2026
**Context:** Phase 90 Enhanced AST Fixer + Phase 91 Auto-Rollback

#### The Problem: TS1005 Diagnostic Position Semantics

**Critical Discovery:** When TypeScript reports `TS1005: ',' expected` at position X:
- **Position X points to the NEXT token** (where parser expected comma)
- **The FIX must go AFTER the PREVIOUS token** (not before current token)

**Example:**
```typescript
// Error: TS1005 at position 34 (points to 'arg2')
const result = foo(
    arg1
    arg2  // ← Error position here
)

// WRONG FIX (prepend before current):
const result = foo(
    arg1
    ,arg2  // ← Creates invalid syntax
)

// CORRECT FIX (append after previous):
const result = foo(
    arg1,  // ← Comma goes here
    arg2
)
```

#### Root Cause vs Symptom Errors

**Cascade Error Pattern:**
```typescript
// ROOT CAUSE: Wrong delimiter (semicolon instead of comma)
const cache: ThreadSafeCache = {
  mutex: new AsyncMutex(); // ← WRONG: semicolon
  data: new Map();          // ← Parser confused, reports "comma expected"
  gpuAccelerated: true,
}
```

**Why Blind Fixing Fails:**
1. Parser encounters semicolon in object literal
2. Parser gets confused and enters "error recovery mode"
3. Parser reports SYMPTOM errors ("comma expected") on FOLLOWING tokens
4. Automated fixer inserts commas at wrong positions
5. File now has BOTH original errors AND new syntax errors
6. Result: Error count INCREASES instead of decreasing

#### Safe AST Fixing Heuristics

**Rule 1: Skip Files with High Error Density**
```javascript
// If file has > 50 errors per 100 lines, manual review required
const errorDensity = syntaxErrors / (totalLines / 100);
if (errorDensity > 50) {
  console.log('⚠️  File needs manual review (cascade errors likely)');
  return { action: 'skip', reason: 'error_density_too_high' };
}
```

**Rule 2: Validate Contextual Safety**
```javascript
// Before inserting comma, check:
// 1. Is there already a comma?
// 2. Is the parent node valid for comma insertion?
// 3. Are we in error recovery mode?
function isSafeToInsertComma(node, prevNode, sourceFile) {
  // Check for existing comma
  const textBetween = sourceFile.text.substring(prevNode.end, node.getStart());
  if (textBetween.includes(',')) return false;

  // Check parent node type
  const parent = node.parent;
  if (!ts.isObjectLiteralExpression(parent) &&
      !ts.isArrayLiteralExpression(parent) &&
      !ts.isCallExpression(parent)) {
    return false;
  }

  // Check if we're in error recovery
  const nearbyErrors = diagnostics.filter(d =>
    Math.abs(d.start - prevNode.end) < 100
  );
  if (nearbyErrors.length > 3) return false; // Too many nearby errors = cascade

  return true;
}
```

**Rule 3: Node Position API Precision**
```javascript
// TypeScript Node Position API:
// - node.pos: Start of leading trivia (whitespace, comments)
// - node.getStart(sourceFile): Start of actual token (excludes trivia)
// - node.end: End of actual token

// WRONG: Includes whitespace
position: node.pos

// WRONG: Before current token
position: node.getStart(sourceFile)

// CORRECT: After previous token
position: prevNode.end
```

#### Phase 91 Auto-Rollback Strategy

**Validation Gates:**
1. **Syntax Check:** Compare parse diagnostic count before/after
2. **Type Check:** Run full type checking (if syntax improved)
3. **Auto-Rollback:** If ANY regression, restore from backup

**Rollback Conditions:**
```javascript
if (errorsAfter.syntax > errorsBefore.syntax) {
  console.log('⚠️  Regression detected, rolling back');
  fs.writeFileSync(filePath, backupContent);
  return { status: 'rolled_back', reason: 'syntax_regression' };
}
```

#### Recommended Action for Cascade Errors

**Instead of automated fixing:**
1. Export error clusters to JSON
2. Visualize in AST Topology Explorer (http://localhost:5175/ast-topology)
3. Human reviews root causes
4. Apply targeted manual fixes
5. Re-run Phase 91 validation

**Detection Script:**
```bash
# Detect files with cascade error patterns
node scripts/phase90-detect-cascade-errors.mjs

# Output:
# {
#   "cognitive-cache-integration.ts": {
#     "errorDensity": 125,  // errors per 100 lines
#     "cascadeRisk": "HIGH",
#     "rootCauses": [
#       { "line": 84, "pattern": "semicolon_in_object_literal" },
#       { "line": 93, "pattern": "paren_instead_of_comma" }
#     ]
#   }
# }
```

### References

- **TypeScript Compiler API:** https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- **Parser Recovery:** https://github.com/microsoft/TypeScript/blob/main/src/compiler/parser.ts#L1234
- **Phase 90 Script:** `scripts/phase90-enhanced-ast-fixer.mjs`
- **Phase 91 Script:** `scripts/phase91-test-run.mjs`
- **Test Harness:** `scripts/test-ts1005.mjs`

---

### Tool: `phase72.run_auto_iterate`
**Shell command:**
```bash
npm run phase72:auto-iterate
```

**Required env:**
```json
{
  "env": {
    "PHASE72_PYTHON": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe"
  }
}
```

**What it does:**
1. 3-cycle automation: svelte-check → vectorize → cluster → ACE fixes
2. Progress bars with time estimates (~40 min total)
3. Logs to `logs/phase72/phase72-*.jsonl`

**Expected output:**
```
┌─────────────────────────────────────────────────┐
│ Phase 72: 3-Cycle Error Reduction               │
│ ████████████████████████████ 100% | Complete    │
│ Errors: 12000 → 1200 (~90% reduction)           │
└─────────────────────────────────────────────────┘
```

---

### Tool: `phase72.query_logs`
**Shell command:**
```bash
cat logs/phase72/*.jsonl | jq 'select(.provider == "gemini")'
```

**What it does:**
- Query Phase 72 execution logs
- Filter by provider, phase, step, or metrics
- Analyze error reduction trends

**Example queries:**

```bash
# Get last 10 Gemini LLM calls
cat logs/phase72/*.jsonl | jq 'select(.kind == "llm_call" and .provider == "gemini") | {model, tokens_in, tokens_out, errors_fixed}' | tail -10

# Calculate total tokens spent by Gemini
cat logs/phase72/*.jsonl | jq 'select(.provider == "gemini") | .tokens_in + .tokens_out' | jq -s 'add'

# Error count timeline
cat logs/phase72/*.jsonl | jq 'select(.step == "vectorize_gpu") | {ts, errorCount: .metrics.errorCount}'
```

## Logging / Token Accounting

When Gemini calls Phase72 tools, it MUST:

### 1. Include `caller` in payload
```json
{
  "kind": "llm_call",
  "provider": "gemini",
  "caller": "gemini",
  "model": "gemini-2.0-flash-exp"
}
```

### 2. Record token usage
```json
{
  "tokens_in": 1024,
  "tokens_out": 512,
  "total_tokens": 1536,
  "prompt_tokens": 1024,
  "completion_tokens": 512
}
```

### 3. Track error reduction
```json
{
  "errors_before": 12000,
  "errors_after": 11850,
  "errors_fixed": 150,
  "fix_success_rate": 0.95
}
```

## ACE/ACA Integration

**What ACE orchestrator tracks:**

| Metric | Description |
|--------|-------------|
| `provider` | Which AI (gemini, claude, copilot, local-gemma3) |
| `model` | Specific model used (e.g., `gemini-2.0-flash-exp`) |
| `tokens_per_1k_errors` | Token efficiency metric |
| `errors_fixed_per_second` | Speed metric |
| `fix_success_rate` | Quality metric (0.0 - 1.0) |

**Gemini competes on:**
- **Token efficiency:** Min tokens for max error reduction
- **Speed:** Fastest time to complete 3 cycles
- **Quality:** Highest fix success rate (no new errors introduced)

**ACE scoreboard example:**
```json
{
  "phase": "phase72",
  "cycle": 2,
  "leaderboard": [
    {
      "provider": "gemini",
      "model": "gemini-2.0-flash-exp",
      "errors_fixed": 6000,
      "tokens_spent": 150000,
      "efficiency": 40.0,
      "rank": 1
    },
    {
      "provider": "claude",
      "model": "claude-3-5-sonnet",
      "errors_fixed": 5800,
      "tokens_spent": 180000,
      "efficiency": 32.2,
      "rank": 2
    }
  ]
}
```

## Usage Examples

### Call Phase 72 from Gemini agent

```python
# FastMCP tool invocation
result = await mcp_client.call_tool(
    "phase72.run_auto_iterate",
    env={
        "PHASE72_PYTHON": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe"
    },
    metadata={
        "provider": "gemini",
        "model": "gemini-2.0-flash-exp",
        "caller": "gemini-agent-001"
    }
)

# Log the call
await phase72_logger.log_llm_call(
    provider="gemini",
    model="gemini-2.0-flash-exp",
    tokens_in=result.prompt_tokens,
    tokens_out=result.completion_tokens,
    errors_fixed=result.errors_fixed
)
```

### Query Gemini-specific performance

```bash
# Total errors fixed by Gemini
cat logs/phase72/*.jsonl | jq 'select(.provider == "gemini") | .errors_fixed' | jq -s 'add'

# Average token efficiency
cat logs/phase72/*.jsonl | jq 'select(.provider == "gemini") | (.errors_fixed / (.tokens_in + .tokens_out)) * 1000' | jq -s 'add / length'

# Success rate
cat logs/phase72/*.jsonl | jq 'select(.provider == "gemini") | .fix_success_rate' | jq -s 'add / length'
```

## Gemini Best Practices

### ✅ DO:
- **Set `PHASE72_PYTHON`** in all tool calls
- **Log every LLM call** with `provider: "gemini"`
- **Track token usage** (prompt + completion)
- **Report errors fixed** per call
- **Compete on efficiency** (errors per token)

### ❌ DON'T:
- Skip env var setup (will fail on GPU vectorization)
- Use global Python (may lack PyTorch/CUDA)
- Omit logging (breaks ACE scoreboard)
- Fix random errors (target largest clusters first)

## Troubleshooting

### Problem: `Python not found` error
**Solution:** Verify `PHASE72_PYTHON` env var is set:
```bash
echo $PHASE72_PYTHON
# Should output: C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe
```

### Problem: GPU vectorizer falls back to CPU
**Solution:** Check PyTorch CUDA:
```bash
$PHASE72_PYTHON -c "import torch; print('CUDA:', torch.cuda.is_available())"
# Should output: CUDA: True
```

### Problem: Logs not updating
**Solution:** Check log directory exists:
```bash
mkdir -p sveltekit-frontend/logs/phase72
ls sveltekit-frontend/logs/phase72/
```

### Problem: Token accounting missing
**Solution:** Ensure Gemini agent includes token fields:
```json
{
  "kind": "llm_call",
  "provider": "gemini",
  "tokens_in": 1024,
  "tokens_out": 512
}
```

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Total time** | < 40 min | 3 cycles with progress bars |
| **Error reduction** | ~90% | 12k → ~1.2k errors |
| **GPU vectorization** | < 2s per 10k errors | PyTorch CUDA |
| **Clustering** | < 5s per cycle | WebGPU SOM |
| **Token efficiency** | > 30 errors/1k tokens | Gemini competitive advantage |

## Integration Checklist

Before deploying Gemini agent with Phase 72:

- [ ] Set `PHASE72_PYTHON` env var
- [ ] Verify PyTorch CUDA support (`torch.cuda.is_available()`)
- [ ] Test GPU vectorizer: `npm run phase72:gpu:pipeline`
- [ ] Confirm logs appear in `logs/phase72/*.jsonl`
- [ ] Add `provider: "gemini"` to all LLM calls

---

# Gemini - Legacy Context - Phase 72 AST Error Reduction + CUDA Acceleration

## 🚀 Docker Build & Run for WSL Linux

### Build in WSL

```bash
# Navigate to workspace
cd /mnt/c/path/to/legal-ai

# Build CUDA Docker image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Build with no cache
docker build -f docker/Dockerfile.cuda --no-cache -t legal-ai-gpu:latest .

# Build with progress
docker build -f docker/Dockerfile.cuda --progress=plain -t legal-ai-gpu:latest .

# Build with specific tag
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:v1.0 -t legal-ai-gpu:latest .
```

### Run Container

```bash
# Basic run with GPU
docker run --gpus all -p 8000:8000 legal-ai-gpu:latest

# Run with all services exposed
docker run --gpus all \
  -p 8000:8000 \
  -p 5174:5174 \
  -p 6333:6333 \
  -p 7687:7687 \
  -p 6379:6379 \
  -p 5432:5432 \
  -p 9000:9000 \
  -p 5672:5672 \
  legal-ai-gpu:latest

# Run with volume mounts
docker run --gpus all \
  -p 8000:8000 \
  -v $(pwd)/backend:/app/backend \
  -v $(pwd)/sveltekit-frontend:/app/frontend \
  -v $(pwd)/phase72-ast-reduction:/app/phase72-ast-reduction \
  legal-ai-gpu:latest

# Run with environment variables
docker run --gpus all \
  -p 8000:8000 \
  -e CUDA_VISIBLE_DEVICES=0 \
  -e PYTHONUNBUFFERED=1 \
  -e NEO4J_URI=bolt://localhost:7687 \
  -e OLLAMA_URL=http://localhost:11434 \
  -e QDRANT_URL=http://localhost:6333 \
  -e REDIS_URL=redis://localhost:6379 \
  -e PHASE72_MAX_ITERATIONS=10 \
  legal-ai-gpu:latest

# Run in background with name
docker run -d --gpus all \
  -p 8000:8000 \
  --name legal-ai-gpu \
  --restart unless-stopped \
  legal-ai-gpu:latest

# Run with custom working directory
docker run --gpus all \
  -p 8000:8000 \
  -w /app \
  -v $(pwd):/app \
  legal-ai-gpu:latest

# Run with interactive terminal
docker run -it --gpus all \
  -p 8000:8000 \
  legal-ai-gpu:latest /bin/bash

# Run with resource limits
docker run --gpus all \
  -p 8000:8000 \
  -m 8g \
  --cpus 4 \
  legal-ai-gpu:latest
```

### Docker Compose (Preserved)

```bash
# Start GPU stack (new)
docker-compose -f docker/docker-compose.gpu.yml up -d

# Start existing stack (unchanged)
docker-compose -f docker/docker-compose.yml up -d

# Start both stacks together
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.gpu.yml up -d

# View logs
docker-compose -f docker/docker-compose.gpu.yml logs -f

# View specific service logs
docker-compose -f docker/docker-compose.gpu.yml logs -f legal-ai-gpu

# Stop stack
docker-compose -f docker/docker-compose.gpu.yml down

# Stop with volume cleanup
docker-compose -f docker/docker-compose.gpu.yml down -v

# Rebuild services
docker-compose -f docker/docker-compose.gpu.yml build

# Rebuild without cache
docker-compose -f docker/docker-compose.gpu.yml build --no-cache

# Rebuild specific service
docker-compose -f docker/docker-compose.gpu.yml build --no-cache legal-ai-gpu

# Scale services
docker-compose -f docker/docker-compose.gpu.yml up -d --scale legal-ai-gpu=2

# Pull latest images
docker-compose -f docker/docker-compose.gpu.yml pull

# Update and restart
docker-compose -f docker/docker-compose.gpu.yml pull
docker-compose -f docker/docker-compose.gpu.yml up -d
```

---

## ⚡ CUDA Acceleration

### 4-Phase Speedup

| Phase | Component | Current | GPU | Speedup | Week |
|-------|-----------|---------|-----|---------|------|
| A | Tokenization | 100ms | 20ms | 5x | 1 |
| B | Embedding | 500ms | 50ms | 10x | 2 |
| C | Vector Search | 100ms | 30ms | 3x | 3 |
| D | Reranking | 50ms | 6ms | 8x | 4 |
| **Total** | **Pipeline** | **750ms** | **106ms** | **7x** | **4 weeks** |

### Build CUDA Components

```bash
# Configure CMake
cmake -B build -DCMAKE_BUILD_TYPE=Release \
                -DCUDA_ARCHITECTURES=86 \
                -DCUTLASS_DIR=/opt/cutlass

# Build all targets
cmake --build build --parallel 8

# Install
cmake --install build

# Run benchmarks
./build/benchmark_tokenizer --batch-size 32 --iterations 100
./build/benchmark_embedding --batch-size 32 --iterations 100
./build/benchmark_search --num-candidates 1000 --iterations 100
./build/benchmark_reranker --batch-size 32 --iterations 100
```

### Docker Build with CUDA

```bash
# Build CUDA image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:cuda12 .

# Run with GPU
docker run --gpus all -p 8000:8000 legal-ai-gpu:cuda12

# Run with CUDA debugging
docker run --gpus all \
  -p 8000:8000 \
  -e CUDA_LAUNCH_BLOCKING=1 \
  legal-ai-gpu:cuda12
```

---

## 🔧 Configuration

### Environment Variables

```bash
# CUDA Configuration
export CUDA_VISIBLE_DEVICES=0
export CUDA_LAUNCH_BLOCKING=0
export CUDA_DEVICE_ORDER=PCI_BUS_ID

# Phase 72 Configuration
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
export OLLAMA_URL=http://localhost:11434
export QDRANT_URL=http://localhost:6333
export REDIS_URL=redis://localhost:6379
export PHASE72_MAX_ITERATIONS=10
export PHASE72_MIN_IMPROVEMENT=0.05
```

### Docker Environment File

```bash
# Create environment file
cat > .env.docker << 'EOF'
CUDA_VISIBLE_DEVICES=0
PYTHONUNBUFFERED=1
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
OLLAMA_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
PHASE72_MAX_ITERATIONS=10
PHASE72_MIN_IMPROVEMENT=0.05
EOF

# Use with docker run
docker run --gpus all \
  -p 8000:8000 \
  --env-file .env.docker \
  legal-ai-gpu:latest

# Use with docker-compose
docker-compose -f docker/docker-compose.gpu.yml --env-file .env.docker up -d
```

---

## 🔄 Phase 107.4 - Store & Component Standardization (Current Session)

### 143 Updates Implemented
- **Stores Refactored**: `auth-store`, `chat-store`, `gpu-summary-store`, `knowledge-search`, `notifications` converted to use Svelte 5 runes (`$state`, `$derived`) classes/patterns.
- **Index Barrel**: Created `src/lib/stores/index.ts` to export all stores cleanly.
- **Components Fixed**: `LegalDocumentEditor.svelte`, `ParallaxBackground.svelte`, `KnowledgeGraph.svelte` updated for Svelte 5 syntax (`$props`, events).
- **Type Safety**: Improved type definitions in `chat-store` and `knowledge-search`.

