# Phase 72/78/82 Error-Fixing Automation - Integration Guide

**Status:** ✅ INTEGRATED (February 2, 2026)
**Error Count:** 928 (27 errors from integration, ready to optimize)

## 🎯 What We Just Integrated

### Phase 72: AI-Powered Error Suggestions
**8 API Endpoints → 3 Active:**
- `POST /api/phase72/capture-error` - Store errors in DB with deduplication
- `POST /api/phase72/summary` - Get error summary statistics
- `POST /api/phase72/suggest-fix` - **Get AI fix suggestions from Ollama**

### Phase 78: AST Graph Analysis
**3 API Endpoints:**
- `POST /api/phase78/graph` - Generate AST topology graph
- `POST /api/phase78/playwright-check` - Route health checks
- `POST /api/phase78/routes` - Discover all routes in codebase

### Phase 82: Svelte 5 Runes Codemod
**2 API Endpoints:**
- `GET /api/phase82/status` - Check upgrade status
- `POST /api/phase82/upgrade-route` - **Auto-upgrade route to Svelte 5 runes**

### Error-Brain UI
**3 Pages:**
- `/error-brain` - Dashboard for error analysis
- `/error-brain/patches` - View applied patches
- `/error-brain/runs` - Historical error fix runs

---

## 🚀 Quick Start: Using The Error-Fixing Tools

### 1. Get AI Suggestion for Current Errors

```powershell
# Get AI-powered fix for a TypeScript error
$error = @{
    file_path = "src/lib/components/SimpleDragDrop.svelte"
    line = 12
    col = 8
    code = "TS2307"
    severity = "error"
    message = "Cannot find module 'lucide-svelte' or its corresponding type declarations"
    route = "/upload"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5173/api/phase72/suggest-fix" `
    -Method Post -Body $error -ContentType "application/json"
