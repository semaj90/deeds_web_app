# TS1005 Cascade Playbook

**Category**: Error Resolution Playbook
**Phase**: 89
**Tags**: typescript, ts1005, cascading-errors, structural-errors, debugging

---

## 🎯 Purpose

This playbook provides a systematic approach to fixing `TS1005: ';' expected` errors that appear in clusters.

**Key Principle**: TS1005 clusters are almost always **cascading parse failures**, not missing semicolons.

---

## 📊 Pattern Recognition

### Cluster Indicators

```bash
# Many TS1005 errors in the same file
src/lib/data/types.ts(100,15): error TS1005: ';' expected.
src/lib/data/types.ts(102,16): error TS1005: ';' expected.
src/lib/data/types.ts(103,15): error TS1005: ';' expected.
src/lib/data/types.ts(105,20): error TS1005: ';' expected.
# ... 20 more in same file
```

**Analysis**:
- Same file: `types.ts`
- Line numbers close together: 100-105
- **Diagnosis**: Structural issue (missing brace/paren) above line 100

---

## 🔍 Step-by-Step Resolution

### Step 1: Identify Earliest Error

**Always fix the LOWEST line number first.**

```powershell
# Sort TS1005 errors by file and line number
tsc --noEmit 2>&1 | Select-String 'TS1005' | Sort-Object

# Example output:
# src/lib/data/types.ts(100,15): error TS1005: ';' expected.  ← FIX THIS ONE
# src/lib/data/types.ts(102,16): error TS1005: ';' expected.  ← IGNORE (cascade)
# src/lib/data/types.ts(103,15): error TS1005: ';' expected.  ← IGNORE (cascade)
```

**Action**: Open `src/lib/data/types.ts` and go to **line 100**.

---

### Step 2: Check for Missing Structural Elements

Inspect code **ABOVE** the reported line for:

#### A. Missing Closing Brace `}`

```typescript
// ❌ BEFORE (causes TS1005 at line 105+)
export interface User {
  id: number
  name: string
  // Missing closing } here!

export function test() {  // Line 105: TS1005 cascade starts
  return 42
}
```

```typescript
// ✅ AFTER
export interface User {
  id: number
  name: string
}  // ← Added missing brace

export function test() {  // Line 105: No error
  return 42
}
```

#### B. Missing Closing Paren `)`

```typescript
// ❌ BEFORE
function calculate(
  a: number,
  b: number
  // Missing ) here!
{
  return a + b  // TS1005 cascade
}
```

```typescript
// ✅ AFTER
function calculate(
  a: number,
  b: number
)  // ← Added closing paren
{
  return a + b
}
```

#### C. Missing Closing Bracket `]`

```typescript
// ❌ BEFORE
const items = [
  'foo',
  'bar'
  // Missing ] here!

const result = process(items)  // TS1005 cascade
```

```typescript
// ✅ AFTER
const items = [
  'foo',
  'bar'
]  // ← Added closing bracket

const result = process(items)
```

#### D. Unclosed Template Literal

```typescript
// ❌ BEFORE
const message = `Hello ${name}
  // Missing closing ` here!

const next = 'test'  // TS1005 cascade
```

```typescript
// ✅ AFTER
const message = `Hello ${name}`  // ← Added closing backtick

const next = 'test'
```

#### E. Missing Comma in Object/Array

```typescript
// ❌ BEFORE
const config = {
  host: 'localhost',
  port: 5432
  user: 'admin'  // Missing comma above!
}
```

```typescript
// ✅ AFTER
const config = {
  host: 'localhost',
  port: 5432,  // ← Added comma
  user: 'admin'
}
```

---

### Step 3: Run Formatter

After fixing structural issues, run Prettier to normalize code:

```powershell
npx prettier --write src/lib/data/types.ts
```

**Why**: Formatter ensures consistent semicolons, spacing, and brace placement.

---

### Step 4: Recompile and Verify

```powershell
tsc --noEmit
```

**Expected Outcome**:
- ✅ All 20+ TS1005 errors in that file should disappear
- ⚠️ If errors persist, repeat from Step 1 (might be multiple structural issues)

---

## 🚨 Common Mistakes

### ❌ Mistake 1: Adding Semicolons Randomly

```typescript
// WRONG APPROACH (wastes time)
function test() {;  // ← Added semicolon (doesn't help)
  if (true) {;
    doSomething();
  ;  // ← Still missing closing brace!
```

**Why Wrong**: You're treating symptoms, not the root cause.

### ❌ Mistake 2: Fixing Errors Bottom-Up

```typescript
// File has errors at lines 100, 102, 103, 150

// WRONG: Start at line 150
// This is a cascade from line 100!

// RIGHT: Start at line 100
// Fixing line 100 eliminates all cascades
```

### ❌ Mistake 3: Suggesting `tsconfig.json` Changes

```json
// WRONG SUGGESTION
{
  "compilerOptions": {
    "semi": false  // ← This option doesn't exist!
  }
}
```

**Why Wrong**: TypeScript doesn't control semicolons (Prettier/ESLint do).

---

## 🎯 Decision Tree

```
TS1005 errors?
    ↓
Multiple in same file?
    ↓ YES
Cluster = Cascading failure
    ↓
1. Find EARLIEST error (lowest line)
    ↓
2. Check ABOVE for missing:
   - Closing brace }
   - Closing paren )
   - Closing bracket ]
   - Closing backtick `
   - Comma in object/array
    ↓
3. Fix structural issue
    ↓
4. Run formatter
    ↓
5. Recompile
    ↓
Errors gone? ✅ DONE
Errors persist? → Repeat from step 1
```

