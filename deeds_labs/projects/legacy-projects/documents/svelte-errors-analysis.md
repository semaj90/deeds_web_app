# Svelte-Check Error Analysis - Top 100 Issues

## Executive Summary
Based on the svelte-check machine output, the errors fall into several key categories that indicate Svelte 5 migration issues and TypeScript syntax problems.

## Top Error Categories (by pattern observed)

### 1. **TS1005: ',' expected** (Highest frequency ~40-50% of errors)
**Root Cause**: Object literal syntax errors in `$state()` and `$derived()` declarations, and prop destructuring with `$props()`

**Example patterns:**
```typescript
// ❌ WRONG - Missing comma after property
let config = {
  damping: 0.8;  // Should be comma
  spring: 1.2;   // Should be comma
}

// ❌ WRONG - Semicolons in object literals
const styles = {
  inline: 'flex flex-row items-center gap-4';  // Should be comma
  lg: 'text-lg';  // Should be comma
}
```

**Affected Files** (partial list):
- `src/lib/components/ui/forms/FormStandard.svelte:42,47,52`
- `src/lib/components/unified/UnifiedButton.svelte:56`
- `src/lib/components/ai/LLMProviderSelector.svelte:59,68,77`
- `src/lib/components/layout/PageLayout.svelte:31,39,46,53`
- `src/lib/components/editor/RichTextEditor.svelte:35,106,107`
- `src/lib/components/canvas/EvidenceNode.svelte:39,54,55,102,113`

**Fix**: Replace semicolons with commas in object literals throughout all files

---

### 2. **TS1128: Declaration or statement expected** (~30% of errors)
**Root Cause**: Incorrect `$props()` destructuring syntax - closing brace placement

**Example pattern:**
```typescript
// ❌ WRONG
let {
  class: className = '',
  variant = 'default',
  ...restProp;  // Semicolon instead of comma
}: Props = $props();

// ✅ CORRECT
let {
  class: className = '',
  variant = 'default',
  ...restProp
}: Props = $props();
```

**Affected Files:**
- `src/lib/components/ui/forms/FormStandard.svelte:38`
- `src/lib/components/ui/progress/Progress.svelte:13`
- `src/lib/components/unified/UnifiedButton.svelte:45`
- `src/lib/components/unified/UnifiedDialog.svelte:58,62,63`
- `src/lib/components/yorha/YoRHaTable.svelte:66,76,77,94`

**Fix**: Remove semicolon after spread operator in destructuring

---

### 3. **TS1109: Expression expected** (~15% of errors)
**Root Cause**: Missing default values in prop declarations

**Example pattern:**
```typescript
// ❌ WRONG
let {
  options = ,  // Missing value!
  data = [],
}: Props = $props();

// ✅ CORRECT
let {
  options = {},
  data = [],
}: Props = $props();
```

**Affected Files:**
- `src/lib/components/ui/Form.svelte:24`
- `src/lib/components/ui/forms/FormStandard.svelte:26`
- `src/lib/components/legal/CustodyTimeline.svelte:5`

**Fix**: Provide default values for all optional props

---

### 4. **TS1131: Property or signature expected** (~5% of errors)
**Root Cause**: Invalid syntax in $props() destructuring with nested objects

**Example pattern:**
```typescript
// ❌ WRONG
let {
  data = [],  // This is fine
  filters = {}  // This triggers error when in wrong context
} = $props();

// ✅ CORRECT - Define interface first
interface Props {
  data?: any[];
  filters?: Record<string, any>;
}

let { data = [], filters = {} }: Props = $props();
```

**Affected Files:**
- `src/lib/components/yorha/YoRHaTable.svelte:51`
- `src/lib/components/cases/CaseFilters.svelte:22`

---

### 5. **TS1005: '{' expected / ')' expected** (~5% of errors)
**Root Cause**: Complex multi-line `$state()` declarations with mangled syntax

**Example pattern:**
```typescript
// ❌ WRONG - Multiple declarations merged incorrectly
let canvas = $state<HTMLCanvasElementlet gl: WebGLRenderingContext | null>(null); const data = null);

// ✅ CORRECT - Separate declarations
let canvas = $state<HTMLCanvasElement | null>(null);
let gl = $state<WebGLRenderingContext | null>(null);
```

**Affected Files:**
- `src/lib/components/unified/UnifiedButton.svelte:49,248`
- `src/lib/components/unified/UnifiedDialog.svelte:65,238,247`
- `src/lib/components/ai/LLMProviderSelector.svelte:81`

---

