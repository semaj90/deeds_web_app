# ⚡ Quick Start: Redis Error Analysis System

**5-Minute Setup Guide** → Get analyzing 100k+ errors immediately

---

## 🎯 What You'll Achieve

- ✅ Analyze **top 100 errors** in < 5 seconds
- ✅ Analyze **top 1,000 errors** in < 10 seconds  
- ✅ Analyze **top 10,000 errors** in < 30 seconds
- ✅ Full codebase scan (3,969 files) in 5-7 minutes
- ✅ Never lose progress to crashes/OOM
- ✅ Automated error fixing pipelines

---

## 📦 Step 1: Prerequisites (2 minutes)

### Install Redis

**Option A: Docker (recommended)**
```bash
docker run -d --name redis-errors -p 6379:6379 redis:7-alpine
```

**Option B: Windows**
```powershell
# Download from https://github.com/microsoftarchive/redis/releases
# Or use WSL2
wsl -d Ubuntu -- sudo apt install redis-server
wsl -d Ubuntu -- redis-server --port 6379
```

**Option C: macOS**
```bash
brew install redis
brew services start redis
```

### Install Node Dependencies

```bash
cd sveltekit-frontend
npm install ioredis p-limit
```

**Verify Setup**
```bash
# Test Redis connection
redis-cli ping
# Should output: PONG

# Test script
node scripts/redis-error-analyzer.mjs --help
```

---

## ⚡ Step 2: First Run (3 minutes)

### Option A: VS Code Tasks (Easiest)

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
2. Type: `Tasks: Run Task`
3. Select: `📊 Error Analysis: Top 100 (Redis Cache)`
4. Wait 3-5 seconds
5. Open `error-top100.json` to see results

### Option B: Command Line

```bash
# Quick cache-only analysis (if cache exists)
node scripts/redis-error-analyzer.mjs --top 100 --cache-only

# Or full scan + top 100 (first run)
node scripts/redis-error-analyzer.mjs --refresh --top 100
```

**Expected Output**:
```
🚀 Redis Error Analyzer
Mode: Full Scan
Target: Top 100 errors
Output: error-analysis.json

✓ Redis connected (DB 1)

📁 Scanning source files...
Found 3,969 files to analyze

🔄 Processing 80 batches (50 files each, 4 parallel)...

[1.2%] Batch 1/80: 50 files → 234 errors (3.2s)
[2.5%] Batch 2/80: 50 files → 189 errors (2.8s)
...
[100.0%] Batch 80/80: 19 files → 67 errors (1.4s)

📊 Generating report for top 100 patterns...

✅ Report saved to error-analysis.json

📈 Summary:
Total patterns: 100
Files scanned: 3,969
Files processed: 3,969
Batches completed: 80
Batches failed: 0
Errors found: 117,434
Elapsed time: 347.2s

🔝 Top 5 errors:
  1. ts(7006): 27,928 occurrences (critical impact, medium automation)
  2. ts(2304): 15,234 occurrences (high impact, high automation)
  3. svelte(missing-declaration): 8,432 occurrences (high impact, medium automation)
  4. ts(2322): 6,891 occurrences (high impact, medium automation)
  5. ts(7006): 5,234 occurrences (medium impact, low automation)
```

---

## 🎨 Step 3: View Results

### JSON Report Format

```json
[
  {
    "code": "ts(7006)",
    "count": 27928,
    "severity": "error",
    "impact": "critical",
    "automation": "medium",
    "priority": 95,
    "files": [
      "src/lib/components/ui/button.svelte",
      "src/routes/dashboard/+page.svelte",
      ...
    ],
    "lastSeen": 1699056000000
  },
  ...
]
```

### Understanding Priority Scores

- **90-100**: Critical - fix immediately (blocks compilation)
- **70-89**: High - fix this week (major type issues)
- **50-69**: Medium - fix this month (warnings, minor issues)
- **0-49**: Low - fix when convenient (style, a11y)

### Automation Levels

- **High**: Can be automated with regex/AST (e.g., `:any` → `unknown`)
- **Medium**: Requires inference (e.g., missing types)
- **Low**: Manual intervention needed (e.g., logic errors)

---

## 🚀 Step 4: Common Workflows

### Workflow 1: Daily Development

```bash
# Morning: Check cache (instant)
node scripts/redis-error-analyzer.mjs --top 100 --cache-only

# After changes: Incremental scan (< 1 min)
node scripts/redis-error-analyzer.mjs --incremental --top 100

# Evening: Full refresh (5-10 min, run before leaving)
node scripts/redis-error-analyzer.mjs --refresh --top 1000
```

### Workflow 2: Deep Analysis