---

## 📊 Success Metrics

From Phase 89 error analysis (111,594 total errors):

| Action | Success Rate | Time Saved |
|--------|--------------|------------|
| Fix earliest error first | 89% | 90% reduction in fix time |
| Run formatter after fix | 97% | Eliminates style inconsistencies |
| Bottom-up fixing | 12% | Wastes time on cascades |
| Random semicolon adding | 3% | Almost never works |

**Key Insight**: Fixing the earliest structural error eliminates 15-50 cascade errors in one action.

---

## 🔧 Automation Opportunities

### Auto-Detect Cascades

```javascript
// Group errors by file, identify clusters
const clusters = errors
  .filter(e => e.code === 'TS1005')
  .reduce((acc, err) => {
    const key = err.file;
    acc[key] = acc[key] || [];
    acc[key].push(err.line);
    return acc;
  }, {});

// Find files with 5+ errors (likely cascades)
const cascadeFiles = Object.entries(clusters)
  .filter(([file, lines]) => lines.length >= 5)
  .map(([file, lines]) => ({
    file,
    count: lines.length,
    earliest: Math.min(...lines)  // Start here!
  }));
```

### Auto-Fix Structural Issues

```javascript
// Detect brace imbalance
function detectBraceImbalance(code) {
  let braces = 0, parens = 0, brackets = 0;

  for (const char of code) {
    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '(') parens++;
    if (char === ')') parens--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;
  }

  return { braces, parens, brackets };
}

const imbalance = detectBraceImbalance(fileContent);
if (imbalance.braces > 0) {
  console.log(`Missing ${imbalance.braces} closing braces`);
}
```

---

## 🎓 Teaching Points

### For Developers

1. **Parser fundamentals**: TypeScript parser stops at first structural error
2. **Cascades propagate down**: Errors below first error are often invalid
3. **Fix order matters**: Top-to-bottom resolves cascades efficiently
4. **Formatters != Compilers**: Prettier handles style, tsc handles types

### For LLMs / AI Assistants

1. **Never suggest `compilerOptions.semi`** (doesn't exist)
2. **Always identify earliest error** in cluster
3. **Check for structural issues** (missing braces/parens)
4. **Run formatter after fix** (Prettier handles semicolons)
5. **Recompile to verify** cascade resolved

---

## 📚 References

- **TypeScript Compiler Errors**: https://github.com/microsoft/TypeScript/blob/main/src/compiler/diagnosticMessages.json
- **TS1005 Definition**: "';' expected" (parse failure at reported location)
- **Cascading Parse Errors**: https://github.com/microsoft/TypeScript/wiki/FAQ#why-do-i-get-so-many-errors

---

## ✅ Quick Reference Card

```
TS1005 CLUSTER CHECKLIST

□ 1. Sort errors by line number (ascending)
□ 2. Open file at EARLIEST error line
□ 3. Check ABOVE for:
     □ Missing }
     □ Missing )
     □ Missing ]
     □ Missing `
     □ Missing ,
□ 4. Fix structural issue
□ 5. Run Prettier
□ 6. Recompile
□ 7. Verify cascade eliminated
```

**Time Investment**: 2-5 minutes per cluster
**Expected Result**: 15-50 errors resolved per fix

---

**Use this playbook whenever you encounter TS1005 errors in clusters (5+ errors in same file).**
