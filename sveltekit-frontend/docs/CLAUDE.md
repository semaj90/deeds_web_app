# Phase 72 – GPU Environment (Claude / Cursor / VS Code)

## Canonical Python (GPU Legal Env)

**Python Environment:**
- **Python:** 3.13.5 (`.venv` - shared with TensorRT-LLM)
- **Path:** `C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe`
- **PyTorch:** `torch 2.9.0+cu128`
- **Device:** `cuda:0` (NVIDIA GeForce RTX 3060 Ti, 12GB VRAM)

**Environment Variable:**
```powershell
$env:PHASE72_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
```

**Rule:** Phase 72 GPU jobs MUST use `${PHASE72_PYTHON}`.
Global `python` (if different) is for experiments only.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/phase72-svelte-check-vectorize.mjs` | Calls `phase72_gpu_vectorizer.py` via `${PHASE72_PYTHON}` |
| `scripts/phase72_gpu_vectorizer.py` | PyTorch GPU embeddings (8D vectors from errors) |
| `scripts/phase72-gpu-pipeline.mjs` | Full pipeline: svelte-check → vectorize → cluster → ingest |
| `scripts/phase72-logger.mjs` | Structured logs (`logs/phase72/*.jsonl`) |
| `scripts/phase72-auto-iterate.mjs` | 3-cycle automation with progress bars |

## Logging Fields for Claude Agents

When Claude interacts with Phase 72, these fields are logged:

```json
{
  "ts": "2025-12-01T20:00:00.000Z",
  "kind": "llm_call",
  "phase": "phase72",
  "provider": "claude",
  "model": "claude-3-5-sonnet-20241022",
  "tokens_in": 1024,
  "tokens_out": 512,
  "latency_ms": 2500,
  "python_bin": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe",
  "cuda_available": true,
  "error_count": 12000
}
```

## Usage Examples

### Run Phase 72 with Claude-aware logging

```powershell
# Set Python path
$env:PHASE72_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"

# Run 3-cycle automation
cd sveltekit-frontend
npm run phase72:auto-iterate

# Query Claude-specific logs
cat logs/phase72/*.jsonl | jq 'select(.provider == "claude")'
```

### Check GPU vectorizer status

```powershell
# Verify Python has PyTorch CUDA
& $env:PHASE72_PYTHON -c "import torch; print('CUDA:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0))"

# Expected output:
# CUDA: True
# Device: NVIDIA GeForce RTX 3060 Ti
```

### View vectorization metrics

```powershell
# See GPU vectorization performance
cat logs/phase72/*.jsonl | jq 'select(.step == "vectorize_gpu") | {errorCount: .metrics.errorCount, latency_ms: .metrics.latency_ms, device: .metrics.device}'
```

## Use These Logs To

1. **Detect regressions:** Compare `error_count` across runs
2. **Throttle expensive calls:** Track `tokens_in/out` per provider
3. **Feed ACE/ACA:** Token-efficiency stats for orchestration
4. **Optimize clusters:** Identify which error patterns require most LLM fixes

## Claude Best Practices

**When editing Phase 72 code:**
- ✅ Preserve logging calls (`logPhaseStep`, `logLlmCall`)
- ✅ Keep error count metrics accurate
- ✅ Use `PHASE72_PYTHON` env var for all Python spawns
- ✅ Add `provider: "claude"` to any LLM-related logs

**When fixing TypeScript errors:**
- ✅ Reduce errors in largest clusters first (highest impact)
- ✅ Validate syntax before committing (run `svelte-check`)
- ✅ Update Phase 72 logs with fix count and token usage
- ✅ Test GPU vectorizer still works after AST changes

## Integration with ACE/ACA

Phase 72 logs are consumed by:
- **ACE (Automated Code Evolution):** Applies fixes based on cluster analysis
- **ACA (Agentic Code Automation):** Orchestrates multi-agent workflows

Claude should treat Phase 72 as a **competitive game**:
- **Goal:** Fix max errors with min tokens
- **Metric:** `errors_fixed_per_1k_tokens`
- **Scoreboard:** Stored in Postgres `phase72_logs` table

## Troubleshooting

**Problem:** `Python spawn error: torch not found`
```powershell
# Solution: Verify PHASE72_PYTHON points to .venv
$env:PHASE72_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
& $env:PHASE72_PYTHON -m pip list | findstr torch
```

**Problem:** `CUDA device not found`
```powershell
# Solution: Check NVIDIA driver and PyTorch CUDA support
nvidia-smi
& $env:PHASE72_PYTHON -c "import torch; print(torch.version.cuda)"
```

**Problem:** Logs not appearing in `logs/phase72/`
```powershell
# Solution: Check log directory exists
New-Item -ItemType Directory -Force -Path sveltekit-frontend\logs\phase72
npm run phase72:auto-iterate
```

## CUDA Version Matrix

| Component | Version | Source |
|-----------|---------|--------|
| CUDA Toolkit | 13.0 | System install (for nvcc, LibTorch) |
| CUDA Runtime (PyTorch) | 12.8 | Bundled in `torch 2.9.0+cu128` wheel |
| Driver | 566.36+ | NVIDIA GeForce driver |

**Why two CUDA versions?**
- **13.0:** Used by CMake/C++ builds (LibTorch, TensorRT-LLM)
- **12.8:** Used by Python PyTorch (bundled runtime, no manual linking needed)
- Both coexist safely - PyTorch wheel is self-contained

## Next Steps

After Phase 72 completes:
1. **Review logs:** `cat logs/phase72/*.jsonl | jq .`
2. **Check error reduction:** 12k → 6k → 3k → ~1.2k (~90%)
3. **Analyze clusters:** Identify remaining error patterns for Phase 73
4. **Update ACE:** Ingest logs into Qdrant + Postgres for future runs

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

**See:** docs/PHASE-74-ERROR-FIXING-GUIDE.md for comprehensive strategies.

## 🧠 WebGPU & LangChain Integration (2025 Best Practices)

**Core Stack:**
- **LangChain.js 0.3+**: Use `Runnable` interface and `LCEL` for chains.
- **WebGPU**: Use `@webgpu/types`, ensure `strict: true`.
- **Module Resolution**: Use `"moduleResolution": "bundler"` in tsconfig.

**Missing Modules (TS2307) Troubleshooting:**
1. **Check Module Resolution**: Ensure `tsconfig.json` has `"moduleResolution": "bundler"`.
2. **Verify Path Aliases**: Check `$lib` and `$app` mappings in `.svelte-kit/tsconfig.json`.
3. **Type Decls**: If missing `@types/foo`, create `src/types/foo.d.ts` with `declare module 'foo';`.
4. **Svelte-Check**: Use `svelte-check --threshold error` to isolate real blockers.

---

## TypeScript AST Fixing - Phase 90/91 Critical Learnings

### TS1005 Diagnostic Position Semantics

**CRITICAL RULE:** Error position ≠ Fix position

When `TS1005: ',' expected` appears at position X:
- **Position X** = where parser found unexpected token
- **Fix location** = AFTER previous sibling token

```typescript
// Diagnostic reports error at 'arg2' (position 34)
foo(
  arg1
  arg2  // ← Error position
)

// Fix must insert comma AFTER 'arg1'
foo(
  arg1, // ← Fix position (prevArg.end)
  arg2
)
```

### Cascade Error Detection & Manual Review Triggers

**Pattern:** High error density + structural issues = Cascade errors from root syntax problems

```typescript
// Example of cascade error source:
const obj = {
  prop1: value1; // ← ROOT CAUSE: semicolon instead of comma
  prop2: value2, // ← SYMPTOM: Parser reports "comma expected" here
  prop3: value3
}
```

**Detection Heuristic:**
```javascript
function detectCascadeErrors(filePath, diagnostics) {
  const sourceFile = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf-8'),
    ts.ScriptTarget.Latest
  );

  const totalLines = sourceFile.getLineStarts().length;
  const errorDensity = (diagnostics.length / totalLines) * 100;

  // If > 50 errors per 100 lines, likely cascade
  if (errorDensity > 50) {
    return {
      risk: 'HIGH',
      action: 'manual_review',
      reason: 'Error density suggests parser confusion from root syntax issues'
    };
  }

  return { risk: 'LOW', action: 'safe_to_autofix' };
}
```

### Safe AST Fixing Checklist

**Before inserting any fix:**

1. ✅ Verify parent node type is valid for comma insertion
2. ✅ Check if comma already exists between nodes
3. ✅ Confirm we're not in error recovery mode
4. ✅ Use `prevNode.end` not `currentNode.getStart()`
5. ✅ Validate syntax before AND after
6. ✅ Auto-rollback if error count increases

### Phase 91 Validation Pipeline

```javascript
// 1. Backup original file
const backup = fs.readFileSync(filePath, 'utf-8');
fs.writeFileSync(`${filePath}.backup`, backup);

// 2. Apply fixes
const fixed = applyFixes(sourceFile, fixes);
fs.writeFileSync(filePath, fixed);

// 3. Validate syntax
const { syntaxErrors: errorsAfter } = getDiagnostics(filePath, fixed);

// 4. Compare & rollback if regression
if (errorsAfter > errorsBefore) {
  fs.writeFileSync(filePath, backup);
  return { status: 'rolled_back', regression: true };
}

// SUCCESS
return { status: 'success', errorsFixed: errorsBefore - errorsAfter };
```

### TypeScript Node Position API Reference

```typescript
interface Node {
  pos: number;        // Start of leading trivia (whitespace, comments) - WRONG for insert
  end: number;        // End of node - CORRECT for "append after"
  getStart(sourceFile?: SourceFile): number; // Start of token - WRONG for comma
}
```

**Usage:**
```javascript
// ❌ WRONG: Includes whitespace
const insertPos = node.pos;

// ❌ WRONG: Before current token
const insertPos = node.getStart(sourceFile);

// ✅ CORRECT: After previous token
const insertPos = prevNode.end;
```

### When NOT to Autofix

**Skip automated fixing if:**

1. **High error density:** > 50 errors per 100 lines
2. **Clustered errors:** 3+ errors within 5 lines
3. **Structural issues:** Missing braces, parens, or quotes
4. **Parser confusion:** Same error code repeated > 10 times

**Instead:**
- Export error report to `reports/manual-review/`
- Use AST Topology Explorer for visualization
- Human applies targeted root cause fix
- Re-run Phase 91 to validate

### References

- **Phase 90 Script:** `scripts/phase90-enhanced-ast-fixer.mjs`
- **Phase 91 Script:** `scripts/phase91-test-run.mjs`
- **Test Harness:** `scripts/test-ts1005.mjs`
- **TypeScript Compiler API:** https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
