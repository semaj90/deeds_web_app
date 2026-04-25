# Incident: TypeScript Syntax Corruption

**Status**: P0 Active
**Detected**: 2025-12-15
**Incident ID**: `syntax-corruption-2025-12-15`

## Symptoms

TypeScript parser fails with cascading errors due to systematic colon/comma drift:

- `property, TypeName` instead of `property: TypeName`
- `property: type:` instead of `property: type;`
- `param, string:` instead of `param: string`
- Object literals with comma corruption

## Root Cause

Global find/replace accident converting colons to commas in:
- Type annotations
- Object property definitions
- Interface declarations
- Function parameters

## Detection Queries

### Pattern 1: Param Comma Corruption
```powershell
rg -n "\b[A-Za-z_$][\w$]*\s*,\s*(string|number|boolean|any|unknown|never|void)\s*:" src
```

### Pattern 2: Trailing Colon Before Semicolon
```powershell
rg -n "\b[A-Za-z_$][\w$]*\s*:\s*[A-Za-z_$][\w$]*\s*:" src
```

### Pattern 3: Optional Param Corruption
```powershell
rg -n "\b[A-Za-z_$][\w$]*\?\s*,\s*(string|number|boolean)" src
```

## Fix Rules

### Rule 1: Type Annotation Comma-to-Colon
**Pattern**: `property_name, TypeName` → `property_name: TypeName`

**Context**: Inside `{ }` braces in type/interface definitions

**Regex**:
```javascript
/(\w+)\s*,\s*(string|number|boolean|any|unknown|never|void)(\s*[;,}])/g
```

**Replacement**:
```javascript
'$1: $2$3'
```

**Confidence**: 0.98

### Rule 2: Trailing Colon to Semicolon
**Pattern**: `property: type:` → `property: type;`

**Context**: End of type annotation

**Regex**:
```javascript
/(\w+)\s*:\s*(\w+)\s*:/g
```

**Replacement**:
```javascript
'$1: $2;'
```

**Confidence**: 0.99

### Rule 3: Optional Param Fix
**Pattern**: `param? , Type` → `param?: Type`

**Context**: Function parameters, interface properties

**Regex**:
```javascript
/(\w+)\?\s*,\s*(string|number|boolean|any|unknown)/g
```

**Replacement**:
```javascript
'$1?: $2'
```

**Confidence**: 0.97

## Top Offenders (Pre-Fix)

| File | Errors |
|------|--------|
| `src/lib/ai.bak/enhanced-neo4j-reranker.ts` | 147 |
| `src/lib/ai.bak/frontend-rag-pipeline.ts` | 89 |
| `src/lib/workers/job-state.ts` | 76 |
| `src/lib/workers/legal-ai-worker-pool.ts` | 64 |
| `src/lib/webgpu/gpu-ranking-matrices.ts` | 52 |

## Known Unsafe Patterns

### Object Literal Keys
**Pattern**: `{ 0: "NETWORK_ERROR" }`

**Action**: Skip - this is valid JavaScript

**Guard**: Only apply comma-to-colon inside function call arguments

### Import Statements
**Pattern**: `import type { A, B }`

**Action**: Skip - commas are correct here

**Guard**: Exclude lines starting with `import`

## Fix Execution

### Script
```bash
node scripts/fix-syntax-corruption.mjs
```

### Dry Run
```bash
node scripts/fix-syntax-corruption.mjs --dry-run
```

### Output
- **Report**: `reports/error_2025-12-15_19-11-11_syntax-corruption.md`
- **Patches**: `reports/patches/2025-12-15_19-11-11/rb_*/`
- **Apply Log**: `reports/patches/2025-12-15_19-11-11/rb_*/apply-log.json`

## Files Changed

Total files modified: TBD (to be determined after fix run)

Sample:
```
src/lib/ai.bak/enhanced-neo4j-reranker.ts
src/lib/workers/job-state.ts
src/lib/workers/legal-ai-worker-pool.ts
src/lib/webgpu/gpu-ranking-matrices.ts
```

## Verification Steps

1. **Run fixer**:
   ```bash
   node scripts/fix-syntax-corruption.mjs
   ```

2. **TypeScript check**:
   ```bash
   npx tsc --noEmit --skipLibCheck -p tsconfig.check.json
   ```

3. **If errors remain**:
   - Extract next failing snippet (20-40 lines)
   - Add new narrow rule
   - Re-run fixer
   - Re-run TypeScript check

4. **Success criteria**: TypeScript parses with zero parse errors

## Policy

**Only narrow, idempotent transforms.**

- Add one rule at a time
- Test after each rule
- Never broad codemods until TypeScript parses
- No semantic analysis in P0 fixes

## Next Steps

1. ✅ Implement fixer with Rules 1-3
2. ⏳ Run dry-run
3. ⏳ Review proposed patches
4. ⏳ Apply patches
5. ⏳ Verify TypeScript parse
6. ⏳ Add more rules if needed
7. ⏳ Update agent docs

## Agent Documentation Update

Add to `claude/copilot/gemini` agent docs:

```markdown
## Incident: TypeScript Syntax Corruption (colon/comma drift)
Symptoms: invalid TS due to `key, expr` in object literals, `name, string:` in params, and `0: 'TAG'` appearing in call sites.
Fixer: `node scripts/fix-syntax-corruption.mjs [--dry-run]`
Report: `sveltekit-frontend/reports/error_*_syntax-corruption.md`
Policy: only narrow, idempotent transforms; add one rule at a time; avoid broad codemods until TypeScript parses.
```

## Incident Timeline

- **2025-12-15 19:11:11**: Incident detected, timestamp frozen
- **2025-12-15 19:15:00**: Rules 1-3 defined
- **2025-12-15 19:20:00**: Fixer script implemented
- **TBD**: Dry run complete
- **TBD**: Patches applied
- **TBD**: TypeScript parsing restored
- **TBD**: Incident resolved

## Resolution

**Status**: In Progress

**Blocker**: TypeScript cannot parse until corruption is fixed.

**Impact**: All other fixes (Svelte 5, Bits-UI, onMount, barrels) are blocked.

**Priority**: P0 - must fix before any other work.
