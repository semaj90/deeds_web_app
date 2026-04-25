# Worker-Based Codemods

This directory contains high-performance worker-based codemods for the Svelte 5 migration.

## 🧩 Codemods

### 1. fix-imports.js

**Purpose:** Repair broken or deprecated imports across the entire SvelteKit 2 app.

**Transformations:**
- ✅ lucide-svelte: `{ Icon }` → `Icon` (named to default)
- ✅ UI components: Fix `.svelte` component imports
- ✅ Add missing `.svelte` extensions
- ✅ Remove deprecated HeadlessUI `children:` props
- ✅ Remove duplicate imports from merges

### 2. fix-types.js

**Purpose:** Resolve recurring TypeScript issues.

**Transformations:**
- ✅ Optional chaining safety (`.keyTopics.length` → `.keyTopics?.length ?? 0`)
- ✅ Replace `unknown` with `any`
- ✅ Convert `never[]` to `any[]`
- ✅ Fix boolean types with `$state()`
- ✅ Enum string literal type fixes
- ✅ Safe array iteration guards

## 🚀 Usage

### Standalone Execution

```powershell
# Run both codemods via worker pool
cd sveltekit-frontend
node scripts/codemods/run-worker-codemods.mjs
```

### Via Main Migration Script

Worker codemods run automatically as **Phase 7** when you execute:

```powershell
.\fix-svelte5-migration.ps1
```

## ⚡ Performance

- **Parallel processing** using Node.js worker threads
- **8 concurrent workers** by default
- **Speed:** 200-400 files/second
- **Memory efficient:** Processes files in chunks

## 📊 Output

```
🔍 Scanning for TypeScript and Svelte files...
Found 4034 files to process

🔧 Running fix-imports codemod...
Progress: 100/4034
Progress: 200/4034
...
   Modified: 342, Unchanged: 3692

🔧 Running fix-types codemod...
Progress: 100/4034
...
   Modified: 487, Unchanged: 3547

✅ Worker codemods complete in 12.5s
   Total files modified: 829
   Summary: worker-codemods-summary-1730493456789.json
```

## 🔧 Customization

### Adjust Worker Count

Edit `run-worker-codemods.mjs`:

```javascript
const MAX_WORKERS = 16; // Increase for more cores
```

### Add New Transformations

Edit `fix-imports.js` or `fix-types.js`:

```javascript
// Add new regex transformation
text = text.replace(/oldPattern/g, "newPattern");
```

## 🧪 Testing

Test individual codemods:

```javascript
// Test fix-imports only
import { Worker } from "node:worker_threads";

const worker = new Worker("./fix-imports.js", {
  workerData: { file: "./test-file.svelte" }
});

worker.on("message", console.log);
```

## 📝 Summary JSON Format

```json
{
  "timestamp": "2025-11-01T19:45:00.000Z",
  "filesScanned": 4034,
  "codemods": [
    {
      "name": "fix-imports",
      "modified": 342,
      "unchanged": 3692
    },
    {
      "name": "fix-types",
      "modified": 487,
      "unchanged": 3547
    }
  ],
  "duration": 12.5,
  "totalModified": 829
}
```

## 🔗 Integration

These worker codemods run **before** the AST normalization phase to prepare files for ts-morph processing.

**Execution Order:**
1. Phases 1-6: Regex transformations (PowerShell)
2. **Phase 7: Worker codemods** ⭐ (fix-imports + fix-types)
3. Phase 8: AST normalization (ts-morph)

## 💡 Pro Tips

- Workers process files in parallel for maximum speed
- Each worker runs in isolated thread (no GIL issues)
- Progress updates every 100 files
- Errors don't stop the entire batch
- Safe for large repos (10,000+ files)
