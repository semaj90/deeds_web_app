# 🛠️ Unified Error Analysis System

> **Comprehensive TypeScript + C++ error detection, consolidation, and AI-powered clustering**

## 📖 Table of Contents

- [Quick Start](#quick-start)
- [System Architecture](#system-architecture)
- [Error Categories](#error-categories)
- [npm Scripts Reference](#npm-scripts-reference)
- [VS Code Tasks](#vs-code-tasks)
- [Workflows](#workflows)
- [Advanced Features](#advanced-features)
- [Integration with Phase72](#integration-with-phase72)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Check All Errors (TypeScript + C++)
```bash
npm run errors:all
```

### Full Pipeline with AI Clustering
```bash
npm run errors:pipeline
```

### Check Individual Components
```bash
# TypeScript errors only
npm run check:svelte

# C++ errors only
npm run cpp:check

# View consolidated report
cat logs/all-errors-consolidated.json
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Error Detection Layer                      │
├──────────────────────┬──────────────────────────────────────┤
│   TypeScript/Svelte  │         C++ Components               │
│   (svelte-check)     │   (MSVC + CUDA + LibTorch)           │
├──────────────────────┴──────────────────────────────────────┤
│                  scripts/cpp-error-check.mjs                 │
│            Parses: MSVC, CUDA, Runtime errors                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│             scripts/merge-error-reports.mjs                  │
│  • Normalizes TS + C++ errors to common schema              │
│  • Calculates error similarity (Jaccard index)              │
│  • Groups related errors (cascading failures)               │
│  • Identifies error hotspots                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ├──► logs/all-errors-consolidated.json
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│             scripts/monitor-error-rate.mjs                   │
│  • Tracks 30-day error rate history                         │
│  • Detects trends (stable/increasing/decreasing)            │
│  • Statistical anomaly detection (>2σ)                      │
│  • Spike detection (>50% increase)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ├──► logs/error-rate-history.json
                       ├──► logs/error-rate-summary.json
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               scripts/cluster-errors.mjs                     │
│  • Generates embeddings with Ollama (gemma:latest)          │
│  • Clusters with WebGPU SOM (k-means fallback)              │
│  • AI-generated fix suggestions (gemma3-legal)              │
│  • Batch fixing recommendations                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       └──► logs/error-clusters.json
```

---

## 📊 Error Categories

### 1️⃣ **CUDA Errors** (C++ Components)
- **Memory**: `cudaMalloc`, `cudaMemcpy` failures
- **Kernels**: Launch configuration, shared memory
- **Synchronization**: Stream operations, event timing

**Example:**
```cpp
// Error detected by error-logger.hpp
CUDA_CHECK(cudaMalloc(&d_data, size));
// If fails: logs to cpp-errors.log → parsed by cpp-error-check.mjs
```

### 2️⃣ **LibTorch Errors** (C++ Components)
- **Tensor Operations**: Shape mismatches, dtype errors
- **Device Mismatches**: CPU vs CUDA tensor operations
- **Model Loading**: Serialization, architecture issues

**Example:**
```cpp
TORCH_CHECK_ERROR(
  model.load_from_file("model.pt"),
  "Failed to load model"
);
```

### 3️⃣ **MSVC Compiler Errors** (C++ Build)
- **Syntax Errors**: Missing semicolons, braces
- **Type Errors**: C2664, C2679, C2440
- **Linker Errors**: LNK2019, LNK2001

**Captured from:** `cmake --build build --config Release` output

### 4️⃣ **TypeScript/Svelte Errors**
- **Type Errors**: Implicit any, missing properties
- **Svelte 5 Runes**: `$state`, `$derived`, `$effect`
- **Import Errors**: Missing modules, barrel exports

**Captured from:** `svelte-check --output machine`

---

## 📝 npm Scripts Reference

### Error Checking
| Script | Description | Output |
|--------|-------------|--------|
| `npm run cpp:check` | Analyze C++ errors (compile + runtime) | Terminal summary |
| `npm run cpp:check:json` | C++ errors with JSON export | `logs/cpp-errors-analysis.json` |
| `npm run check:svelte` | TypeScript/Svelte type checking | `logs/svelte-errors.json` |

### Error Consolidation
| Script | Description | Output |
|--------|-------------|--------|
| `npm run errors:consolidate` | Merge TS + C++ errors | `logs/all-errors-consolidated.json` |
| `npm run errors:monitor` | Track error rate trends | `logs/error-rate-history.json` |
| `npm run errors:cluster` | AI-powered error clustering | `logs/error-clusters.json` |
| `npm run errors:all` | Check → Consolidate → Monitor | All reports |
| `npm run errors:pipeline` | Full pipeline with clustering | All reports + clusters |

### C++ Build
| Script | Description |
|--------|-------------|
| `npm run cpp:build` | Compile C++ components (Release) |
| `npm run cpp:clean` | Clean build artifacts |

---

## 🎯 VS Code Tasks

Access via **Terminal → Run Task** or `Ctrl+Shift+P` → "Tasks: Run Task"

| Task | Shortcut | Description |
|------|----------|-------------|
| **🔧 C++ Error Check** | - | Run C++ error analysis with problemMatcher |
| **📊 Consolidate All Errors** | - | Merge TS + C++ errors |
| **📈 Monitor Error Trends** | - | View 30-day error rate analysis |
| **🧠 Cluster Errors (AI)** | - | Semantic clustering with Ollama |
| **🚀 Full Error Pipeline** | - | Complete workflow (check → cluster) |

**Problem Matcher Configuration:**
```jsonc
"problemMatcher": {
  "owner": "cpp",
  "fileLocation": "absolute",
  "pattern": {
    "regexp": "^(.+)\\((\\d+),(\\d+)\\):\\s+(error|warning)\\s+(C\\d+):\\s+(.+)$",
    // Captures: file(line,col): error C2664: message
  }
}
```

---

## 🔄 Workflows

### Daily Development Cycle
```bash
# 1. Make changes to TS or C++ code
# 2. Run full error check
npm run errors:all

# 3. If errors found, view consolidated report
cat logs/all-errors-consolidated.json | jq '.hotspots[:5]'

# 4. Fix errors based on recommendations
# 5. Verify fixes
npm run errors:all
```

### CI/CD Integration (GitHub Actions)
```yaml
name: Error Analysis Pipeline

on: [push, pull_request]

jobs:
  analyze:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run error analysis
        run: npm run errors:pipeline

      - name: Check for critical errors
        run: |
          $summary = Get-Content logs/error-rate-summary.json | ConvertFrom-Json
          if ($summary.criticalErrors -gt 0) {
            Write-Host "❌ Critical errors detected: $($summary.criticalErrors)"
            exit 1
          }

      - name: Upload error reports
        uses: actions/upload-artifact@v3
        with:
          name: error-reports
          path: logs/*.json
```

### Pre-commit Hook (Automatic)
```bash
# Installed at .husky/pre-commit
# Blocks commits with critical errors

git commit -m "Add feature"
# → Runs: npm run check:svelte && npm run cpp:check
# → If errors: commit blocked
# → Bypass: git commit --no-verify
```

---

## 🚀 Advanced Features

### 1️⃣ Error Similarity Analysis
**Algorithm:** Jaccard similarity on tokenized error messages

```javascript
// merge-error-reports.mjs
function calculateSimilarity(err1, err2) {
  const tokens1 = new Set(err1.message.toLowerCase().match(/\w+/g));
  const tokens2 = new Set(err2.message.toLowerCase().match(/\w+/g));

  const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;

  return intersection / union; // Jaccard index
}
```

**Use case:** Identify cascading errors (threshold: 0.7)

### 2️⃣ Statistical Anomaly Detection
**Algorithm:** Z-score > 2σ from 30-day mean

```javascript
// monitor-error-rate.mjs
const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
const variance = counts.reduce((sum, x) => sum + (x - mean) ** 2, 0) / counts.length;
const stdDev = Math.sqrt(variance);

const zScore = (current - mean) / stdDev;
if (zScore > 2) {
  anomalies.push({ type: 'statistical', zScore });
}
```

### 3️⃣ AI-Powered Clustering
**Tech Stack:**
- **Embeddings:** Ollama `embeddinggemma:latest` (768-d vectors)
- **Clustering:** WebGPU SOM (Self-Organizing Map)
- **Fix Generation:** Gemma3-legal model

**Workflow:**
```bash
npm run errors:cluster
# 1. Loads logs/all-errors-consolidated.json
# 2. Generates embeddings for each error
# 3. Clusters with WebGPU SOM (k=10)
# 4. Generates fix suggestions for top 5 clusters
# 5. Exports to logs/error-clusters.json
```

**Output Format:**
```json
{
  "clusters": [
    {
      "id": 0,
      "size": 45,
      "topCategory": "CUDA",
      "representative": {
        "file": "src/native/cuda_kernels.cu",
        "line": 234,
        "message": "cudaMalloc failed: out of memory"
      },
      "fixSuggestion": "Root cause: GPU memory fragmentation...\nFix: 1. Reduce batch size 2. Use memory pools..."
    }
  ]
}
```

### 4️⃣ Error Hotspot Identification
**Algorithm:** Top 10 files with most errors

```bash
# View hotspots from consolidated report
cat logs/all-errors-consolidated.json | jq '.hotspots'

# Example output:
[
  {
    "file": "src/lib/components/ui/CommandMenu.svelte",
    "count": 23,
    "categories": { "TypeScript": 18, "Svelte": 5 },
    "avgSeverity": "error"
  }
]
```

---

## 🔗 Integration with Phase72

### Phase72 GPU Pipeline Integration
```bash
# Phase72: GPU-accelerated error clustering with Qdrant + Redis
npm run phase72:cluster-errors

# Internally calls:
# 1. errors:all (consolidate errors)
# 2. Generate embeddings with Ollama
# 3. Store in Qdrant vector DB
# 4. Cache in Redis (30-day TTL)
# 5. Cluster with CUDA k-means
# 6. Export to Phase72 format
```

### Phase72 Merge Script
```bash
# Merge C++ errors into Phase72 pipeline
node scripts/merge-error-reports.mjs \
  --ts logs/svelte-errors.json \
  --cpp logs/cpp-errors-analysis.json \
  --output logs/phase72-input.json

# Phase72 processes unified format:
# {
#   "errors": [
#     {
#       "file": "...",
#       "line": 123,
#       "message": "...",
#       "category": "CUDA",
#       "severity": "error",
#       "embedding": [0.123, 0.456, ...] // Added by Phase72
#     }
#   ]
# }
```

---

## 🐛 Troubleshooting

### Issue: C++ errors not detected
**Solution:**
```bash
# Verify error logger is included
grep -r "error-logger.hpp" src/native/

# Check logs output
ls -la logs/cpp-errors.log

# Rebuild with logging enabled
npm run cpp:clean && npm run cpp:build
```

### Issue: Embedding generation fails
**Solution:**
```bash
# Check Ollama service
curl http://localhost:11434/api/tags

# Verify model installed
ollama list | grep embeddinggemma

# Pull model if missing
ollama pull embeddinggemma:latest
```

### Issue: WebGPU clustering unavailable
**Fallback:** Simple k-means clustering runs automatically

```bash
# Verify WebGPU endpoint
curl http://localhost:5173/api/v1/webgpu/cluster

# If down: cluster-errors.mjs uses simpleClustering() fallback
```

### Issue: Pre-commit hook not running
**Solution:**
```bash
# Install husky (if not already)
npm install husky --save-dev
npx husky install

# Make hook executable (Unix)
chmod +x .husky/pre-commit

# Test manually
./.husky/pre-commit
```

---

## 📚 Related Documentation

- **[CPP_CHECK.md](./CPP_CHECK.md)** - Deep dive into C++ error logging
- **[TECH-STACK-INTEGRATION.md](./TECH-STACK-INTEGRATION.md)** - Node.js ↔ CUDA integration
- **[Phase72 Pipeline](../phase-72-ingestion/README.md)** - GPU acceleration architecture

---

## 🎯 Best Practices

### 1️⃣ **Run error checks before committing**
```bash
git add .
npm run errors:all
git commit -m "Feature X"
```

### 2️⃣ **Monitor error trends weekly**
```bash
# View 7-day trend
cat logs/error-rate-history.json | jq '.snapshots[-7:]'

# Check for anomalies
npm run errors:monitor | grep "Anomalies Detected"
```

### 3️⃣ **Use AI clustering for batch fixing**
```bash
npm run errors:cluster

# Fix top cluster (e.g., 45 CUDA memory errors)
# Single fix applies to all related errors
```

### 4️⃣ **Integrate with CI/CD**
- Fail builds on critical errors
- Upload error reports as artifacts
- Track error rate over time

---

## 📊 Performance Metrics

| Operation | Time | Notes |
|-----------|------|-------|
| TypeScript check | ~30s | svelte-check full pass |
| C++ build + check | ~2min | CMake Release build |
| Error consolidation | <1s | JSON merge + analysis |
| Error monitoring | <500ms | Read history + detect anomalies |
| Embedding generation | ~5min | 100 errors @ 3s/error |
| WebGPU clustering | ~10s | 100 errors, k=10 |
| Full pipeline | ~8min | Check → Consolidate → Cluster |

**Optimization Tips:**
- Use `--incremental` for CI/CD (only changed files)
- Cache embeddings in Redis (Phase72)
- Run clustering weekly, not on every commit

---

## 🔐 Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | No critical errors | Safe to proceed |
| 1 | Critical errors found | Fix before committing |
| 2 | Anomaly detected | Investigate error spike |

---

## 📞 Support

- **Issues:** File GitHub issue with `error-analysis` label
- **Logs:** Check `logs/*.json` for detailed reports
- **VS Code:** Use Tasks panel for interactive workflows

---

**Built with ❤️ for the YoRHa Legal AI Platform**
