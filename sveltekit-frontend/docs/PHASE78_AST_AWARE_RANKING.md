# Phase 78: AST-Aware Error Ranking System

## 🎯 Overview

The AST-Aware Error Ranking System enhances Phase 78's error fixing pipeline by using the Svelte compiler's AST (Abstract Syntax Tree) to intelligently prioritize which errors to fix first. Instead of fixing errors randomly or by file order, this system analyzes the codebase structure to identify high-impact fixes that will cascade through your dependency graph.

## 🧠 How It Works

### 1. **AST Parsing & Correlation**
```
svelte-check.log → Parse Errors → Match to AST Nodes → Extract Context
```

For each error in `logs/svelte-check.log`, the system:
- Parses the Svelte file's AST using `svelte/compiler`
- Finds the exact AST node at the error's line/column
- Extracts node metadata (type, name, parent context)
- Determines reactivity context ($state, $derived, $effect, legacy $:)

**Example:**
```typescript
// Error: Type 'string' is not assignable to type 'number'
let count = $state('5'); // Error at this line

// AST Analysis reveals:
{
  nodeType: 'VariableDeclarator',
  nodeName: 'count',
  reactivityContext: '$state', // Svelte 5 rune detected
  isInScript: true
}
```

### 2. **Dependency Graph Construction**
```
Import/Export Analysis → Build Graph → Calculate Centrality & Blast Radius
```

The system builds a complete dependency graph:
- Maps all `import` statements to track dependencies
- Identifies `export` declarations to find what's consumed externally
- Detects Svelte component instantiations (`<MyComponent />`)
- Calculates **centrality score** (how central a file is to the architecture)
- Computes **blast radius** (how many files could be affected by changes)

**Centrality Formula:**
```javascript
centrality = importedByCount / (1 + importsCount)
// High centrality = many importers, few dependencies (utility files)
// Low centrality = few importers, many dependencies (application roots)
```

**Blast Radius:**
```javascript
// Traverse graph to count all files that transitively import this file
blastRadius = countTransitiveImporters(file)
```

### 3. **Fix Complexity Estimation**
```
Error Pattern + AST Context → Estimate Difficulty → Calculate Time
```

Each error is classified by fix difficulty:

| Difficulty | Examples | Est. Time | Triggers |
|------------|----------|-----------|----------|
| **Trivial** | Missing semicolons, formatting | 1-2 min | Simple syntax |
| **Easy** | Type mismatches, simple casts | 3-5 min | `ts` code with "not assignable" |
| **Moderate** | Svelte 5 migrations, prop changes | 10-20 min | `export let`, legacy `$:` |
| **Hard** | Store refactors, reactivity rewrites | 30-60 min | `writable`, `derived`, `readable` |
| **Expert** | High blast radius architectural changes | 60+ min | 10+ dependent files |

**Complexity Factors:**
- Error code (`ts`, `svelte`, `a11y`, etc.)
- AST node type and context
- Blast radius (affects multiple files?)
- Refactor requirement (structural change needed?)

### 4. **Priority Score Calculation (0-100)**
```
Priority = Base(50) + Severity + Centrality + BlastRadius - Difficulty
```

**Formula Breakdown:**
```javascript
score = 50; // baseline

// Severity boost
if (severity === 'error') score += 20;
if (severity === 'warning') score += 10;

// Centrality boost (high centrality = fix sooner)
score += centralityScore * 15;

// Blast radius (context-dependent)
if (blastRadius > 10 && difficulty === 'expert') {
  score -= 10; // Defer risky changes
} else {
  score += min(blastRadius, 15); // Boost by impact
}

// Difficulty penalty (easy wins first)
const penalties = { trivial: +15, easy: +10, moderate: 0, hard: -10, expert: -15 };
score += penalties[difficulty];

// Svelte 5 migration boost
if (reactivityContext === 'legacy') score += 10;
```

**Result:** Errors are ranked 0-100, where:
- **90-100**: Critical, high-impact, easy fixes (DO FIRST)
- **70-89**: Important, moderate impact or difficulty
- **50-69**: Standard priority
- **0-49**: Low priority or high-risk changes (defer until others fixed)

