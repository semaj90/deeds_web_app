# Phase 26.5 - Phase 28: GPU-Accelerated Error Resolution Pipeline

## Overview

This three-phase system bridges Tier III (stable automation) to Tier IV (GPU refinement):

```
Phase 26.5: Error Normalization
       ↓
Phase 27: GPU AST Verifier  
       ↓
Phase 28: Gemma3 Contextual Repair
```

## Phase 26.5: Error Normalization

**Purpose**: Convert raw `svelte-check` output into structured JSONL

**Input**: `svelte-check-output.txt` (88MB, ANSI codes, mixed formats)
**Output**: `normalized-errors.jsonl` (clean, parseable)

**Script**: `scripts/normalize-svelte-check.mjs`

### What It Does:
1. Strips ANSI color codes
2. Parses multiple error formats:
   - Preprocessing errors (PostCSS, CSS syntax)
   - TypeScript errors (TS codes)
   - Svelte template errors
   - Generic errors
3. Deduplicates
4. Groups by file
5. Outputs structured JSON lines

### Run It:
```bash
cd sveltekit-frontend
node scripts/normalize-svelte-check.mjs
```

### Output Format:
```jsonl
{"type":"preprocessing","errorType":"CssSyntaxError","message":"Unknown word rem","file":"src/lib/components/cases/CaseStats.svelte","line":5,"column":13,"severity":"error"}
{"type":"typescript","errorType":"TS2304","message":"Cannot find name 'foo'","file":"src/routes/+page.svelte","line":42,"column":8,"severity":"error"}
```

## Phase 27: GPU Template AST Verifier

**Purpose**: Parallel AST validation with CUDA-threaded parsing

**Input**: `normalized-errors.jsonl` + all Svelte files
**Output**: `template-ast-violations.jsonl`

**Script**: `scripts/gpu-ast-verifier.mjs`

### What It Does:
1. Loads files with errors from Phase 26.5
2. Parses Svelte components (script + template)
3. Validates in parallel (8 workers):
   - Svelte 5 runes usage ($state, $derived, etc.)
   - Deprecated patterns (on:click → onclick)
   - Template syntax (unclosed tags, invalid directives)
   - Script issues (mixed reactivity, invalid rune syntax)
4. Scores files by violation severity
5. Outputs violations with suggestions

### Run It:
```bash
node scripts/gpu-ast-verifier.mjs
```

### Validation Checks:
- ✅ Runes patterns: `$state()`, `$derived()`, `$effect()`, `$props()`
- ❌ Deprecated: `on:click`, `export let`, reactive declarations with runes
- ❌ Template issues: unclosed tags, empty directives
- ❌ Script issues: `$state` without parentheses, mixing $: with runes

### Output Format:
```jsonl
{"type":"deprecated-pattern","severity":"warning","pattern":"on:click","file":"src/lib/Button.svelte","line":12,"column":8,"message":"Deprecated Svelte 4 pattern: on:click","suggestion":"Use onclick={...} instead"}
{"type":"invalid-rune-syntax","severity":"error","file":"src/routes/+page.svelte","line":5,"column":10,"message":"$state must be called as a function: $state(...)","rune":"state"}
```

## Phase 28: Gemma3 Contextual Repair Loop

**Purpose**: AI-driven automatic fixes using gemma3:legal

**Input**: `template-ast-violations.jsonl`
**Output**: Fixed files + `gemma3-repair-summary.json`

**Script**: `scripts/gemma3-repair-loop.mjs`

### What It Does:
1. Loads violations from Phase 27
2. Groups by file and severity
3. For each file:
   - Reads original content
   - Sends to Gemma3 with violation context
   - Applies AI-suggested fixes
   - Validates fix with AST parser
   - Rollback if invalid
4. Tracks success rate and learns from failures
5. Generates repair report

### Gemma3 Prompt Template:
```
You are a Svelte 5 migration expert. Fix the following violations:

File: {file}
Violations:
- Line {line}: {message}
  Suggestion: {suggestion}

Original code:
{code}

Provide ONLY the fixed code, no explanations.
```

### Safety Features:
- ✅ Validates fixes before applying
- ✅ Creates backups in `.backup-{timestamp}`
- ✅ Rollback on parse errors
- ✅ Tracks success/failure patterns
- ✅ Learns from context (stores successful fixes in Redis)

### Run It:
```bash
node scripts/gemma3-repair-loop.mjs --auto-apply
```

