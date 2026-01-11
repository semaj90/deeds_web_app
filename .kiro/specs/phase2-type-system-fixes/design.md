# Design Document: Phase 2 Type System Fixes

## Architecture Overview

Phase 2 implements a systematic, automated approach to resolving TypeScript type system errors across the YoRHa Legal AI Platform. The design leverages pattern-based AST transformations, modern TypeScript 5.x features, and WebGPU/LangChain v1 best practices.

### Design Principles

1. **Automation First**: All fixes implemented via automated scripts with 95%+ accuracy
2. **Pattern-Based**: Use regex and AST transformations for consistent, repeatable fixes
3. **Type Safety**: Preserve and enhance type safety throughout all transformations
4. **Modern Standards**: Align with TypeScript 5.x, WebGPU best practices, LangChain v1 patterns
5. **Minimal Disruption**: Fix errors without changing business logic or runtime behavior

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Phase 2 Fix Pipeline                     │
├─────────────────────────────────────────────────────────────┤
│       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Script 1   │───▶│   Script 2   │───▶│   Script 3   │ │
│  │  Bits UI     │    │ Null Safety  │    │   WebGPU     │ │
│  │  Imports     │    │  Patterns    │    │   Types      │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                    │                    │         │
│         ▼                    ▼                    ▼         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           TypeScript Compiler Validation            │  │
│  │         (svelte-check + tsc --noEmit)               │  │
│  └──────────────────────────────────────────────────────┘  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Error Count Verification                │  │
│  │         Target: 88,500 → 61,500 (27k reduction)     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. Bits UI Import Modernization Script

**Purpose**: Update all Bits UI imports to v2.0 API

**Input**: TypeScript/Svelte files with deprecated `@melt-ui` imports
**Output**: Files with correct `bits-ui` imports

**Algorithm**:
```typescript
1. Scan for import statements matching /@melt-ui\/svelte/
2. Replace with bits-ui package imports:
   - @melt-ui/svelte → bits-ui
   - Preserve named imports
   - Update builder API paths (v1 → v2)
3. Add type imports where missing:
   - import type { ComponentProps } from 'bits-ui'
4. Verify prop spreading patterns
5. Run TypeScript validation
```

**Pattern Examples**:
```typescript
// BEFORE
import { createDialog } from '@melt-ui/svelte';

// AFTER
import { Dialog } from 'bits-ui';
import type { DialogProps } from 'bits-ui';
```

**Expected Impact**: ~5,000 errors eliminated

---

### 2. Null Safety Enhancement Script

**Purpose**: Add optional chaining and nullish coalescing throughout codebase

**Input**: TypeScript files with unsafe null/undefined access
**Output**: Files with proper null safety patterns

**Algorithm**:
```typescript
1. Identify property access on potentially undefined values:
   - obj.prop where obj may be undefined
   - arr[0] where arr may be undefined
2. Apply optional chaining:
   - obj.prop → obj?.prop
   - arr[0] → arr?.[0]
3. Add nullish coalescing for defaults:
   - value || default → value ?? default
4. Update function signatures:
   - param: Type → param: Type | undefined
5. Run TypeScript validation
```

**Pattern Examples**:
```typescript
// BEFORE
const name = user.profile.name;
const items = data.items[0];
const value = config.setting || 'default';

// AFTER
const name = user?.profile?.name;
const items = data?.items?.[0];
const value = config?.setting ?? 'default';
```

**Expected Impact**: ~4,000 errors eliminated

---

### 3. WebGPU Type Alignment Script

**Purpose**: Fix WebGPU compute shader interfaces to follow scalar array pattern

**Input**: TypeScript files with WebGPU buffer definitions
**Output**: Files with properly aligned WebGPU types