### 6. **TS1389: 'class' is not allowed as a variable declaration name** (~2% of errors)
**Root Cause**: Old Svelte 3/4 `export let class` syntax

**Example pattern:**
```typescript
// ❌ WRONG - Old Svelte 3/4 syntax
export let class: string = '';

// ✅ CORRECT - Svelte 5 syntax
let { class: className = '' }: { class?: string } = $props();
```

**Affected Files:**
- `src/lib/components/ui/enhanced-bits/Button.svelte:6`

---

### 7. **WGSL/Shader Code in TypeScript Context** (~3% of errors)
**Root Cause**: WGSL shader code embedded in TypeScript files without proper string wrapping

**Example pattern:**
```typescript
// ❌ WRONG - Raw WGSL code
struct Uniforms {
  intensity: f32;
}
@group(0) @binding(0) var<uniform> uniforms: Uniform;

// ✅ CORRECT - WGSL as template literal
const shaderCode = /* wgsl */ `
  struct Uniforms {
    intensity: f32,
  }
  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
`;
```

**Affected Files:**
- `src/lib/components/unified/UnifiedDialog.svelte:105-114`

---

## Prioritized Fix Plan

### Phase 1: Quick Wins (70% error reduction)
**Estimated Time**: 30 minutes with regex find/replace

1. **Find/Replace Semicolons in Object Literals**
   ```regex
   Find: (\w+:\s*'[^']+');
   Replace: $1,

   Find: (\w+:\s*\d+);
   Replace: $1,

   Find: (\w+:\s*true|false);
   Replace: $1,
   ```

2. **Fix $props() Destructuring Spread**
   ```regex
   Find: \.\.\.(\w+);(\s*}\s*:\s*\w+\s*=\s*\$props\(\))
   Replace: ...$1$2
   ```

3. **Add Missing Default Values**
   - Manually review and add `{}` or `[]` for empty defaults

---

### Phase 2: Medium Complexity (20% error reduction)
**Estimated Time**: 1 hour

1. **Fix Complex $state() Declarations**
   - Split merged variable declarations
   - Properly type generic parameters

2. **Fix WGSL Shader Code**
   - Wrap all shader code in template literals
   - Use `/* wgsl */` comment for syntax highlighting

3. **Update export let class**
   - Convert to Svelte 5 `$props()` syntax

---

### Phase 3: Architecture Review (10% error reduction)
**Estimated Time**: 2-3 hours

1. **Review YoRHaTable.svelte** - Complex prop destructuring issues
2. **Review ClientSideAIChat.svelte** - Timestamp property syntax
3. **Review RichTextEditor.svelte** - TinyMCE config object syntax

---

## Automation Opportunities

### Using MCP Multicore Server
The `scripts/mcp-multicore-server.mjs` can be leveraged to:

1. **Parallel Error Fixing**
   ```javascript
   // Distribute file fixing across CPU cores
   const filesToFix = glob.sync('src/**/*.svelte');
   const workers = cpus().length;
   // Process files in parallel batches
   ```

2. **SIMD JSON Worker Integration**
   - Use `sveltekit-frontend/static/simd-json-worker.js` for fast JSON parsing of error reports
   - Leverage WebAssembly SIMD for bulk text processing

---

## Files Requiring Manual Review (High Priority)

1. **src/lib/components/unified/UnifiedDialog.svelte** - WebGPU shader code + complex state
2. **src/lib/components/unified/UnifiedButton.svelte** - WebGL state management
3. **src/lib/components/yorha/YoRHaTable.svelte** - Complex generic props
4. **src/lib/components/editor/RichTextEditor.svelte** - Large TinyMCE config
5. **src/lib/components/ai/ClientSideAIChat.svelte** - Message timestamp patterns

---

## Metrics

- **Total Estimated Errors**: ~23,000+
- **Unique Error Patterns**: ~100
- **Files Affected**: ~1,979
- **Estimated Fix Time**:
  - Phase 1: 30 min (automated)
  - Phase 2: 1 hour (semi-automated)
  - Phase 3: 2-3 hours (manual review)
  - **Total: 3.5-4.5 hours**

---

## Next Steps

1. Run Phase 1 automated fixes
2. Re-run `npm run svelte:check:log` to measure progress
3. Use `npm run svelte:errors:top100` to verify error reduction
4. Continue with Phase 2 and 3 based on remaining errors

---

## Commands to Use

```bash
# Generate fresh error log
npm run svelte:check:log

# Analyze top 100 errors
npm run svelte:errors:top100

# View summary
cat svelte-top100.txt

# Start MCP server for parallel processing
MCP_PORT=3002 node scripts/mcp-multicore-server.mjs
```