### 5. **Error Clustering**
```
Generate Signature → Group Similar Errors → Batch Fix Potential
```

Errors are clustered by signature:
```javascript
signature = hash(errorCode + nodeType + reactivityContext + messagePrefix)
```

**Why Cluster?**
- Identify patterns (e.g., 50 files with same `export let` → `$props()` migration)
- Enable batch fixes (fix pattern once, apply to all instances)
- Detect architectural issues (100 errors in same category = systemic problem)

**Output Example:**
```json
{
  "clusters": [
    {
      "signature": "a3f4b912",
      "count": 127,
      "averagePriority": 82.4,
      "sampleError": {
        "message": "'export let' is deprecated in Svelte 5, use $props()",
        "pattern": "VariableDeclaration + legacy"
      }
    }
  ]
}
```

## 📊 Output Format

### JSON Structure (`svelte-check-errors-index/ast-ranked-errors.json`)

```json
{
  "metadata": {
    "generatedAt": "2026-01-08T...",
    "totalErrors": 1247,
    "totalFiles": 89,
    "totalClusters": 24,
    "topN": 100
  },
  "fileAnalyses": [
    {
      "file": "src/routes/+page.svelte",
      "totalErrors": 12,
      "astParsed": true,
      "componentHierarchyDepth": 3,
      "dependencies": {
        "imports": ["$lib/stores/user", "$lib/components/Header"],
        "exports": ["load"],
        "components": ["Header", "Footer"]
      },
      "errors": [ /* enriched errors */ ]
    }
  ],
  "rankedErrors": [
    {
      "file": "src/lib/stores/auth.ts",
      "line": 42,
      "column": 10,
      "message": "Type 'string | undefined' is not assignable to 'string'",
      "severity": "error",
      "code": "ts",
      "astContext": {
        "nodeType": "VariableDeclarator",
        "nodeName": "userId",
        "reactivityContext": "$state",
        "isInComponent": false,
        "isInScript": true
      },
      "dependencyImpact": {
        "importedBy": ["routes/+layout.svelte", "routes/profile/+page.svelte"],
        "imports": ["$env/dynamic/public"],
        "blastRadius": 23,
        "centralityScore": 0.85
      },
      "fixComplexity": {
        "difficulty": "easy",
        "estimatedMinutes": 5,
        "requiresRefactor": false,
        "affectsMultipleFiles": true
      },
      "priorityScore": 94.2,
      "clusterSignature": "a3f4b912"
    }
  ],
  "clusters": [ /* cluster summaries */ ]
}
```

### Console Output

```
🧠 Phase 78: AST-Aware Error Ranking

📂 Analyzing 89 files with AST parsing...
🔗 Building dependency graph...
   Graph contains 89 nodes
🎯 Enriching errors with AST context and impact scores...
📊 Ranking errors by priority score...

✅ Processed 1247 errors into 24 clusters

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 TOP 10 PRIORITY FIXES

1. [Score: 94.2] src/lib/stores/auth.ts:42
   Type 'string | undefined' is not assignable to 'string'
   Difficulty: easy (5min)
   Impact: 23 files | Centrality: 85%
   AST: VariableDeclarator in $state context

2. [Score: 91.8] src/routes/+layout.svelte:15
   'export let data' is deprecated, use $props()
   Difficulty: moderate (15min)
   Impact: 1 files | Centrality: 45%
   AST: ExportNamedDeclaration in legacy context
...
```

## 🚀 Usage

### Basic Commands

```bash
# Full pipeline (recommended)
npm run phase78:full

# Individual steps
npm run phase78:ast-rank           # Run AST analysis (includes svelte-check)
npm run phase78:ast-rank:top50     # Analyze only top 50 files
npm run phase78:ast-rank:verbose   # Show detailed AST debug output
npm run phase78:insert             # Insert errors to PostgreSQL
npm run phase78:cluster            # GPU clustering (requires CUDA)
npm run phase78:suggest            # LLM-based fix suggestions
```

### Workflow Integration