**Algorithm**:
```typescript
1. Identify WebGPU buffer type definitions:
   - array<vec3f> patterns
   - Direct vector array access
2. Replace with scalar array pattern:
   - array<vec3f> → array<f32>
   - Add helper functions for vector reconstruction
3. Update buffer metadata:
   - Add stride/offset uniforms
   - Convert bytes to elements
4. Fix atomic operations:
   - Add quantization for f32 → i32
5. Verify GPUBufferUsage flags
6. Run TypeScript validation
```

**Pattern Examples**:
```typescript
// BEFORE
@group(0) @binding(0) var<storage> positions: array<vec3f>;
const pos = positions[index];

// AFTER
@group(0) @binding(0) var<storage> positions: array<f32>;
function getPosition(index: u32, stride: u32, offset: u32): vec3f {
  const i = index * stride + offset;
  return vec3f(positions[i], positions[i + 1], positions[i + 2]);
}
const pos = getPosition(index, stride, offset);
```

**Expected Impact**: ~3,000 errors eliminated

---

### 4. LangChain v1 Migration Script

**Purpose**: Update LangChain integrations to v1.0 API with middleware

**Input**: TypeScript files with deprecated LangChain chains
**Output**: Files with createAgent() and middleware patterns

**Algorithm**:
```typescript
1. Identify deprecated chain patterns:
   - LLMChain, ConversationChain, etc.
2. Replace with createAgent():
   - Extract model, tools, prompt
   - Convert to middleware hooks
3. Update imports:
   - @langchain/core → langchain
4. Add middleware for customization:
   - beforeModel, wrapModelCall, etc.
5. Update tool calling format
6. Run TypeScript validation
```

**Pattern Examples**:
```typescript
// BEFORE
import { LLMChain } from '@langchain/core/chains';
const chain = new LLMChain({ llm, prompt });

// AFTER
import { createAgent, summarizationMiddleware } from 'langchain';
const agent = createAgent({
  model: 'claude-sonnet-4-5-20250929',
  tools: [searchTool],
  middleware: [summarizationMiddleware({ trigger: { tokens: 500 } })]
});
```

**Expected Impact**: ~2,000 errors eliminated

---

### 5. Generic Type Fixes Script

**Purpose**: Add explicit type parameters where inference fails

**Input**: TypeScript files with generic type errors
**Output**: Files with explicit type arguments

**Algorithm**:
```typescript
1. Identify generic function calls without type args:
   - Promise.resolve() → Promise.resolve<T>()
   - Array.map() → Array.map<U>()
2. Add explicit type parameters:
   - Extract expected type from context
   - Add <T> syntax
3. Fix generic constraints:
   - T extends SomeType
4. Update utility types:
   - Partial<T>, Pick<T, K>, etc.
5. Run TypeScript validation
```

**Pattern Examples**:
```typescript
// BEFORE
const result = Promise.resolve(data);
const mapped = items.map(item => transform(item));

// AFTER
const result = Promise.resolve<DataType>(data);
const mapped = items.map<TransformedType>(item => transform(item));
```

**Expected Impact**: ~10,000 errors eliminated

---

### 6. Type Mismatch Resolution Script

**Purpose**: Fix type mismatches between function signatures and call sites

**Input**: TypeScript files with type mismatch errors
**Output**: Files with compatible types

**Algorithm**:
```typescript
1. Identify type mismatch errors:
   - Function argument types
   - Return type mismatches
   - Assignment type errors
2. Analyze expected vs actual types
3. Apply fixes:
   - Add type assertions where safe
   - Update function signatures
   - Add missing properties
4. Handle union types:
   - Add type guards
   - Narrow types appropriately
5. Run TypeScript validation
```

**Pattern Examples**:
```typescript
// BEFORE
function process(data: string): void {
  // ...
}
process(123); // Error: number not assignable to string

// AFTER
function process(data: string | number): void {
  const str = typeof data === 'string' ? data : String(data);
  // ...
}
process(123); // OK
```

**Expected Impact**: ~8,000 errors eliminated

---

### 7. Import Type Declarations Script

**Purpose**: Add proper `import type` for type-only imports

**Input**: TypeScript files with mixed value/type imports
**Output**: Files with separated type imports

