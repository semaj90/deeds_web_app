# AI Assistant TypeScript Guidelines
**Phase 103+ Type Management Standards**

---

## For Claude, Gemini, Copilot & All AI Assistants

### Core Principles

1. **Centralize Types** - Define types once in their logical source file
2. **Always Export Reusable Types** - Use `export interface` or `export type`
3. **Use `import type`** - For type-only imports (enables tree-shaking)
4. **Complete Definitions** - Avoid placeholder comments like `// TODO`

---

## ✅ Correct Pattern: Centralized Types

### Source File (Defines & Exports)
```typescript
// src/lib/3d/memory-palace-engine.ts
export interface MemoryRoom {
  id: string;
  name: string;
  theme?: 'evidence' | 'contracts' | 'cases' | 'research';
  documents?: LegalDocument[];
  position?: [number, number, number];
  size?: [number, number, number];
  color?: string;
  texture?: string;
}

export interface LegalDocument {
  id: string;
  title: string;
  type: 'evidence' | 'contract' | 'brief' | 'citation' | 'research';
  content?: string;
  confidence: number;
  priority: number;
  position: [number, number, number];
  embedding?: Float32Array;
}
```

### Consumer File (Imports Only)
```typescript
// src/legal-ai-integration.ts
import type { LegalDocument, MemoryRoom } from '$lib/3d/memory-palace-engine';

// ✅ CORRECT: Use imported types
export class LegalAIIntegrationService {
  private processDocument(doc: LegalDocument): void { }
  private updateRoom(room: MemoryRoom): void { }
}
```

---

## ❌ Wrong Pattern: Duplicated Types

```typescript
// src/legal-ai-integration.ts
// ❌ DON'T DO THIS - Duplicates type from memory-palace-engine
interface LegalDocument {
  id: string;
  title: string;
  // ... duplicate definition
}

// This causes:
// - Maintenance burden (update in 2 places)
// - Type conflicts
// - Confusion about source of truth
```

---

## Common Syntax Errors

### Error 1: Colon Instead of Comma in Parameters
```typescript
// ❌ WRONG
function test(a: string: b: number) { }
new Class(arg1: value: arg2: value);
obj.method(param1: val: param2: val);

// ✅ CORRECT
function test(a: string, b: number) { }
new Class(arg1, value, arg2, value);
obj.method(param1, val, param2, val);
```

### Error 2: Colon Instead of Comma in Objects
```typescript
// ❌ WRONG
const obj = { x: 1: y: 2: z: 3 };

// ✅ CORRECT
const obj = { x: 1, y: 2, z: 3 };
```

### Error 3: Comma Instead of Colon in Type Annotations
```typescript
// ❌ WRONG
const value, number = 5;
function test(param, string) { }

// ✅ CORRECT
const value: number = 5;
function test(param: string) { }
```

---

## Type Location Guidelines

| Type Category | Location | Example |
|--------------|----------|---------|
| **Domain Models** | Source module | `MemoryRoom` in `memory-palace-engine.ts` |
| **API Responses** | API client | `LegalAIResponse<T>` in `legal-ai-integration.ts` |
| **Shared Utilities** | `$lib/types/` | `User`, `Case`, `Evidence` |
| **Component Props** | Component file | `ButtonProps` in `Button.svelte` |
| **State Machine** | Machine file | `AuthContext` in `auth-machine.ts` |

---

## Decision Tree: Where Should This Type Live?

```
Is the type reused in multiple files?
├─ NO  → Keep private (no export)
└─ YES → Continue...
    │
    Is it domain-specific (business logic)?
    ├─ YES → Export from domain module
    │        (e.g., MemoryRoom in memory-palace-engine.ts)
    └─ NO  → Continue...
        │
        Is it a shared utility type?
        ├─ YES → Export from $lib/types/
        └─ NO  → Export from current file
```

---

## Quick Reference: Separators

