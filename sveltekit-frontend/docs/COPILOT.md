# Phase 72 – VS Code / Copilot Integration

## Python / CUDA Environment

**Preferred Python for GPU tasks:**
```powershell
$env:PHASE72_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
```

- **Python:** 3.13.5 (`.venv` - TensorRT-LLM env)
- **PyTorch:** 2.9.0+cu128
- **CUDA:** Device `cuda:0` (RTX 3060 Ti, 12GB)

**Fallback:** System `python` (for non-GPU tasks only)

## VS Code Tasks Configuration

Add this to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Phase72: Auto Iterate (GPU)",
      "type": "shell",
      "command": "npm run phase72:auto-iterate",
      "options": {
        "cwd": "${workspaceFolder}/sveltekit-frontend",
        "env": {
          "PHASE72_PYTHON": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe"
        }
      },
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "presentation": {
        "reveal": "always",
        "panel": "dedicated"
      },
      "problemMatcher": []
    },
    {
      "label": "Phase72: Check GPU Vectorizer",
      "type": "shell",
      "command": "${env:PHASE72_PYTHON} -c \"import torch; print('CUDA:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0))\"",
      "options": {
        "env": {
          "PHASE72_PYTHON": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe"
        }
      },
      "group": "test"
    },
    {
      "label": "Phase72: View Logs (Last Run)",
      "type": "shell",
      "command": "Get-Content logs\\phase72\\*.jsonl -Tail 50 | ConvertFrom-Json | Format-Table -AutoSize",
      "options": {
        "cwd": "${workspaceFolder}/sveltekit-frontend",
        "shell": {
          "executable": "pwsh.exe"
        }
      },
      "group": "test"
    }
  ]
}
```

## How Tasks Run

### Task: `Phase72: Auto Iterate`
1. Sets `PHASE72_PYTHON` env var
2. Runs `npm run phase72:auto-iterate`
3. Progress bars show in terminal (cli-progress)
4. Logs written to `sveltekit-frontend/logs/phase72/*.jsonl`

**Expected output:**
```
┌─────────────────────────────────────────────────┐
│ Phase 72: 3-Cycle Error Reduction               │
│ ████████████████░░░░░░░░░░ 45% | Cycle 2/3     │
│ Vectorizing errors: ██████████░░ 60% | 7200/12k │
└─────────────────────────────────────────────────┘
```

### Task: `Phase72: Check GPU Vectorizer`
Verifies Python has PyTorch with CUDA:
```
CUDA: True
Device: NVIDIA GeForce RTX 3060 Ti
```

### Task: `Phase72: View Logs`
Shows last 50 log entries in table format:
```
ts                        kind        phase    step           errorCount
--                        ----        -----    ----           ----------
2025-12-01T20:00:00.000Z  phase_step  phase72  vectorize_gpu  12000
```

## Logs for Copilot Agents

All Phase 72 runs write JSONL logs to `logs/phase72/`.

**Log schema:**
```json
{
  "ts": "2025-12-01T20:00:00.000Z",
  "kind": "phase_step",
  "phase": "phase72",
  "step": "vectorize_gpu",
  "editor": "vscode",
  "provider": "copilot",
  "metrics": {
    "errorCount": 12000,
    "latency_ms": 1500,
    "device": "cuda:0",
    "python_bin": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe"
  }
}
```

**When Copilot is involved in fixes:**
```json
{
  "kind": "llm_call",
  "provider": "copilot",
  "model": "gpt-4",
  "tokens_in": 512,
  "tokens_out": 256,
  "errors_fixed": 150
}
```

## Copilot Edit Guidelines

When suggesting edits for Phase 72:

### ✅ DO:
- **Reduce errors in largest clusters first** (highest impact)
- **Keep TypeScript/Svelte syntax valid** (run `svelte-check` to verify)
- **Preserve logging hooks** (`logPhaseStep`, `logLlmCall`)
- **Use `PHASE72_PYTHON` for all Python spawns**
- **Add `provider: "copilot"` to logs when Copilot edits code**

### ❌ DON'T:
- Remove or bypass GPU vectorization code
- Hardcode `python` instead of using `process.env.PHASE72_PYTHON`
- Skip error count validation after fixes
- Ignore cluster analysis (fix random errors instead of clustered ones)

## Integration with ACE/ACA

**ACE (Automated Code Evolution):**
- Reads Phase 72 logs from `logs/phase72/*.jsonl`
- Applies AST fixes based on cluster analysis
- Tracks error count reduction per cycle

**ACA (Agentic Code Automation):**
- Orchestrates multi-agent workflows
- Assigns error clusters to different providers (Copilot, Claude, Gemini)
- Measures `errors_fixed_per_token` efficiency

**Copilot's role:**
- Compete with Claude/Gemini on error reduction speed
- Optimize for token efficiency (min tokens, max errors fixed)
- Feed metrics back into ACE for future runs

## Quick Commands

### Run Phase 72 from terminal
```powershell
cd sveltekit-frontend
$env:PHASE72_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
npm run phase72:auto-iterate
```

### Query logs for Copilot-specific entries
```powershell
cat logs\phase72\*.jsonl | ConvertFrom-Json | Where-Object { $_.provider -eq "copilot" } | Format-Table
```

### Check error count before/after
```powershell
# Before
npx svelte-check --threshold error

# After Phase 72
cat logs\phase72\phase72-*.jsonl | ConvertFrom-Json | Select-Object -Last 1 | Select-Object -ExpandProperty metrics | Select-Object errorCount
```

## Troubleshooting

### Problem: `python not found`
**Solution:** Set `PHASE72_PYTHON` in task or global env:
```powershell
[System.Environment]::SetEnvironmentVariable('PHASE72_PYTHON', 'C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe', 'User')
```

### Problem: VS Code task doesn't see env var
**Solution:** Restart VS Code after setting user-level env vars, or use task-level `env` in `tasks.json`.

### Problem: GPU vectorizer falls back to CPU
**Solution:** Verify PyTorch CUDA:
```powershell
& $env:PHASE72_PYTHON -c "import torch; print(torch.cuda.is_available())"
```

### Problem: Logs missing or incomplete
**Solution:** Check log directory exists:
```powershell
New-Item -ItemType Directory -Force -Path sveltekit-frontend\logs\phase72
```

## Performance Expectations

| Metric | Value |
|--------|-------|
| **Total time (3 cycles)** | ~40 minutes |
| **Cycle 1** | 12k → 6k errors (~50% reduction) |
| **Cycle 2** | 6k → 3k errors (~75% cumulative) |
| **Cycle 3** | 3k → 1.2k errors (~90% cumulative) |
| **GPU vectorization** | ~1-2s per 10k errors |
| **Clustering** | ~3-5s per cycle (WebGPU SOM) |
| **ACE fixes** | ~10-15 min per cycle (LLM calls) |

## Next Steps After Phase 72

1. **Review cluster report:** `logs/phase72/clusters-*.json`
2. **Analyze remaining errors:** Patterns that Phase 72 couldn't fix
3. **Plan Phase 73:** AST structural fixes (deep type inference, Babel/SWC)
4. **Update ACE config:** Tune fix strategies based on success rate
5. **Ingest logs into Qdrant:** Enable semantic search over execution history

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