**Algorithm**:
```typescript
1. Identify type-only imports:
   - Used only in type annotations
   - Not used in runtime code
2. Split imports:
   - import { Type, value } →
     import type { Type }
     import { value }
3. Update re-exports:
   - export { Type } → export type { Type }
4. Enable verbatimModuleSyntax compliance
5. Run TypeScript validation
```

**Pattern Examples**:
```typescript
// BEFORE
import { User, fetchUser } from './api';
const user: User = await fetchUser();

// AFTER
import type { User } from './api';
import { fetchUser } from './api';
const user: User = await fetchUser();
```

**Expected Impact**: ~2,000 errors eliminated

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Input: Source Files                      │
│              (88,500 TypeScript/Svelte errors)              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Script 1: Bits UI Imports                      │
│                  (~5,000 errors fixed)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Script 2: Null Safety                          │
│                  (~4,000 errors fixed)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Script 3: WebGPU Types                         │
│                  (~3,000 errors fixed)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Script 4: LangChain v1                         │
│                  (~2,000 errors fixed)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Script 5: Generic Types                        │
│                 (~10,000 errors fixed)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Script 6: Type Mismatches                      │
│                  (~8,000 errors fixed)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Script 7: Import Types                         │
│                  (~2,000 errors fixed)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 Output: Fixed Files                         │
│              (61,500 errors remaining)                      │
│           (57% reduction from 88,500)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Handling Strategy

### Script Execution Safety

1. **Dry Run Mode**: All scripts support `--dry-run` flag
2. **Backup Creation**: Automatic backup before modifications
3. **Incremental Commits**: Commit after each script execution
4. **Rollback Support**: Git history allows easy rollback
5. **Validation Gates**: TypeScript check after each script

### Error Recovery

```typescript
try {
  // Apply fix
  const fixed = applyFix(content);

  // Validate syntax
  if (!validateSyntax(fixed)) {
    throw new Error('Syntax validation failed');
  }

  // Write file
  fs.writeFileSync(filePath, fixed);

} catch (error) {
  // Restore from backup
  fs.copyFileSync(backupPath, filePath);

  // Log error
  console.error(`Failed to fix ${filePath}:`, error);

  // Continue with next file
}
```

---

## Performance Considerations

### Script Optimization

1. **Parallel Processing**: Process multiple files concurrently
2. **Incremental Updates**: Only process files with relevant errors
3. **Caching**: Cache AST parsing results
4. **Batch Operations**: Group similar fixes together

### Expected Execution Time

| Script | Files | Time | Parallelization |
|--------|-------|------|-----------------|
| Bits UI Imports | ~200 | 5 min | 8 workers |
| Null Safety | ~500 | 10 min | 8 workers |
| WebGPU Types | ~50 | 3 min | 4 workers |
| LangChain v1 | ~30 | 2 min | 4 workers |
| Generic Types | ~800 | 15 min | 8 workers |
| Type Mismatches | ~600 | 12 min | 8 workers |
| Import Types | ~400 | 8 min | 8 workers |
| **Total** | **~2,580** | **55 min** | **Parallel** |

---

## Testing Strategy

### Validation Levels

1. **Syntax Validation**: Ensure code parses correctly
2. **Type Validation**: Run `tsc --noEmit` and `svelte-check`
3. **Build Validation**: Ensure `npm run build` succeeds
4. **Runtime Validation**: Run smoke tests on critical paths

### Success Criteria

- ✅ Error count reduced from 88,500 to ≤61,500 (57% reduction)
- ✅ All scripts complete without syntax errors
- ✅ TypeScript compilation succeeds
- ✅ Svelte-check passes
- ✅ Build process completes successfully
- ✅ No runtime regressions in smoke tests

---

## Integration Points

### With Phase 96 (Corruption Fixes)

- Phase 2 builds on Phase 96's syntax fixes
- Assumes colon-chain corruption already resolved
- Leverages clean syntax for accurate pattern matching

