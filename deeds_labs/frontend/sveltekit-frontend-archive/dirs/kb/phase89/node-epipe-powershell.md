# Node.js EPIPE Errors with PowerShell Pipes

**Category**: Operations Knowledge Base
**Phase**: 89
**Tags**: node, powershell, epipe, pipes, select-object, operations

---

## 🎯 Problem

Running Node.js scripts that write to stdout and piping them to PowerShell's `Select-Object -First N` causes **EPIPE crashes**:

```powershell
# ❌ THIS CRASHES
node scripts/phase89-cuda-rag-pipeline.mjs --build | Select-Object -First 50

# Error output:
Error: EPIPE: broken pipe, write
    at WriteWrap.onWriteComplete [as oncomplete] (node:internal/stream_base_commons:94:16)
    at phase89-cuda-rag-pipeline.mjs:245:11
```

---

## 🔍 Root Cause

### How PowerShell Pipes Work

1. `Select-Object -First 50` reads exactly 50 lines
2. After reading 50 lines, PowerShell **closes the input stream**
3. Node.js continues writing to stdout
4. Writing to a closed pipe triggers `EPIPE` error
5. Node.js crashes if `EPIPE` is not handled

### Why This Is Expected Behavior

- **Unix philosophy**: Downstream process controls pipe lifecycle
- **PowerShell behavior**: `Select-Object -First N` immediately closes after N items
- **Node.js default**: Crashes on `EPIPE` (prevents silent data loss)

This is **not a bug** — it's how pipes work. You need to handle it explicitly.

---

## ✅ Solutions

### Solution 1: Use `Tee-Object` + `Get-Content` (BEST)

**Pattern**: Write full output to file, then read first N lines

```powershell
# ✅ CORRECT
node scripts/phase89-cuda-rag-pipeline.mjs --build 2>&1 |
  Tee-Object -FilePath .\reports\phase89-build.log

Get-Content .\reports\phase89-build.log -TotalCount 50
```

**Advantages**:
- ✅ Never crashes
- ✅ Full output preserved in log file
- ✅ Can review full log later
- ✅ No code changes needed

**Use When**:
- Building long-running processes
- Need both console preview + full logs
- Debugging production issues

---

### Solution 2: Ignore `EPIPE` in Node.js

**Pattern**: Add error handler at top of Node script

```javascript
// Add to scripts/phase89-cuda-rag-pipeline.mjs (line 19)
process.stdout.on('error', (err) => {
  if (err?.code === 'EPIPE') process.exit(0);  // Clean exit
  throw err;  // Re-throw other errors
});

import { QdrantClient } from '@qdrant/js-client-rest';
// ... rest of imports
```

**Advantages**:
- ✅ Can pipe to `Select-Object -First` without crashes
- ✅ Standard pattern for CLI tools
- ✅ Only catches `EPIPE`, re-throws real errors

**Use When**:
- Building reusable CLI tools
- Want to support piping to `head`, `Select-Object -First`, etc.
- Script is long-running and users want previews

---

### Solution 3: Just Don't Pipe (SIMPLEST)

**Pattern**: Run command without truncation

```powershell
# ✅ CORRECT (see all output)
node scripts/phase89-cuda-rag-pipeline.mjs --build

# Optional: Save to file
node scripts/phase89-cuda-rag-pipeline.mjs --build > .\reports\build.log 2>&1
```

**Advantages**:
- ✅ Simplest approach
- ✅ No code changes
- ✅ No pipe complications

**Use When**:
- Want to see full output in real-time
- Debugging issues
- Not concerned about log verbosity

---

## 🚫 Anti-Patterns

### ❌ Don't Use `Select-Object -First` on Long-Running Processes

```powershell
# ❌ WRONG (crashes after 50 lines)
node long-running-script.mjs | Select-Object -First 50
```

**Why Wrong**: Node continues writing after pipe closes → EPIPE crash

### ❌ Don't Ignore All stdout Errors

```javascript
// ❌ WRONG (hides real issues)
process.stdout.on('error', () => {});  // Silences ALL errors
```

**Why Wrong**: Hides legitimate write failures (disk full, permission denied, etc.)

### ❌ Don't Use Try-Catch Around console.log

```javascript
// ❌ WRONG (doesn't catch async EPIPE)
try {
  console.log('test');
} catch (err) {
  // EPIPE won't be caught here!
}
```

**Why Wrong**: `console.log` writes asynchronously. EPIPE happens later in event loop.

---

## 📊 Comparison of Solutions

