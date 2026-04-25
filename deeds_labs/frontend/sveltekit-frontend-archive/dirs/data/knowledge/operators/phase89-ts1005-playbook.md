# TS1005 Error Playbook - Phase 89 Knowledge Base

## Overview
**TS1005** errors (`';' expected`, `',' expected`, `'=>' expected`, etc.) are **downstream parse symptoms**, not root causes. They cascade from earlier structural issues.

## Common Misunderstandings

### ❌ WRONG: "Add semi option to tsconfig.json"
```json
// THIS IS INCORRECT - TypeScript has no "semi" compiler option
{
  "compilerOptions": {
    "semi": false  // ← THIS DOES NOT EXIST
  }
}
```

**Why it's wrong:**
- `semi` is an ESLint/Prettier rule, NOT a TypeScript compiler option
- TypeScript doesn't care about semicolons syntactically
- The error is about missing delimiters (`,`, `;`, `)`, `}`), not semicolon style

### ✅ CORRECT: Fix the structural issue upstream

TS1005 means the parser encountered something unexpected because of:
1. **Unmatched braces/parentheses** earlier in the file
2. **Corrupted syntax** from automated codemods (`:` instead of `|` or `,`)
3. **Missing commas** in object literals or function parameters
4. **Broken type annotations** (especially in generics)

## Fix Strategy

### Step 1: Find the EARLIEST TS1005 in the file
```bash
# Get first error line
npx tsc --noEmit 2>&1 | grep "TS1005" | head -1
```

The first error is often the root cause; later errors are cascade.

### Step 2: Inspect 20 lines ABOVE the error
Look for these patterns:

| Corrupted | Should Be | Pattern |
|-----------|-----------|---------|
| `string: undefined` | `string \| undefined` | Pipe corruption |
| `(x: number), number:` | `(x: number, y: number):` | Comma/return corruption |
| `{ key: value, }` | `{ key: value }` | Trailing comma before brace |
| `async function foo(): {` | `async function foo() {` | Return type leaking |

### Step 3: Check brace balance
```bash
# Count braces in problematic file
grep -o '{' src/lib/file.ts | wc -l  # Opening braces
grep -o '}' src/lib/file.ts | wc -l  # Closing braces
```

Mismatch = structural corruption.

### Step 4: Fix ONE error, then re-run type check
```bash
# After fixing the earliest error:
npx tsc --noEmit src/lib/affected-file.ts
```

Fixing the root cause often resolves 5-50 downstream TS1005 errors.

## Common Corruption Patterns (from Phase 89 analysis)

### Pattern A: Pipe → Colon corruption
```typescript
// WRONG (corrupted)
type Result = string: undefined;

// CORRECT
type Result = string | undefined;
```

### Pattern B: Parameter list corruption
```typescript
// WRONG (corrupted)
function foo(a: string), b: number: void {

// CORRECT
function foo(a: string, b: number): void {
```

### Pattern C: Object literal corruption
```typescript
// WRONG (corrupted)
const config = {
  timeout: 5000: retries: 3,
};

// CORRECT
const config = {
  timeout: 5000,
  retries: 3,
};
```

### Pattern D: Generic corruption
```typescript
// WRONG (corrupted)
Record<string, string: undefined>

// CORRECT
Record<string, string | undefined>
```

## After Fixing: Run Formatter
```bash
npx prettier --write src/lib/affected-file.ts
npm run check  # Verify all errors resolved
```

## Automated Detection Query
```sql
-- Find files with multiple TS1005 (likely structural corruption)
SELECT
  substring(raw_text FROM '^([^(]+)') as file_path,
  COUNT(*) as error_count
FROM raw_error_embeddings
WHERE raw_text LIKE '%TS1005%'
GROUP BY file_path
ORDER BY error_count DESC
LIMIT 20;
```

## Tags
`phase89`, `ts1005`, `typescript`, `parser`, `cascade`, `playbook`, `syntax-error`, `codemod-corruption`
