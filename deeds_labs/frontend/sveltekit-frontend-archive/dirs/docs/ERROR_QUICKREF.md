# 🎯 Error Analysis Quick Reference

> **1-page cheat sheet for the YoRHa Legal AI Error Consolidation System**

---

## ⚡ Most Common Commands

```bash
# Before every commit
npm run errors:all

# Weekly maintenance
npm run errors:pipeline

# Quick C++ check
npm run cpp:check

# Quick TypeScript check
npm run check:svelte

# View consolidated errors
cat logs/all-errors-consolidated.json | jq '.summary'

# View error trends
npm run errors:monitor

# AI clustering (weekly)
npm run errors:cluster
```

---

## 📊 npm Scripts Overview

| Command | Time | Purpose |
|---------|------|---------|
| `cpp:check` | ~2min | Check C++ compile + runtime errors |
| `check:svelte` | ~30s | Check TypeScript/Svelte errors |
| `errors:consolidate` | <1s | Merge TS + C++ errors |
| `errors:monitor` | <1s | View error rate trends |
| `errors:cluster` | ~5min | AI semantic clustering |
| `errors:all` | ~3min | Full check + consolidate + monitor |
| `errors:pipeline` | ~8min | Complete workflow with AI |

---

## 🔍 Error Categories

| Category | Examples | Where |
|----------|----------|-------|
| **CUDA** | `cudaMalloc`, kernel launch | C++ GPU code |
| **LibTorch** | Tensor shape, device mismatch | C++ ML code |
| **MSVC** | C2664, C2679, LNK2019 | C++ compile |
| **TypeScript** | Implicit any, missing types | TS/Svelte |
| **N-API** | JS ↔ C++ boundary errors | Native addons |

---

## 📁 Output Files

```
logs/
├── cpp-errors-analysis.json       # C++ errors
├── svelte-errors.json             # TypeScript errors
├── all-errors-consolidated.json   # Unified report ⭐
├── error-rate-history.json        # 30-day trends
├── error-rate-summary.json        # CI/CD summary
└── error-clusters.json            # AI clusters
```

**Key file:** `all-errors-consolidated.json` - Start here!

---

## 🎯 VS Code Tasks

**Access:** `Ctrl+Shift+P` → "Tasks: Run Task"

- **🔧 C++ Error Check** - Parse MSVC/CUDA errors
- **📊 Consolidate All Errors** - Merge TS + C++
- **📈 Monitor Error Trends** - View 30-day stats
- **🧠 Cluster Errors (AI)** - Semantic grouping
- **🚀 Full Error Pipeline** - Complete workflow

---

## 🚨 Error Severity

| Level | CI/CD | Pre-commit |
|-------|-------|------------|
| **CRITICAL** | ❌ Fail | 🚫 Block |
| **ERROR** | ❌ Fail | 🚫 Block |
| **WARNING** | ⚠️ Pass | ✅ Allow |
| **INFO** | ✅ Pass | ✅ Allow |

---

## 📊 Viewing Reports

### Summary Stats
```bash
cat logs/all-errors-consolidated.json | jq '.summary'
```

### Top Error Hotspots
```bash
cat logs/all-errors-consolidated.json | jq '.hotspots[:5]'
```

### Error Patterns
```bash
cat logs/all-errors-consolidated.json | jq '.patterns.byCategory'
```

### Recent Trends
```bash
cat logs/error-rate-history.json | jq '.snapshots[-7:]'
```

### Top AI Clusters
```bash
cat logs/error-clusters.json | jq '.clusters[:3]'
```

---

## 🔧 C++ Error Logging

### Log an Error
```cpp
#include "error-logger.hpp"

CPP_LOG_ERROR("CUDA", "Failed to allocate memory", "CUDA_ERROR");
```

### Check CUDA Calls
```cpp
CUDA_CHECK(cudaMalloc(&d_data, size));
```

### Check LibTorch
```cpp
TORCH_CHECK_ERROR(
  model.load_from_file("model.pt"),
  "Model load failed"
);
```

### Export Errors to JS
```cpp
Napi::Value ExportErrors(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), ErrorLogger::Logger::getInstance().toJSON());
}
```