| Solution | Code Changes | Preserves Logs | Supports Pipes | Complexity |
|----------|--------------|----------------|----------------|------------|
| Tee-Object | ❌ None | ✅ Yes | ❌ No | Low |
| EPIPE handler | ✅ 4 lines | ❌ No | ✅ Yes | Low |
| No pipes | ❌ None | ⚠️ Optional | ❌ No | Very Low |

**Recommendation**: Use **Tee-Object** for build scripts (preserves logs), add **EPIPE handler** for CLI tools.

---

## 🔧 Complete Example

### Before (Crashes)

```powershell
# ❌ Crashes after 50 lines
PS> node scripts/phase89-cuda-rag-pipeline.mjs --build | Select-Object -First 50

🔌 Initializing clients...
  ✅ Redis connected
  ✅ Qdrant connected
  ... (48 more lines)
Error: EPIPE: broken pipe, write
```

### After (Solution 1: Tee-Object)

```powershell
# ✅ No crash, full logs saved
PS> mkdir reports -ErrorAction SilentlyContinue
PS> node scripts/phase89-cuda-rag-pipeline.mjs --build 2>&1 |
      Tee-Object -FilePath .\reports\phase89-build.log

# Review first 50 lines
PS> Get-Content .\reports\phase89-build.log -TotalCount 50

# Review last 50 lines
PS> Get-Content .\reports\phase89-build.log -Tail 50

# Full log always available
PS> notepad .\reports\phase89-build.log
```

### After (Solution 2: EPIPE Handler)

```javascript
// scripts/phase89-cuda-rag-pipeline.mjs (top of file)
#!/usr/bin/env node

// Fix: Prevent EPIPE crash when piping to Select-Object -First
process.stdout.on('error', (err) => {
  if (err?.code === 'EPIPE') process.exit(0);
  throw err;
});

import { QdrantClient } from '@qdrant/js-client-rest';
// ... rest of script
```

```powershell
# ✅ Now works with pipes
PS> node scripts/phase89-cuda-rag-pipeline.mjs --build | Select-Object -First 50
```

---

## 🎯 Decision Tree

```
Need to preview long Node output?
    ↓
Want to save full logs?
    ↓ YES
Use Tee-Object + Get-Content
    ✅ Full logs preserved
    ✅ Can review anytime
    ✅ No code changes

    ↓ NO
Is this a reusable CLI tool?
    ↓ YES
Add EPIPE handler
    ✅ Supports piping
    ✅ Standard pattern
    ✅ 4-line code change

    ↓ NO
Just run without pipes
    ✅ Simplest approach
    ✅ No changes needed
```

---

## 🔍 Debugging EPIPE Issues

### Identify EPIPE Crashes

```powershell
# Check exit code
PS> node script.mjs | Select-Object -First 10
PS> $LASTEXITCODE
1  # ← Non-zero = crashed

# Check stderr
PS> node script.mjs 2>&1 | Select-String "EPIPE"
Error: EPIPE: broken pipe, write  # ← Found it
```

### Verify Fix

```powershell
# After adding EPIPE handler
PS> node script.mjs | Select-Object -First 10
PS> $LASTEXITCODE
0  # ← Zero = clean exit
```

---

## 📚 References

- **Node.js Stream Errors**: https://nodejs.org/api/stream.html#event-error
- **EPIPE Documentation**: https://nodejs.org/api/errors.html#common-system-errors
- **PowerShell Pipelines**: https://learn.microsoft.com/en-us/powershell/scripting/learn/understanding-the-powershell-pipeline

---

## ✅ Quick Reference Card

```powershell
# PROBLEM
node long-script.mjs | Select-Object -First 50
# → EPIPE crash ❌

# SOLUTION 1 (Best for build scripts)
node long-script.mjs 2>&1 | Tee-Object -FilePath logs/output.log
Get-Content logs/output.log -TotalCount 50
# → No crash, logs preserved ✅

# SOLUTION 2 (Best for CLI tools)
# Add to script.mjs:
process.stdout.on('error', (err) => {
  if (err?.code === 'EPIPE') process.exit(0);
  throw err;
});
# → Supports piping ✅

# SOLUTION 3 (Simplest)
node long-script.mjs
# → Just don't pipe ✅
```

---

## 🎓 Key Takeaways

1. **EPIPE is not a bug** — it's expected when downstream closes pipe
2. **Select-Object -First closes pipes** — this triggers EPIPE
3. **Tee-Object preserves logs** — best for build/deploy scripts
4. **EPIPE handler enables piping** — best for CLI tools
5. **Never silence all errors** — only catch EPIPE specifically

---

**Use this KB entry to prevent EPIPE crashes in Phase 89 build scripts and other Node.js pipelines.**