| Context | Use | Example |
|---------|-----|---------|
| Function parameters | `,` | `f(a: Type, b: Type)` |
| Object properties | `,` | `{ x: 1, y: 2 }` |
| Array elements | `,` | `[1, 2, 3]` |
| Type annotation | `:` | `const x: Type` |
| Union types | `\|` | `Type1 \| Type2` |
| Intersection types | `&` | `Type1 & Type2` |

---

## File Organization Template

```typescript
// 1. Type-only imports first
import type { Type1, Type2 } from './types';
import type { Type3 } from '$lib/shared';

// 2. Runtime imports
import { function1 } from './utils';
import { CONSTANT } from './config';

// 3. Type definitions (exported first, then private)
export interface PublicInterface { }
export type PublicType = string | number;
interface PrivateHelper { }

// 4. Constants
export const CONFIG = { };

// 5. Implementation
export class MyClass { }
export function myFunction() { }

// 6. Default export (if needed)
export default something;
```

---

## Checklist Before Committing

- [ ] All reusable types have `export` keyword
- [ ] Using `import type` for type-only imports
- [ ] No duplicate type definitions
- [ ] All interfaces have complete properties (no `// TODO` placeholders)
- [ ] Function parameters use commas `,` not colons `:`
- [ ] Object literals use commas `,` not colons `:`
- [ ] Ran `npm run check` successfully
- [ ] Search codebase for `: :` pattern (should find none)

---

## Auto-Fix Available Patterns

Based on Phase 103.1 ACE analysis, these patterns can be auto-fixed:

1. **`constructor_colon_to_comma`** (1457 instances)
   - `new Class(a: b)` → `new Class(a, b)`

2. **`method_chain_colon`** (436 instances)
   - `.method(a: b: c)` → `.method(a, b, c)`

3. **`interface_property`** (9 instances)
   - `prop, Type;` → `prop: Type;`

4. **`index_signature`** (3 instances)
   - `[key, string]` → `[key: string]`

**Note**: Auto-fixes may cause regressions. Manual review recommended for critical files.

---

## Examples from Codebase

### ✅ GOOD: memory-palace-engine.ts
```typescript
export interface MemoryRoom {
  id: string;
  name: string;
  documents?: LegalDocument[];
}

export interface LegalDocument {
  id: string;
  title: string;
  type: 'evidence' | 'contract' | 'brief' | 'citation' | 'research';
  confidence: number;
  priority: number;
  position: [number, number, number];
  embedding?: Float32Array;
}
```

### ✅ GOOD: legal-ai-integration.ts
```typescript
import type { LegalDocument, MemoryRoom } from '$lib/3d/memory-palace-engine';

export class LegalAIIntegrationService {
  async analyzeDocument(doc: LegalDocument): Promise<void> {
    // Uses imported type
  }

  async updateRoom(room: MemoryRoom): Promise<void> {
    // Uses imported type
  }
}
```

---

## When You See an Error

### "Cannot find name 'X'"
1. Check if type is exported from source file
2. Check if import statement uses correct path
3. Verify `import type` syntax is correct

### "Property 'X' does not exist on type 'Y'"
1. Check source definition is complete
2. Ensure optional properties use `?`
3. Verify no duplicate definitions conflicting

### "',' expected" or "':' expected"
1. Function params → use `,`
2. Object properties → use `,`
3. Type annotations → use `:`

---

## Success Metrics

**Current State**: 1205+ TypeScript errors
**Target State**: <100 TypeScript errors
**Method**: Systematic type centralization + syntax fixes

**Progress Tracking**:
- ✅ `memory-palace-engine.ts` - Exports added
- ✅ `legal-ai-integration.ts` - 0 errors
- 🔄 1905 auto-fixable patterns identified
- 📋 Top 100 files documented in `TYPE_FIXING_STRATEGY.md`

---

## References

- Main strategy doc: `/TYPE_FIXING_STRATEGY.md`
- ACE auto-fix: `scripts/phase103.1-ace-autofix.mjs`
- Error analysis: `scripts/phase103-error-analyzer.mjs`