```

**Response:**
```json
{
  "plan": "### Fix Suggestions\n\n1. Install lucide-svelte\n2. Fix import path",
  "suggestions": [
    "npm install lucide-svelte",
    "import Upload from 'lucide-svelte/icons/upload';"
  ],
  "related_routes": ["/upload"]
}
```

### 2. Auto-Upgrade Route to Svelte 5 Runes

```powershell
# Automatically upgrade a route to use Svelte 5 $state/$effect
$upgrade = @{
    route = "/cases/[id]"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5173/api/phase82/upgrade-route" `
    -Method Post -Body $upgrade -ContentType "application/json"
```

**What It Does:**
- Converts `let x = ...` → `let x = $state(...)`
- Converts `$: y = ...` → `$effect(() => { ... })`
- Converts `onMount` → `$effect`
- Converts component props to `interface Props`

### 3. Analyze AST Graph

```powershell
# Generate AST topology graph for error analysis
$graph = @{
    targetPath = "src/routes/(app)/cases"
    includeComponents = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5173/api/phase78/graph" `
    -Method Post -Body $graph -ContentType "application/json"
```

### 4. Check Route Health

```powershell
# Run Playwright health checks on all routes
Invoke-RestMethod -Uri "http://localhost:5173/api/phase78/playwright-check" `
    -Method Post -ContentType "application/json"
```

---

## 📊 Error-Brain UI Usage

### Access Dashboard
Navigate to: `http://localhost:5173/error-brain`

**Features:**
- **Real-time error tracking** - See captured errors from development
- **AI suggestions** - View AI-generated fixes
- **Batch operations** - Run automated fix sessions
- **Historical analysis** - Review past error-fixing runs

### Creating a Fix Run

1. Go to `/error-brain`
2. Click "Create New Run"
3. Select error categories to fix
4. Review AI suggestions
5. Apply fixes (manual or automated)

### Viewing Patches

Navigate to: `http://localhost:5173/error-brain/patches`

See all applied code patches with:
- Before/after diffs
- Success/failure status
- Rollback capability

---

## 🧠 Architecture: How It Works

```
Development (npm run dev)
    ↓
TypeScript/Svelte Errors Detected
    ↓
POST /api/phase72/capture-error
    ↓ (stores in PostgreSQL)
phase72_error table (deduplicated)
    ↓
POST /api/phase72/suggest-fix
    ↓ (calls)
Ollama (gemma3-legal:latest) OR Fallback Logic
    ↓ (returns)
AI Fix Suggestions
    ↓ (displays in)
Error-Brain UI or Terminal
    ↓ (optionally)
POST /api/phase82/upgrade-route
    ↓ (applies)
Automated Code Transformation
    ↓
Fixed Code ✅
```

---

## 🔧 Integration with Existing Workflow

### Option 1: Terminal Watcher (Automated)

**Use Phase 72 dev watcher** to automatically capture + suggest fixes:

```powershell
# Watch dev server and auto-suggest fixes
node scripts/phase72-watch-dev.mjs
```

**What It Does:**
1. Spawns `npm run dev`
2. Parses stdout/stderr for errors
3. POSTs errors to `/api/phase72/capture-error`
4. Calls `/api/phase72/suggest-fix`
5. Displays AI suggestions in terminal

### Option 2: Manual API Calls

Use PowerShell/curl to manually send errors:

```powershell
# Capture current svelte-check errors
$errors = npx svelte-check --threshold error 2>&1 |
    Select-String -Pattern "Error" |
    ForEach-Object {
        # Parse error and POST to /api/phase72/capture-error
    }
```

### Option 3: Error-Brain UI (Visual)

1. Start dev server: `npm run dev`
2. Navigate to `/error-brain`
3. Click "Scan for Errors"
4. Review AI suggestions
5. Apply fixes with one click

---

## 📈 Success Metrics

**Before Integration:**
- ✅ 901 errors (after lucide migration)
- ✅ TWO milestones achieved (sub-1000, sub-900)

**After Integration:**
- 🔄 928 errors (+27 from new routes)
- ✅ 8 API endpoints active
- ✅ Error-brain UI accessible
- ✅ AI-powered suggestions available
- ✅ Svelte 5 auto-upgrade ready

**Next Steps:**
1. Test Phase 72 suggest-fix on remaining 928 errors
2. Use Phase 82 upgrade-route on high-error files
3. Leverage AST graph analysis for complex refactors
4. Monitor error-brain UI for automated fix opportunities

---

## 🛠️ Configuration

### Environment Variables

```env
# .env or .env.local
PHASE72_BACKEND_URL=http://127.0.0.1:8000  # Optional: External Ollama instance
OLLAMA_BASE_URL=http://localhost:11434      # Local Ollama for AI suggestions
OLLAMA_MODEL=gemma3-legal:latest            # Model for error analysis
```

### Database Setup

Phase 72 requires `phase72_error` table:

```sql
CREATE TABLE phase72_error (
  id SERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  line INT NOT NULL,
  col INT NOT NULL,
  code TEXT,
  severity TEXT,
  message TEXT NOT NULL,
  route TEXT,
  error_hash TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🎯 Use Cases

### Use Case 1: Fix Remaining Lucide Imports

**Problem:** 200-300 lucide errors with complex aliased imports

**Solution:**
```powershell
# Get AI suggestion for complex aliased import
$error = @{
    file_path = "src/lib/components/ReportEditor.svelte"
    code = "TS2307"
    message = "Cannot find module 'lucide-svelte'"
} | ConvertTo-Json

$suggestion = Invoke-RestMethod -Uri "http://localhost:5173/api/phase72/suggest-fix" `
    -Method Post -Body $error -ContentType "application/json"

Write-Host $suggestion.plan
# AI will suggest: "Convert aliased imports to individual icon imports"
```

### Use Case 2: Batch Upgrade Routes to Svelte 5

**Problem:** 100+ routes still using Svelte 4 syntax

**Solution:**
```powershell
# Get all routes with errors
$routes = Invoke-RestMethod -Uri "http://localhost:5173/api/phase78/routes"

# Auto-upgrade each route
$routes | ForEach-Object {
    $upgrade = @{ route = $_.path } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:5173/api/phase82/upgrade-route" `
        -Method Post -Body $upgrade -ContentType "application/json"
}
```

### Use Case 3: Analyze Error Clusters

**Problem:** 928 errors across 398 files, need prioritization

**Solution:**
```powershell
# Generate AST graph to find error hotspots
$graph = Invoke-RestMethod -Uri "http://localhost:5173/api/phase78/graph" `
    -Method Post -ContentType "application/json"

# Visualize in error-brain UI
Start-Process "http://localhost:5173/error-brain"
```

---

## 🚨 Known Issues

### Issue 1: +27 Errors from Integration

**Errors:** 901 → 928 (+27)

**Root Cause:** New API routes may have TypeScript/import errors

**Fix:**
1. Run svelte-check on new files:
   ```powershell
   npx svelte-check --threshold error --tsconfig ./tsconfig.json
   ```
2. Use `/api/phase72/suggest-fix` on each error
3. Apply fixes manually or via error-brain UI

### Issue 2: Ollama Not Configured

**Error:** `Phase72 backend not configured, returning placeholder suggestions`

**Fix:**
1. Start Ollama: `ollama serve`
2. Pull model: `ollama pull gemma3-legal:latest`
3. Set env var: `OLLAMA_BASE_URL=http://localhost:11434`

---

## 📚 Related Documentation

- `PHASE72_BRAIN_SETUP.md` - Original Phase 72 setup guide
- `PHASE_72_78_COMPLETE.md` - Phase 72-78 integration details
- `PROSECUTOR_MVP_FULLY_WORKING.md` - Phase 82 upgrade system
- `scripts/phase72-watch-dev.mjs` - Terminal watcher implementation
- `scripts/phase82-svelte-runes-codemod.mjs` - Svelte 5 codemod

---

**Ready to accelerate error fixing with AI!** 🚀

**Next Action:** Test Phase 72 suggest-fix on top 10 error files