```bash
# 1. Full scan with top 10,000 errors
node scripts/redis-error-analyzer.mjs --refresh --top 10000 --output errors-full.json

# 2. Review automation candidates
cat errors-full.json | jq '[.[] | select(.automation == "high")]'

# 3. Generate fix scripts
node scripts/phase43-master-pipeline.mjs --input errors-full.json
```

### Workflow 3: CI/CD Integration

```yaml
# .github/workflows/error-tracking.yml
name: Error Analysis
on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22
      - run: npm install
      - run: node scripts/redis-error-analyzer.mjs --incremental --top 100
      - uses: actions/upload-artifact@v3
        with:
          name: error-report
          path: error-analysis.json
```

---

## 📊 VS Code Tasks Reference

### Available Tasks (Ctrl+Shift+P → Run Task)

| Task | Speed | Use Case |
|------|-------|----------|
| **Top 100 (Cache)** | < 5s | Quick daily check |
| **Top 1,000 (Cache)** | < 10s | Weekly deep dive |
| **Top 10,000 (Cache)** | < 30s | Monthly full analysis |
| **Refresh Cache** | 5-10 min | After major changes |
| **Incremental Scan** | < 1 min | After commits |

### Task Keybindings (Optional)

Add to `.vscode/keybindings.json`:

```json
[
  {
    "key": "ctrl+shift+e ctrl+1",
    "command": "workbench.action.tasks.runTask",
    "args": "📊 Error Analysis: Top 100 (Redis Cache)"
  },
  {
    "key": "ctrl+shift+e ctrl+r",
    "command": "workbench.action.tasks.runTask",
    "args": "🔄 Refresh Error Cache (Full Scan)"
  }
]
```

---

## 🔧 Optimization Tips

### 1. Adjust Batch Size

```bash
# Low memory system (< 8GB RAM)
node scripts/redis-error-analyzer.mjs --batch-size 25 --parallel 2

# High memory system (> 16GB RAM)
node scripts/redis-error-analyzer.mjs --batch-size 100 --parallel 8
```

### 2. Redis Persistence

```bash
# Enable AOF (Append-Only File) for durability
redis-cli CONFIG SET appendonly yes
redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

### 3. Monitor Redis Memory

```bash
# Check memory usage
redis-cli INFO memory

# If > 500MB, clear old data
redis-cli --scan --pattern 'batch:*' | xargs redis-cli DEL
```

### 4. Speed Up svelte-check

```bash
# Create .svelte-check-ignore
echo "node_modules
.svelte-kit
backups
*.backup.*" > .svelte-check-ignore
```

---

## 🐛 Troubleshooting

### Problem: "Redis connection failed"

**Solution**:
```bash
# Check Redis is running
redis-cli ping

# If not, start it
docker start redis-errors
# OR
redis-server --port 6379 --requirepass redis
```

### Problem: "Out of memory" during scan

**Solution**:
```bash
# Reduce batch size and parallelism
node scripts/redis-error-analyzer.mjs \
  --refresh \
  --batch-size 25 \
  --parallel 2
```

### Problem: "Stale cache data"

**Solution**:
```bash
# Clear Redis cache
redis-cli -n 1 FLUSHDB

# Re-run full scan
node scripts/redis-error-analyzer.mjs --refresh --top 100
```

### Problem: "svelte-check hangs"

**Solution**:
```bash
# Kill hanging processes
taskkill /F /IM svelte-check.exe
# OR on Unix
pkill -9 svelte-check

# Re-run with shorter timeout
export SVELTE_CHECK_TIMEOUT=30000
node scripts/redis-error-analyzer.mjs --refresh
```

---

## 📚 Next Steps

1. **Review Full Documentation**: [REDIS-ERROR-ANALYSIS-HOWTO.md](./REDIS-ERROR-ANALYSIS-HOWTO.md)
2. **Start Fixing Errors**: [PHASE43-EXECUTION-DASHBOARD.md](./PHASE43-EXECUTION-DASHBOARD.md)
3. **Automate Fixes**: Run `node scripts/phase43-master-pipeline.mjs`
4. **Track Progress**: [PHASE43-MASTER-INDEX.md](./PHASE43-MASTER-INDEX.md)

---

## 🎯 Success Metrics

After setup, you should achieve:

- ✅ **< 5 seconds** for top 100 cached analysis
- ✅ **< 10 minutes** for full codebase scan
- ✅ **Zero OOM crashes** during analysis
- ✅ **Persistent cache** surviving restarts
- ✅ **Automation ready** error reports

---

**Status**: ✅ Ready to execute  
**Last Updated**: 2025-11-04  
**Next**: Run your first analysis with `Ctrl+Shift+P` → `Tasks: Run Task` → `📊 Error Analysis: Top 100`