#### **Step 1: Generate Ranked Errors**
```bash
npm run phase78:ast-rank
```
This will:
1. Run `npx svelte-check` and save output to `logs/svelte-check.log`
2. Parse the log and extract all errors
3. For each error, parse the Svelte file's AST
4. Build dependency graph across all files
5. Calculate priority scores and cluster signatures
6. Output results to `svelte-check-errors-index/ast-ranked-errors.json`

#### **Step 2: Review Top Priorities**
```bash
cat svelte-check-errors-index/ast-ranked-errors.json | jq '.rankedErrors[:10]'
```

#### **Step 3: Fix Errors (Manual or Automated)**
```bash
# Option A: Manual fixing (start with highest priority)
code src/lib/stores/auth.ts:42

# Option B: Automated batch fixing (for clusters)
npm run phase78:suggest  # Generate LLM fix suggestions
```

#### **Step 4: Verify Progress**
```bash
npm run phase78:ast-rank  # Re-run to see new rankings
```

## 🔌 Integration Points

### Phase 78 Pipeline Enhancement

**Before (Old Flow):**
```
svelte-check → Parse Log → Insert DB → Cluster → Suggest
```

**After (New Flow with AST Ranking):**
```
svelte-check → AST Rank (NEW) → Insert DB → Cluster → Suggest
              ↓
        Priority Scores
        Dependency Graph
        Cluster Signatures
```

### Database Integration

The AST ranker can optionally update PostgreSQL `raw_error_embeddings` table:

```sql
-- Add columns (if not exists)
ALTER TABLE raw_error_embeddings
  ADD COLUMN ast_context JSONB,
  ADD COLUMN priority_score FLOAT,
  ADD COLUMN cluster_signature VARCHAR(8);

-- AST ranker will populate:
UPDATE raw_error_embeddings
SET
  ast_context = '{"nodeType": "VariableDeclarator", ...}',
  priority_score = 94.2,
  cluster_signature = 'a3f4b912'
WHERE source = 'src/lib/stores/auth.ts' AND line = 42;
```

This enables:
- SQL queries to fetch top priority errors
- CUDA clustering using `priority_score` weights
- RAG/KAG queries using `ast_context` metadata

## 🎓 Understanding the Metrics

### Centrality Score (0.0 - 1.0)

**What it means:** How central a file is to your application architecture.

```
0.0 - 0.2: Leaf nodes (UI components, pages)
0.3 - 0.5: Mid-level utilities (form handlers, helpers)
0.6 - 0.8: Core services (stores, API clients)
0.9 - 1.0: Critical infrastructure (auth, routing, config)
```

**Why it matters:** Fixing high-centrality files has maximum ripple effect.

### Blast Radius (0 - N files)

**What it means:** Number of files that transitively depend on this file.

```
0-2:   Local impact (page-specific components)
3-10:  Module impact (shared components)
11-30: Subsystem impact (core utilities)
31+:   System-wide impact (foundational stores)
```

**Why it matters:** High blast radius = careful testing needed after fix.

### Priority Score (0 - 100)

**Interpretation:**
```
90-100: 🔥 CRITICAL - Fix immediately (high impact, low risk)
70-89:  ⚠️  HIGH - Fix this week
50-69:  📋 MEDIUM - Normal backlog
30-49:  💡 LOW - Nice to have
0-29:   ⏸️  DEFER - Risky or low value
```

**Decision Matrix:**

| Centrality | Blast Radius | Difficulty | Priority |
|------------|--------------|------------|----------|
| High       | Low          | Easy       | 🔥 95+ (DO NOW) |
| High       | High         | Easy       | ⚠️ 85-95 (DO SOON) |
| High       | High         | Hard       | ⏸️ 40-60 (DEFER - Risky) |
| Low        | Low          | Easy       | 📋 60-75 (Quick Win) |
| Low        | High         | Hard       | ⏸️ 20-40 (Skip) |

## 🧪 Example Use Cases

### Use Case 1: Svelte 5 Migration

**Problem:** 200 files using legacy `export let` syntax

**Solution:**
```bash
npm run phase78:ast-rank

# Output shows:
# Cluster a3f4b912: 127 errors - 'export let' → $props() migration
# Average priority: 82.4
# Sample: src/components/Button.svelte:5

# Strategy: Fix highest priority files first to unlock dependent files
1. Fix src/lib/components/BaseButton.svelte (centrality: 0.9, 50 importers)
2. Run tests
3. Fix remaining 126 files (now unlocked by BaseButton fix)
```

