# Phase 68: Semantic Surgery Strategy

## 📊 Error Analysis (89k Errors)

Analysis of `svelte-check` logs reveals the following distribution:

| Rank | Pattern | Count | Est. Impact | Root Cause |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `'ID' expected` / `',' expected` | **26,414** | **30%** | **Syntax Corruption**: Likely missing commas in object literals or function signatures. |
| 2 | `Cannot find name 'ID'` | **18,741** | **21%** | **Missing Imports**: Core globals (`stdout`) or Service classes (`OllamaService`). |
| 3 | `Declaration expected` | **4,953** | **5.5%** | **Severe Syntax**: Broken braces or file structure. |
| 4 | `'ID' only refers to a type` | **3,330** | **3.7%** | **Import Mismatch**: Using `import type` for values (classes/enums). |
| 5 | `Property 'ID' missing` | **3,065** | **3.4%** | **Interface Mismatch**: Schemas out of sync with code. |

---

## 🛠️ Execution Plan

### Iteration 1: Import Hygiene (Target: -22k errors)
1.  **Type-Only Fixer:** Convert `import type { X }` to `import { X }` where `X` is used as a value.
    *   *Tool:* `scripts/fix-type-imports-usage.ts` (ts-morph)
2.  **Global Import Fixer:** Auto-import common Node.js/Project globals.
    *   *Targets:* `stdout`, `stderr` -> `import { stdout } from 'process'`
    *   *Targets:* `OllamaService` -> Fix export/import path.

### Iteration 2: Syntax Repair (Target: -26k errors)
1.  **Comma Injection:** Detect missing commas between identifiers in Objects/Functions.
    *   *Pattern:* `key value` -> `key, value` (Regex)
    *   *Tool:* Enhanced `fix-syntax-corruption.mjs`

### Iteration 3: Interface Extension (Target: -3k errors)
1.  **Property Adder:** Add missing properties to interfaces as `property?: any`.
    *   *Tool:* `scripts/extend-interfaces.ts`

---

## 🔮 Next Actions
1. Approve this plan.
2. Begin Iteration 1.
