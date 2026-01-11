# Phase 66 CSS Error Fixing - ACE Knowledge Base

## Context
Date: 2026-01-11
Baseline: 77,002 TypeScript/CSS errors, 232 warnings, 2,471 files
Goal: 40-45% error reduction through automated pattern fixing

## Identified CSS Corruption Patterns

### Pattern 1: Split Global Selectors
**Frequency:** Medium (estimated 500-1,000 occurrences)
**Error Message:** `[vite:css][postcss] Failed to parse selector : ": global(.nes-theme)`

**Broken Syntax:**
```css
/* ❌ Space between colon and global */
: global(.nes-theme)
.upload-button:hover:not(:disabled) {
  background: blue;
}
```

**Correct Syntax:**
```css
/* ✅ No space */
:global(.nes-theme) .upload-button:hover:not(:disabled) {
  background: blue;
}
```

**Fix Pattern:**
```javascript
content.replace(/:\s+global\(/g, ':global(')
```

---

### Pattern 2: Malformed @keyframes with Slashes
**Frequency:** Low (estimated 50-200 occurrences)
**Error Message:** `[vite:css][postcss] Failed to parse selectors : "from" / "transform: scale(0.95), to"`

**Broken Syntax:**
```css
/* ❌ Quoted keywords with slashes */
@keyframes fadeIn {
  "from" / "transform: scale(0.95)", to {
    opacity: 1;
  }
}
```

**Correct Syntax:**
```css
/* ✅ Proper keyframe syntax */
@keyframes fadeIn {
  from {
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

**Fix Pattern:**
```javascript
content.replace(/"(from|to)"\s*\/\s*"([^"]+)"\s*,?\s*(from|to)?/g,
  (match, kw1, props, kw2) => `${kw1} { ${props}; }${kw2 ? `\n  ${kw2}` : ''}`)
```

---

### Pattern 3: Quoted Percentages in Keyframes
**Frequency:** Low (estimated 100-300 occurrences)
**Error Message:** `[vite:css][postcss] Failed to parse selectors : "0%"`

**Broken Syntax:**
```css
/* ❌ Quoted percentages */
@keyframes spin {
  "0%" {
    transform: rotate(0deg);
  }
  "100%" {
    transform: rotate(360deg);
  }
}
```

**Correct Syntax:**
```css
/* ✅ Unquoted percentages */
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
```

**Fix Pattern (in style blocks only):**
```javascript
styleContent.replace(/:\s*"(\d+%)\s*"/g, '$1 {')
```

---

## TypeScript Corruption Patterns (Previously Fixed)

### Pattern 4: Type Import Colon Corruption ✅ FIXED (346 files)
**Error:** `Cannot find name 'PageServerLoad'`

**Broken:**
```typescript
import type { Actions: PageServerLoad } from './$types';
```

**Fixed:**
```typescript
import type { Actions, PageServerLoad } from './$types';
```

---

### Pattern 5: FormData Argument Corruption ✅ FIXED (3 files)
**Error:** Property expected, got identifier

**Broken:**
```typescript
const data = {
  type: formData.get('type', title: formData.get('title',
};
```

**Fixed:**
```typescript
const data = {
  type: formData.get('type'),
  title: formData.get('title'),
};
```

---

## Fix Strategy & Workflow

### Phase 1: Structural Fixes (Completed)
- ✅ `fix-type-imports.mjs` → 346 files
- ✅ `fix-formdata-corruption.mjs` → 3 files
- ✅ `/admin/knowledge-search` → SSR migration with Qdrant + Ollama

### Phase 2: CSS Fixes (Current)
- 🔄 `fix-css-selectors.mjs` → Targets PostCSS parsing errors
- Dry-run validated: No false positives on SVG attributes
- Chunked processing with `--limit N` flag

### Phase 3: Remaining Patterns (Next)
- Missing semicolons in object literals
- Type mismatches (`TS2322`, `TS2339`, `TS2304`)
- Import resolution errors

---

## Automation Tools

### Phase 66 Python Agent
**Location:** `scripts/phase66_automated_error_fixer.py`
**LLM:** Ollama `gemma3-legal:latest` (native, no OpenAI dependency)
**Tools:**
- `get_error_patterns`: Run svelte-check and parse output
- `search_pattern`: Find files matching regex
- `run_specialized_fixer`: Invoke Node.js scripts
- `apply_regex_fix`: Direct PowerShell replacement
- `verify_fixes`: Validate error count reduction

**Workflow:**
1. Identify top 3 patterns
2. Apply fixes in priority order
3. Verify after each batch
4. Rollback if errors increase

---

## Expected Impact

| Fix Pass | Pattern | Est. Errors Fixed | Cumulative |
|----------|---------|-------------------|------------|
| Pass 1 | CSS selectors | -15,000 | 77K → 62K |
| Pass 2 | Missing semicolons | -8,000 | 62K → 54K |
| Pass 3 | Object commas | -6,000 | 54K → 48K |
| Pass 4 | Type imports (re-run) | -2,000 | 48K → 46K |
| Pass 5 | Import resolution | -4,000 | 46K → 42K |

**Target:** 42,000 errors (45% reduction) by end of Phase 66

---

## ACE Integration Points

1. **Knowledge Capture:** Document each successful pattern in this file
2. **Validation:** Run `svelte-check` after each batch
3. **Rollback:** Git commit before applying bulk fixes
4. **Observability:** Log to Langfuse (http://localhost:3030)
5. **Iteration:** Update fix patterns based on new errors revealed

---

## Commands Reference

```bash
# TypeScript fixes (already applied)
node scripts/fix-type-imports.mjs
node scripts/fix-formdata-corruption.mjs

# CSS fixes (current)
node scripts/fix-css-selectors.mjs --dry-run
node scripts/fix-css-selectors.mjs --limit 10
node scripts/fix-css-selectors.mjs  # Full run

# Phase 66 agent
pip install --upgrade openai langchain-openai
python scripts/phase66_automated_error_fixer.py

# Verification
npx svelte-check --threshold error
```

---

## Notes for Future Iterations

- CSS corruption patterns are **context-sensitive** (must parse style blocks)
- SVG attributes should **not** be modified (e.g., `width="100%"` is valid HTML)
- Keyframe syntax requires **multiline replacement** (not simple regex)
- Always validate in **dry-run** before bulk application
- Chunk processing prevents overwhelming git diffs

---

**Last Updated:** 2026-01-11 10:48 PST
**Maintained by:** Antigravity (Google Deepmind ACE)