---

## 🔄 Daily Workflow

```bash
# 1. Morning: Check current state
npm run errors:monitor

# 2. During dev: Quick checks
npm run cpp:check     # After C++ changes
npm run check:svelte  # After TS changes

# 3. Before commit: Full check
npm run errors:all

# 4. If errors: View details
cat logs/all-errors-consolidated.json | jq '.hotspots'

# 5. Fix and verify
# ... make fixes ...
npm run errors:all

# 6. Commit (auto-checks via pre-commit hook)
git commit -m "Fix X"
```

---

## 🚀 Weekly Maintenance

```bash
# Monday: Full pipeline with AI clustering
npm run errors:pipeline

# Review top clusters
cat logs/error-clusters.json | jq '.clusters[:5]'

# Check for anomalies
npm run errors:monitor | grep "Anomaly"

# Fix clustered errors in batches
# ... apply fixes from AI suggestions ...

# Verify improvements
npm run errors:all
```

---

## 🐛 Troubleshooting

### C++ Errors Not Detected
```bash
# Rebuild with logging
npm run cpp:clean && npm run cpp:build

# Check log output
cat logs/cpp-errors.log
```

### Ollama Embeddings Fail
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Pull model if missing
ollama pull embeddinggemma:latest
```

### Pre-commit Hook Not Working
```bash
# Make executable
chmod +x .husky/pre-commit

# Test manually
./.husky/pre-commit
```

### WebGPU Clustering Unavailable
```bash
# Verify endpoint
curl http://localhost:5173/api/v1/webgpu/cluster

# Fallback: k-means runs automatically
```

---

## 🔐 Exit Codes

```bash
# Check exit code
npm run errors:all
echo $?  # 0 = success, 1 = critical errors, 2 = anomaly

# Use in scripts
if npm run errors:all; then
  echo "✅ No critical errors"
else
  echo "❌ Errors found - check logs"
fi
```

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| **ERROR_ANALYSIS.md** | Complete system guide |
| **CPP_CHECK.md** | C++ error logging deep dive |
| **ERROR_CONSOLIDATION_BUILD.md** | What was built |
| **ERROR_QUICKREF.md** | This file (cheat sheet) |
| **TECH-STACK-INTEGRATION.md** | Node.js ↔ CUDA integration |

---

## 🎓 Key Concepts

### Error Similarity (Jaccard Index)
- Compares tokenized error messages
- Threshold: 0.7 for grouping
- Groups cascading failures

### Anomaly Detection
- Statistical: Z-score > 2σ
- Spike: >50% increase from previous
- Trend: % change over 7 days

### Error Hotspots
- Top 10 files with most errors
- Aggregates by category/severity
- Prioritizes fix efforts

### AI Clustering
- Embeddings: Ollama (768-d)
- Clustering: WebGPU SOM or k-means
- Fix suggestions: Gemma3-legal

---

## 💡 Pro Tips

1. **Run `errors:all` before every commit** (or rely on pre-commit hook)
2. **Use `errors:cluster` weekly** to batch-fix similar errors
3. **Monitor trends** to catch error spikes early
4. **Check hotspots** to prioritize refactoring
5. **Export reports** for team reviews

---

## 🔗 Quick Links

- **C++ Error Logger:** `src/native/error-logger.hpp`
- **Error Parser:** `scripts/cpp-error-check.mjs`
- **Consolidation:** `scripts/merge-error-reports.mjs`
- **Monitoring:** `scripts/monitor-error-rate.mjs`
- **Clustering:** `scripts/cluster-errors.mjs`
- **Pre-commit:** `.husky/pre-commit`

---

## 📞 Need Help?

```bash
# View full documentation
cat docs/ERROR_ANALYSIS.md

# Check logs
ls -la logs/*.json

# Test specific component
npm run cpp:check      # C++ only
npm run check:svelte   # TS only
npm run errors:monitor # Trends only
```

---

**Last Updated:** January 2025
**Version:** 1.0.0
**Status:** ✅ Production Ready

---

**Print this page for quick reference during development!**
