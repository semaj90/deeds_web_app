# 🎮 VS Code Task Quick Reference

**For**: Phase 43 Error Resolution & AI Analysis  
**Tasks Location**: `.vscode/tasks.json`

---

## 🚀 Available Tasks

### Task 1: "Phase 43: Analyze Top 10k Errors"

**What it does**: Generates error log and categorizes top 10,000 errors

**Command**:
```bash
npx svelte-check --output machine --threshold warning 2>&1 | head -n 10000 > logs/top-10k-errors.log && node scripts/categorize-svelte-check-log.mjs --log logs/top-10k-errors.log --limit 10000 --json
```

**Output**:
- `logs/top-10k-errors.log` - Raw error log (10k lines)
- `logs/top-10k-categorized.json` - Categorized errors with counts

**Use when**: You want to see top error patterns without full analysis

**Time**: 5-10 minutes

---

### Task 2: "Phase 43: Fix Any Types"

**What it does**: Runs QUICK-FIX.bat to fix :any type annotations

**Command**:
```bash
.\QUICK-FIX.bat
```

**What happens**:
1. ✅ Checks service health (Qdrant, Redis, Go RAG, Ollama)
2. 📌 Creates git backup branch
3. 🔧 Runs fix-any-types.mjs (AST-based fixes)
4. 📝 Formats code with Prettier
5. 📊 Shows summary

**Output**:
- `any-type-fixes.json` - Fix report
- Modified source files (with .any-backup)
- Git branch: `fix-any-types-batch1-auto`

**Use when**: Ready to apply automated fixes

**Time**: 15-20 minutes (depends on file count)

---

### Task 3: "Phase 43: AI Analysis"

**What it does**: Complete AI analysis pipeline

**Command**:
```bash
node scripts/ai-analysis-pipeline.mjs
```

**Dependencies**: Runs "Phase 43: Analyze Top 10k Errors" first

**What happens**:
1. 🔍 Checks service availability (Ollama, Qdrant, Go RAG, Redis)
2. 📊 Generates/uses svelte-check log (if not exists)
3. 🗂️ Categorizes errors into JSON
4. 🧠 Generates AI embeddings (via Ollama)
5. 🎯 GPU clustering (via Python)
6. 📈 Outputs recommendations

**Output**:
- `logs/post-fix-svelte-check.log` - Full error log
- `logs/post-fix-categorized.json` - Categorized errors
- `phase43-ai-summary.json` - AI analysis results (if Redis available)
- `phase44-clusters.json` - GPU clusters (if Python + Redis available)

**Use when**: Need deep analysis of error patterns

**Time**: 0.5-5 minutes (depends on cache)

---

## 📋 How to Run Tasks

### Method 1: Command Palette (Recommended)

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type "Tasks: Run Task"
3. Select task from list
4. Task runs in integrated terminal

### Method 2: Keyboard Shortcut

1. Press `Ctrl+Shift+B` (default build task)
2. Runs "Phase 43: Fix Any Types" (marked as default)

### Method 3: Task Menu

1. Click Terminal → Run Task
2. Select task
3. Task runs

---

## 🔧 Task Configuration

### Current Setup (.vscode/tasks.json)

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Phase 43: Analyze Top 10k Errors",
      "type": "shell",
      "command": "npx svelte-check --output machine --threshold warning 2>&1 | head -n 10000 > logs/top-10k-errors.log && node scripts/categorize-svelte-check-log.mjs --log logs/top-10k-errors.log --limit 10000 --json",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "group": "build"
    },
    {
      "label": "Phase 43: Fix Any Types",
      "type": "shell",
      "command": ".\\QUICK-FIX.bat",
      "problemMatcher": [],
      "group": {
        "kind": "build",
        "isDefault": true
      }
    },
    {
      "label": "Phase 43: AI Analysis",
      "type": "shell",
      "command": "node scripts/ai-analysis-pipeline.mjs",
      "problemMatcher": [],
      "dependsOn": ["Phase 43: Analyze Top 10k Errors"]
    }
  ]
}
```

---

## 🎯 Task Flow

### Recommended Order

```
1. Run "Phase 43: Analyze Top 10k Errors"
   ↓
   View logs/top-10k-categorized.json to see top patterns
   ↓
2. Run "Phase 43: Fix Any Types"
   ↓
   Review any-type-fixes.json to see what was fixed
   ↓
3. Run "Phase 43: AI Analysis"
   ↓
   Review phase43-ai-summary.json for recommendations