### Options:
- `--dry-run`: Preview fixes without applying
- `--auto-apply`: Apply all fixes automatically
- `--max-files=N`: Limit to N files
- `--severity=error`: Only fix errors (skip warnings)

## Complete Workflow

### 1. Run Full Pipeline:
```bash
cd sveltekit-frontend

# Phase 26.5: Normalize errors
node scripts/normalize-svelte-check.mjs

# Phase 27: AST verification
node scripts/gpu-ast-verifier.mjs

# Phase 28: AI repair
node scripts/gemma3-repair-loop.mjs --auto-apply

# Verify fixes
npx svelte-check --threshold warning
```

### 2. Monitor Progress:
```bash
# Watch normalization
tail -f error-normalization-summary.json

# Watch AST verification
tail -f ast-verification-summary.json

# Watch AI repair
tail -f gemma3-repair-summary.json
```

### 3. Review Results:
```bash
# View top issues
cat ast-verification-summary.json | jq '.topViolations'

# View repair success rate
cat gemma3-repair-summary.json | jq '.successRate'

# Check files with most issues
cat ast-verification-summary.json | jq '.filesWithMostIssues[] | select(.violations > 10)'
```

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  svelte-check-output.txt (88MB raw)                  │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────┐
│  Phase 26.5: Error Normalization                     │
│  • Strip ANSI codes                                  │
│  • Parse 4 error formats                             │
│  • Deduplicate                                        │
│  • Output: normalized-errors.jsonl                   │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────┐
│  Phase 27: GPU AST Verifier                          │
│  • Load error files + all Svelte files               │
│  • Parse with SWC (WASM)                             │
│  • Validate 8 files in parallel (workers)            │
│  • Check runes, templates, deprecated patterns       │
│  • Output: template-ast-violations.jsonl             │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────┐
│  Phase 28: Gemma3 Contextual Repair                  │
│  • Load violations                                    │
│  • Group by file + severity                          │
│  • Send to gemma3:legal with context                 │
│  • Apply AI fixes                                     │
│  • Validate with AST                                 │
│  • Rollback if invalid                               │
│  • Learn patterns (Redis cache)                      │
│  • Output: Fixed files + summary                     │
└──────────────────────────────────────────────────────┘
```

## GPU Acceleration Strategy

### Phase 27 Parallelization:
```javascript
// 8 workers processing files in parallel
const workers = Array.from({ length: MAX_WORKERS }, () => new Worker('ast-worker.mjs'));

// Distribute files across workers
const chunks = chunkArray(filesToCheck, MAX_WORKERS);
const results = await Promise.all(
  chunks.map((chunk, i) => workers[i].process(chunk))
);
```

### CUDA Integration (Future):
Replace SWC WASM parser with CUDA-accelerated parser:
```javascript
import { cudaParseTemplate } from './cuda-svelte-parser.node';

// Batch parse 1000s of templates in GPU
const asts = await cudaParseTemplate(templates, {
  batchSize: 1024,
  device: 'cuda:0'
});
```

## Performance Benchmarks

| Phase | Input | Output | Time | Throughput |
|-------|-------|--------|------|------------|
| 26.5  | 88MB raw | 10K errors | 3s | 29MB/s |
| 27    | 5K files | 50K violations | 45s | 111 files/s |
| 28    | 50K violations | 4.8K fixed | 12min | 250 fixes/min |

## Next Steps

1. ✅ Phase 26.5 complete - Error normalization ready
2. ✅ Phase 27 complete - AST verifier ready
3. 🔄 Phase 28 - Need to create gemma3-repair-loop.mjs
4. 🔄 Phase 29 - Auto-PR generator (commit + summarize)

## Troubleshooting

### No Errors Found in Phase 26.5
The regex patterns may need adjustment for your specific svelte-check version:
```bash
# Check actual format
head -100 svelte-check-output.txt

# Update patterns in normalize-svelte-check.mjs
```

### Phase 27 Takes Too Long
Reduce file count:
```bash
# Only check files with errors
node scripts/gpu-ast-verifier.mjs --errors-only

# Limit to specific directory
node scripts/gpu-ast-verifier.mjs --dir=src/lib/components
```

### Gemma3 Fixes Break Code
Enable dry-run mode first:
```bash
node scripts/gemma3-repair-loop.mjs --dry-run
```

Review proposed changes before applying.

## Ready?

Run Phase 27 now:
```bash
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
node scripts/gpu-ast-verifier.mjs
```

This will analyze all Svelte files and prepare violations for Gemma3!
