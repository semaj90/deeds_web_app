# Phase 78: AST-Aware Error Ranking - Quick Start

## 🚀 TL;DR

```bash
# Run the complete enhanced pipeline
npm run phase78:full

# Or step by step:
npm run phase78:ast-rank      # 1. AST-aware ranking (NEW!)
npm run phase78:insert        # 2. Insert to PostgreSQL
npm run phase78:cluster       # 3. CUDA clustering
npm run phase78:suggest       # 4. LLM fix suggestions
```

## 🎯 What This Does

**Before:** Random error fixing, no architectural awareness
```
❌ Fix errors by file order
❌ No understanding of dependencies
❌ Miss high-impact opportunities
❌ Risk breaking critical paths
```

**After:** Intelligent, graph-aware prioritization
```
✅ Fix highest-impact errors first
✅ Understand dependency ripple effects
✅ Cluster similar errors for batch fixing
✅ Estimate fix difficulty and time
✅ Prioritize by architectural centrality
```

## 📊 Example Output

```
📈 TOP 10 PRIORITY FIXES

1. [Score: 94.2] src/lib/stores/auth.ts:42
   Type 'string | undefined' is not assignable to 'string'
   Difficulty: easy (5min)
   Impact: 23 files | Centrality: 85%
   AST: VariableDeclarator in $state context

   👉 FIX THIS FIRST - Unlocks 23 dependent files!

2. [Score: 91.8] src/routes/+layout.svelte:15
   'export let data' is deprecated, use $props()
   Difficulty: moderate (15min)
   Impact: 1 files | Centrality: 45%

🎯 TOP 5 ERROR CLUSTERS

1. Cluster a3f4b912 (127 errors, avg priority: 82.4)
   Pattern: VariableDeclaration + legacy
   Sample: 'export let' → $props() migration

   👉 BATCH FIX OPPORTUNITY - Same pattern in 127 files
```

## 🧠 How It Works

### 1. **AST Parsing**
Uses `svelte/compiler` to parse each error's context:
- Find exact AST node at error location
- Detect Svelte 5 runes ($state, $derived, $effect)
- Identify script/template/style context

### 2. **Dependency Graph**
Builds complete import/export graph:
- Track all file dependencies
- Calculate centrality (how important is this file?)
- Compute blast radius (how many files affected?)

### 3. **Smart Prioritization**
Scores 0-100 based on:
- **Severity** (error > warning)
- **Centrality** (core files > leaf files)
- **Blast Radius** (high impact > low impact)
- **Fix Difficulty** (easy > hard)
- **Svelte 5 Migration** (legacy patterns boosted)

### 4. **Clustering**
Groups similar errors by pattern:
- Enables batch fixing
- Identifies systemic issues
- Tracks migration progress

## 📁 File Structure

```
sveltekit-frontend/
├── scripts/
│   ├── phase78-ast-aware-ranker.mts    # Main ranker
│   ├── test-ast-ranker.mjs             # Validation tests
│   ├── phase78-insert-errors.mts       # DB insertion
│   ├── phase78-cluster-errors.mts      # CUDA clustering
│   └── phase78-generate-suggestions.mts# LLM suggestions
├── logs/
│   └── svelte-check.log                # svelte-check output
├── svelte-check-errors-index/
│   └── ast-ranked-errors.json          # 👈 AST rankings output
└── docs/
    └── PHASE78_AST_AWARE_RANKING.md    # Full documentation
```

## 🎓 Key Metrics Explained

### Priority Score (0-100)
```
90-100: 🔥 DO NOW    - High impact, easy fix
70-89:  ⚠️  DO SOON   - Important but harder
50-69:  📋 BACKLOG   - Standard priority
0-49:   ⏸️  DEFER     - Low value or risky
```

### Centrality Score (0.0-1.0)
```
0.9-1.0: Critical infrastructure (auth, stores)
0.6-0.8: Core utilities (API clients, helpers)
0.3-0.5: Mid-level components
0.0-0.2: Leaf nodes (pages, simple components)
```

### Blast Radius
```
0-2:   Local change (1-2 files)
3-10:  Module change (shared component)
11-30: Subsystem change (core utility)
31+:   System-wide (foundational code)
```

## 🔧 Commands Reference

| Command | Description |
|---------|-------------|
| `npm run phase78:ast-rank` | Full AST analysis |
| `npm run phase78:ast-rank:top50` | Analyze top 50 files only |
| `npm run phase78:ast-rank:verbose` | Detailed debug output |
| `npm run phase78:ast-rank:test` | Validate system works |
| `npm run phase78:full` | Complete pipeline |

## 💡 Usage Tips

### 1. **Start with Top Priority**
Fix errors with score > 90 first - they're high impact and low risk.

### 2. **Watch for Clusters**
Large clusters (50+ errors) = batch fix opportunity:
```bash
# Find all files with same pattern
jq '.clusters[] | select(.count > 50)' \
   svelte-check-errors-index/ast-ranked-errors.json
```

### 3. **Check Blast Radius**
High blast radius = need thorough testing:
```bash
# Find high-impact files
jq '.rankedErrors[] | select(.dependencyImpact.blastRadius > 20)' \
   svelte-check-errors-index/ast-ranked-errors.json
```

### 4. **Incremental Approach**
Don't fix everything at once:
1. Run `phase78:ast-rank:top50` (faster)
2. Fix top 10 priority errors
3. Run `npm run check:svelte` to verify
4. Repeat

## 🐛 Troubleshooting

**"No errors found"**
```bash
npx svelte-check > logs/svelte-check.log 2>&1
npm run phase78:ast-rank
```

**"AST parse failed"**
- File has syntax errors preventing parse
- System degrades gracefully (basic analysis only)
- Fix syntax errors first

**"Slow on large codebase"**
```bash
npm run phase78:ast-rank:top50  # Analyze incrementally
```

## 📚 Full Documentation

See [`docs/PHASE78_AST_AWARE_RANKING.md`](./docs/PHASE78_AST_AWARE_RANKING.md) for:
- Complete algorithm explanations
- Priority score formula breakdown
- Custom configuration guide
- Advanced use cases
- Performance tuning

## 🎯 Next Steps

1. **Run Test:** `npm run phase78:ast-rank:test`
2. **Review Output:** `cat svelte-check-errors-index/ast-ranked-errors.json | jq`
3. **Fix Top 10:** Start with highest priority errors
4. **Iterate:** Re-run to track progress

---

**Pro Tip:** Bookmark this workflow:
```bash
# Morning routine: Check what to fix today
npm run phase78:ast-rank:top50 && \
jq '.rankedErrors[:5] | .[] | "\(.file):\(.line) [Score: \(.priorityScore)]"' \
   svelte-check-errors-index/ast-ranked-errors.json
```