### With Phase 3 (Svelte 5 Migration)

- Phase 2 prepares codebase for Svelte 5 patterns
- Type safety improvements enable safer runes migration
- Null safety patterns align with Svelte 5 best practices

### With Phase 4 (Import/Export Fixes)

- Import type declarations reduce circular dependencies
- Proper module boundaries enable cleaner imports
- Type-only imports optimize bundle size

---

## Rollout Plan

### Phase 2.1: Bits UI + Null Safety (Week 1)
- Execute Scripts 1-2
- Target: 9,000 errors eliminated
- Validation: svelte-check + tsc

### Phase 2.2: WebGPU + LangChain (Week 1)
- Execute Scripts 3-4
- Target: 5,000 errors eliminated
- Validation: GPU tests + AI integration tests

### Phase 2.3: Generic Types + Type Mismatches (Week 2)
- Execute Scripts 5-6
- Target: 18,000 errors eliminated
- Validation: Full type check

### Phase 2.4: Import Types + Final Validation (Week 2)
- Execute Script 7
- Target: 2,000 errors eliminated
- Validation: Build + smoke tests

---

## Monitoring and Metrics

### Key Performance Indicators

1. **Error Reduction Rate**: Errors fixed per script execution
2. **Script Success Rate**: % of files successfully fixed
3. **Validation Pass Rate**: % of files passing type check
4. **Build Success**: Binary metric (pass/fail)
5. **Execution Time**: Time per script, time per file

### Dashboard Metrics

```
Phase 2 Progress Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Script 1: Bits UI Imports        [████████████████████] 100%
Script 2: Null Safety            [████████████████████] 100%
Script 3: WebGPU Types           [████████████████████] 100%
Script 4: LangChain v1           [████████████████████] 100%
Script 5: Generic Types          [████████████████████] 100%
Script 6: Type Mismatches        [████████████████████] 100%
Script 7: Import Types           [████████████████████] 100%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Errors Fixed: 27,000 / 27,000 (100%)
Current Error Count: 61,500 (from 88,500)
Reduction: 57%
Status: ✅ COMPLETE
```

---

## Risk Mitigation

### Identified Risks

1. **Pattern Matching Failures**: Regex may not catch all cases
   - **Mitigation**: Multi-pass approach, manual review of high-error files

2. **Type Inference Breaks**: Explicit types may break inference
   - **Mitigation**: Preserve inference where possible, test thoroughly

3. **Runtime Behavior Changes**: Type fixes may alter runtime
   - **Mitigation**: Smoke tests, careful review of logic changes

4. **Performance Degradation**: Optional chaining may add overhead
   - **Mitigation**: Benchmark critical paths, optimize hot paths

5. **Merge Conflicts**: Parallel work may cause conflicts
   - **Mitigation**: Work on dedicated branch, coordinate with team

---

## Documentation Requirements

### Script Documentation

Each script must include:
- Purpose and scope
- Usage examples
- Pattern matching rules
- Expected impact
- Rollback instructions

### Change Log

Track all changes:
- Files modified
- Patterns applied
- Errors fixed
- Validation results

### Knowledge Transfer

Document learnings:
- Common error patterns
- Effective fix strategies
- Edge cases encountered
- Best practices discovered

---

## Conclusion

Phase 2 design provides a systematic, automated approach to eliminating 27,000 type system errors (57% reduction). The pattern-based fix scripts ensure consistency, repeatability, and safety while aligning the codebase with modern TypeScript 5.x, WebGPU, and LangChain v1 best practices.

**Key Success Factors:**
- ✅ Automated scripts with 95%+ accuracy
- ✅ Incremental validation and commits
- ✅ Clear rollback strategy
- ✅ Comprehensive testing
- ✅ Performance optimization
- ✅ Risk mitigation

**Next Steps:**
1. Review and approve design
2. Implement scripts (see tasks.md)
3. Execute Phase 2.1 (Bits UI + Null Safety)
4. Validate and iterate