```

### For Quick Fixes Only

```
Just run: "Phase 43: Fix Any Types"
```

### For Analysis Only

```
1. "Phase 43: Analyze Top 10k Errors"
2. "Phase 43: AI Analysis"
```

---

## ⚙️ Customizing Tasks

### Adding a New Task

**Example**: Create "Fix CSS Syntax" task

```json
{
  "label": "Phase 43: Fix CSS Syntax",
  "type": "shell",
  "command": "node scripts/fix-css-syntax.mjs --apply",
  "problemMatcher": [],
  "group": "build",
  "presentation": {
    "reveal": "always",
    "panel": "new"
  }
}
```

Add this to the `tasks` array in `.vscode/tasks.json`

---

### Task Options Explained

**`label`**: Name shown in VS Code task picker

**`type`**: Usually "shell" for command-line scripts

**`command`**: The actual command to run

**`problemMatcher`**: 
- `[]` = No problem matcher (custom output)
- `"$tsc"` = TypeScript compiler errors
- `"$eslint-stylish"` = ESLint errors

**`group`**:
- `"build"` = Build-related task
- `"test"` = Test task
- `{ "kind": "build", "isDefault": true }` = Default build task (Ctrl+Shift+B)

**`presentation`**:
- `"reveal": "always"` = Always show terminal
- `"panel": "new"` = Open in new terminal panel
- `"focus": true` = Focus terminal when task runs

**`dependsOn`**: Run other tasks first
```json
"dependsOn": ["Task 1", "Task 2"]
```

---

## 🔍 Troubleshooting Tasks

### Task Doesn't Appear in List

**Check**:
1. `.vscode/tasks.json` exists
2. JSON is valid (no syntax errors)
3. Reload VS Code window (Ctrl+Shift+P → "Reload Window")

### Task Fails Immediately

**Check**:
1. Command is correct for your OS (Windows vs Linux)
2. Scripts exist in `scripts/` directory
3. Dependencies installed (`npm install`)
4. Services running (if required)

### Task Output Not Visible

**Add presentation config**:
```json
"presentation": {
  "reveal": "always",
  "panel": "new"
}
```

### Task Takes Too Long

**Options**:
1. Add `--sample 100` flag to test on smaller dataset
2. Use `--dry-run` for fixers
3. Run individual scripts instead of full pipeline

---

## 📊 Task Performance

### Expected Times

```
Task                              Time        Notes
─────────────────────────────────────────────────────────────
Analyze Top 10k Errors            5-10 min    Depends on codebase size
Fix Any Types (dry-run)           30s         Safe testing
Fix Any Types (apply)             15-20 min   Includes formatting
AI Analysis (no cache)            5 min       First run
AI Analysis (cached)              30s         Subsequent runs
```

---

## 🎓 Best Practices

### 1. Always Dry-Run First

```bash
# Modify task temporarily
"command": ".\\QUICK-FIX.bat --dry-run"
```

### 2. Check Git Status Before Running

```bash
git status
# Should be on a feature branch, not main
```

### 3. Review Outputs Before Next Step

```bash
# After "Analyze Top 10k Errors"
cat logs/top-10k-categorized.json | jq '.buckets[:5]'

# After "Fix Any Types"
git diff --stat

# After "AI Analysis"
cat phase43-ai-summary.json | jq '.recommendations'
```

### 4. Commit After Each Major Change

```bash
git add -A
git commit -m "fix: [description of changes]"
```

---

## 🚀 Power User Tips

### Run Multiple Tasks in Sequence

**Create compound task**:
```json
{
  "label": "Phase 43: Complete Pipeline",
  "dependsOn": [
    "Phase 43: Analyze Top 10k Errors",
    "Phase 43: Fix Any Types",
    "Phase 43: AI Analysis"
  ],
  "group": "build"
}
```

### Background Tasks

**For long-running analysis**:
```json
{
  "label": "Phase 43: Background Analysis",
  "type": "shell",
  "command": "node scripts/ai-analysis-pipeline.mjs",
  "isBackground": true,
  "problemMatcher": {
    "owner": "custom",
    "pattern": {
      "regexp": "^(.*)$",
      "file": 1
    },
    "background": {
      "activeOnStart": true,
      "beginsPattern": "^Starting",
      "endsPattern": "^Complete"
    }
  }
}
```

### Task with Input Variables

**Prompt for sample size**:
```json
{
  "label": "Phase 43: Custom Sample Size",
  "type": "shell",
  "command": "node scripts/fix-any-types.mjs --sample ${input:sampleSize}",
  "problemMatcher": []
}
```

Then add to `tasks.json`:
```json
"inputs": [
  {
    "id": "sampleSize",
    "type": "promptString",
    "description": "How many files to sample?",
    "default": "100"
  }
]
```

---

## 📁 Related Files

```
.vscode/
  tasks.json              ← Task definitions
  settings.json           ← Workspace settings
  launch.json             ← Debug configs

scripts/
  fix-any-types.mjs       ← AST fixer
  categorize-*.mjs        ← Error categorizer
  ai-analysis-pipeline.mjs ← AI orchestrator
  phase44-tensor-loader.py ← GPU clustering

logs/
  top-10k-errors.log      ← Raw errors
  top-10k-categorized.json ← Categorized
  post-fix-svelte-check.log ← Full log

QUICK-FIX.bat             ← Windows batch script
HOW-IT-WORKS-COMPLETE-GUIDE.md ← Full tech docs
```

---

## 🆘 Getting Help

### Check Logs

```bash
# VS Code Output panel
View → Output → Select "Tasks" from dropdown

# Or check log files directly
cat logs/top-10k-errors.log | tail -n 50
```

### Enable Debug Output

**Add to task**:
```json
"options": {
  "env": {
    "DEBUG": "*"
  }
}
```

### Common Issues & Fixes

**Issue**: "command not found"  
**Fix**: Check script path, ensure it's executable

**Issue**: "Permission denied"  
**Fix**: `chmod +x scripts/*.mjs`

**Issue**: "Services offline"  
**Fix**: Check service status, tasks work in degraded mode

**Issue**: "Out of memory"  
**Fix**: Reduce sample size with `--sample 100` flag

---

**Quick Start**: Press `Ctrl+Shift+B` → Runs "Fix Any Types" task!

**Documentation**: See `HOW-IT-WORKS-COMPLETE-GUIDE.md` for full technical details
