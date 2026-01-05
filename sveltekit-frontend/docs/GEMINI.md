# Phase 72 – Gemini / FastMCP Agent

## Environment Assumptions

**Python for Phase72 GPU:**
```json
{
  "env": {
    "PHASE72_PYTHON": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe"
  }
}
```

**Details:**
- **Python:** 3.13.5 (`.venv` - shared with TensorRT-LLM)
- **PyTorch:** 2.9.0+cu128
- **CUDA:** Device `cuda:0` (RTX 3060 Ti, 12GB VRAM)

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
- [ ] Track token usage (prompt + completion)
- [ ] Report errors fixed per call
- [ ] Query logs for debugging: `cat logs/phase72/*.jsonl | jq .`

## Next Steps

1. **Run Phase 72:** `npm run phase72:auto-iterate`
2. **Monitor logs:** `tail -f logs/phase72/phase72-*.jsonl`
3. **Analyze clusters:** Review error patterns in cluster report
4. **Update ACE:** Ingest logs into Qdrant for semantic search
5. **Plan Phase 73:** AST structural fixes for remaining ~1.2k errors

---

## 🗄️ Drizzle ORM 0.44 Migration Best Practices

### Stack
- **Drizzle ORM**: 0.44.x
- **Drizzle Kit**: 0.30.x
- **PostgreSQL**: via `postgres-js` driver
- **Schema Location**: `src/lib/server/db/schema-postgres.ts`
- **Migrations Directory**: `drizzle/`

### Migration Scripts (package.json)
```bash
db:check           # Validate schema syntax before any operation
db:push:dev        # Interactive push (development only, with prompts)
db:generate        # Create SQL migration files (review before applying)
db:migrate:apply   # Apply migrations (production-safe)
db:verify:canvas   # Verify canvas_states table exists
db:studio          # Open Drizzle Studio GUI
```

### "No Data Loss" Workflow
```
1. Change schema → src/lib/server/db/schema-postgres.ts
2. npm run db:generate → Creates drizzle/00XX_xxx.sql
3. REVIEW the SQL file:
   ✅ CREATE TABLE, ALTER TABLE ADD COLUMN
   ❌ DROP TABLE, DROP COLUMN, TRUNCATE, ALTER COLUMN TYPE
4. npm run db:migrate:apply → Applies to database
```

### Critical Rules
1. **Never use `db:push` on production** - Use `db:generate` → review → `db:migrate:apply`
2. **Always review generated SQL** for DROP/TRUNCATE statements
3. **Use `doublePrecision()` for float8 columns** to avoid precision loss
4. **Run `db:check` before any migration** to catch syntax errors early
5. **Backup before migrations**: `pg_dump -Fc -f backup.dump`

### Schema Type Mappings
| PostgreSQL | Drizzle |
|------------|---------|
| `uuid` | `uuid()` |
| `text` | `text()` |
| `varchar(n)` | `varchar('col', { length: n })` |
| `integer` | `integer()` |
| `boolean` | `boolean()` |
| `jsonb` | `jsonb()` |
| `timestamp` | `timestamp('col', { mode: 'string' })` |
| `float8/double precision` | `doublePrecision()` |
| `float4/real` | `real()` |
| `text[]` | `text('col').array()` |

### Canvas States Table Verification
Before saving board state, verify table exists:
```typescript
import { verifyCanvasStatesTable } from '$lib/server/db/verify-canvas-table';

const tableExists = await verifyCanvasStatesTable();
if (!tableExists) {
    return json({ error: 'canvas_states table missing', code: 'TABLE_MISSING' }, { status: 503 });
}
```

### Related Files
- `src/lib/server/db/schema-postgres.ts` - Main schema
- `src/lib/server/db/index.ts` - DB client + exports
- `src/lib/server/db/verify-canvas-table.ts` - Table existence check
- `drizzle.config.ts` - Drizzle Kit configuration
- `drizzle/` - Migration files

---

## 🎮 WebGPU / LangChain.js / TypeScript 5.5 Best Practices (2025)

### WebGPU API Guidelines