### Use Case 2: Type Safety Cleanup

**Problem:** Mixed type errors, don't know where to start

**Solution:**
```bash
npm run phase78:ast-rank:verbose

# Top priority: src/lib/stores/auth.ts (score: 94.2)
# Reason: High centrality (0.85), easy fix (5min), 23-file blast radius
# Fix this ONE file → 23 downstream files may auto-resolve
```

### Use Case 3: Refactoring Safety

**Problem:** Need to refactor a core file, unsure of impact

**Solution:**
```bash
npm run phase78:ast-rank

# Search ast-ranked-errors.json for your file:
jq '.fileAnalyses[] | select(.file == "src/lib/api/client.ts")' \
   svelte-check-errors-index/ast-ranked-errors.json

# Output:
{
  "blastRadius": 47,        // Affects 47 files!
  "centralityScore": 0.92,  // Critical infrastructure
  "importedBy": [...]       // See all 47 dependents
}

# Decision: Write comprehensive tests before touching this file
```

## 🔧 Advanced Configuration

### Customizing Priority Weights

Edit `phase78-ast-aware-ranker.mts`:

```typescript
function calculatePriorityScore(...) {
  let score = 50;

  // Adjust these weights to fit your needs:
  if (error.severity === 'error') score += 20;  // ← Increase to prioritize errors
  score += depImpact.centralityScore * 15;      // ← Increase to favor central files
  score += Math.min(depImpact.blastRadius, 15); // ← Cap blast radius impact

  const difficultyMap = {
    trivial: 15,
    easy: 10,      // ← Increase to prefer easy fixes
    moderate: 0,
    hard: -10,     // ← Decrease to defer hard fixes
    expert: -15
  };

  return Math.max(0, Math.min(100, score));
}
```

### Adding Custom Error Patterns

```typescript
function estimateFixComplexity(error, astContext, depImpact) {
  // Add your own pattern detection:
  if (error.message.includes('your-custom-pattern')) {
    return {
      difficulty: 'moderate',
      estimatedMinutes: 20,
      requiresRefactor: true,
      affectsMultipleFiles: false
    };
  }

  // ... existing logic
}
```

## 📈 Performance & Scalability

**Benchmarks** (on 100 files, ~1200 errors):
- AST Parsing: ~2-3s
- Dependency Graph: ~0.5s
- Error Enrichment: ~1-2s
- Total: ~5-6s

**Large Codebases** (500+ files):
- Use `--top=50` to process incrementally
- AST parsing is cached (won't re-parse unchanged files)
- Consider running overnight for full analysis

## 🐛 Troubleshooting

### "No errors found"
```bash
# Ensure svelte-check log exists:
npx svelte-check > logs/svelte-check.log 2>&1
npm run phase78:ast-rank
```

### "AST parse failed for file X"
- File may have syntax errors preventing AST parse
- System gracefully degrades (uses basic analysis without AST)
- Check file manually: `npx svelte-check --threshold error`

### "Database connection failed"
- AST ranker works without database (outputs JSON only)
- Set `DATABASE_URL` in `.env` if you want DB integration

## 🎯 Best Practices

1. **Run Weekly:** AST analysis should be part of your CI/CD
2. **Fix Top 10 First:** Highest ROI is in top priority errors
3. **Cluster-Based Fixing:** If you see a large cluster, fix the pattern
4. **Monitor Blast Radius:** High blast radius = needs QA review
5. **Incremental Migration:** For Svelte 5, fix high-centrality files first

## 📚 Related Documentation

- [Phase 78 Pipeline](./PHASE78_PIPELINE.md)
- [CUDA Clustering](./PHASE78_CUDA_CLUSTERING.md)
- [LLM Fix Suggestions](./PHASE78_LLM_SUGGESTIONS.md)
- [Svelte 5 Migration Guide](./SVELTE5_MIGRATION.md)

---

**Next Steps:**
```bash
npm run phase78:ast-rank  # Start your AST-aware journey!
```