**Type Setup:**
```bash
npm install --save-dev @webgpu/types
```

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["@webgpu/types"]
  }
}
```

**Key Interfaces:**
- `GPUDevice`: Main entry point, manages resources and command queues
- `GPUBuffer`: GPU memory block, created via `device.createBuffer()`
- `GPUComputePipeline`: Compute shader execution pipeline

**Buffer Creation Pattern:**
```typescript
const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(buffer, 0, data);
```

### LangChain.js 0.3 TypeScript Guidelines

**Embeddings Interface:**
```typescript
interface Embeddings {
    embedDocuments(documents: string[]): Promise<number[][]>;
    embedQuery(text: string): Promise<number[]>;
}
```

**Runnable Interface for Chains:**
- All chain components implement `Runnable` for composition
- Use `RunnableSequence.from([...])` for chaining

**Provider Integration:**
- OpenAI, Ollama, Vertex AI embeddings all follow same interface
- Prefer `@langchain/ollama` for local embeddings

### TypeScript 5.5 Best Practices

1. **Enable Strict Mode**: `"strict": true` in tsconfig
2. **Use Inferred Type Predicates**: TS 5.5 auto-infers `Array.filter()` types
3. **Leverage `NoInfer<T>`**: Prevent unwanted generic inference
4. **Prefer `unknown` over `any`**: Forces type checking before use
5. **Use Utility Types**: `Partial`, `Required`, `Pick`, `Omit`, `Record`

### Common Corruption Patterns to Fix

**Colon-Instead-of-Space Pattern:**
```typescript
// ❌ WRONG (corrupted)
import: { browser } from: '$app/environment';
interface Foo: {
function bar(param, string): void {

// ✅ CORRECT
import { browser } from '$app/environment';
interface Foo {
function bar(param: string): void {
```

**Fix Script:**
```bash
node scripts/fix-colon-corruption.cjs
```

### High-Error Files Requiring Attention

| File | Error Count | Pattern |
|------|-------------|---------|
| `webgpu-simd-accelerator.ts` | ~400 | Colon corruption |
| `webgpu-langchain-bridge.ts` | ~400 | Colon corruption |
| `qlora-*-integration.ts` | ~400 | Colon corruption |

### Agentic Tool Calling for svelte-check

**Pattern Matching Workflow:**
1. Run `npx svelte-check --threshold error > errors.txt`
2. Parse error patterns (file:line:col:message)
3. Cluster by error type and file
4. Apply batch fixes with regex/AST transforms
5. Re-run svelte-check to verify

**Fix Script Template:**
```javascript
// scripts/fix-pattern.cjs
const fs = require('fs');
const files = ['src/lib/...'];
for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    content = content.replace(/WRONG_PATTERN/g, 'CORRECT_PATTERN');
    fs.writeFileSync(file, content);
}
```

---

## 📦 Drizzle ORM 0.44 Best Practices (2025)

### Codebase-First Migration
- Define schema as TypeScript objects (source of truth)
- Use `drizzle-kit generate` for production SQL migrations
- Use `drizzle-kit push` only for rapid prototyping

### Safe Migration Patterns
```typescript
// ✅ Low-risk (additive)
ALTER TABLE ADD COLUMN
CREATE TABLE
CREATE INDEX CONCURRENTLY

// ❌ High-risk (multi-step required)
DROP TABLE, DROP COLUMN, ALTER COLUMN TYPE
```

### Safe Column Rename (5-step)
1. Add new "shadow" column
2. Implement dual-writes
3. Backfill data
4. Flip reads to new column
5. Drop old column later

---

## 🎨 Bits-UI v1.x/v2.x (Svelte 5)

### Breaking Changes from 0.x
| Old | New |
|-----|-----|
| `el` prop | `ref` prop |
| `asChild` | `child` snippet |
| `let:` directives | `children` snippet |
| Accordion `multiple` | `type="multiple"` |

### Portalling Pattern
```svelte
<Select.Portal>
  <Select.Content>...</Select.Content>
</Select.Portal>
```

---

## 🚀 SvelteKit 2.0 Load Functions

### Promise Behavior Change
```typescript
// ❌ Old - auto-awaited
return { data: fetch('...') };

// ✅ New - explicit await for blocking
return { data: await fetch('...') };

// ✅ Streaming (faster)
return { data: fetch('...') }; // Don't await
```

---

## 🔷 Svelte 5 Runes

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  let { name } = $props();

  $effect(() => {
    console.log('count:', count);
  });
</script>
```

---

## 🦫 Go 1.24/1.25 (2025)

- **Generic Type Aliases**: Full parameterization
- **errors.Join**: Structured error wrapping
- **Swiss Tables**: 2-3% CPU reduction
- **Go 1.25**: Removed "core types", experimental json/v2 (3-10x faster)

---

## 🔥 CUDA 12.8 + PyTorch 2.9

```bash
pip install torch==2.9.0+cu128 --index-url https://download.pytorch.org/whl/cu128
```

```python
import torch
print(f"CUDA: {torch.cuda.is_available()}")
print(f"Device: {torch.cuda.get_device_name(0)}")
```

---

## 📋 Agentic Error Fixing Workflow

### Dry-Run Phase (1-210 files)
```bash
git add -A && git commit -m "Pre-fix checkpoint"
node scripts/agentic-corruption-fixer.mjs --dry-run --limit 210
```

### Apply and Verify
```bash
node scripts/agentic-corruption-fixer.mjs --apply
npm run check
npx tsc --noEmit
git add -A && git commit -m "Applied batch fixes"
```

---

**See Also:** `docs/AGENTIC-ERROR-FIXING-KB.md` for comprehensive RAG/KAG/DAG knowledge base.

## 📊 Phase 74: TypeScript/Svelte Error Fixing (2025)

**Current Status (2026-01-05):**
- Baseline: ~88,300 errors  
- Post-Phase 72-73: 83,139 errors (-5.8%)  
- Target: <75,000 errors (10%+ total reduction)

### Quick Reference: Common Error Fixes

| Error Code | Meaning | Quick Fix |
|------------|---------|-----------|
| TS2304 | Cannot find name | npm install --save-dev @types/X |
| TS2322 | Type not assignable | Add \| null \| undefined or type guard |
| TS2345 | Argument type mismatch | Add type annotation or assertion |
| TS2339 | Property doesn't exist | Use optional chaining ?. |
| TS7006 | Implicit any | Add explicit type annotation |

### Automated Fixing Tools
1. ESLint: npx eslint --fix src/**/*.{ts,svelte}
2. ts-fix: npx ts-fix (Microsoft CLI for VS Code fixes)
3. ts-morph: AST-based batch refactoring
4. svelte-check: npx svelte-check --threshold error

**See:** docs/PHASE-74-ERROR-FIXING-GUIDE.md for comprehensive strategies.
