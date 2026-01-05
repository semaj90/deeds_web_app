# Phase 74: TypeScript/Svelte Error Fixing - 2025 Best Practices

## 🎯 Error Reduction Summary (2026-01-05)

- **Baseline (Pre-Phase 72):** ~88,300 errors
- **Post-Phase 72-73:** 83,139 errors
- **Reduction:** 5,161 errors (5.8%)
- **Target for Phase 74:** <75,000 errors (10%+ reduction)

---

## 📊 Common TypeScript Error Patterns & Automated Fixes

### TS2304: Cannot find name 'X'
**Cause:** Missing type declarations or imports
**Automated Fixes:**
```bash
# Install missing @types packages
npm install --save-dev @types/node @types/jquery

# Add to tsconfig.json
{
  "compilerOptions": {
    "types": ["node", "jest"]
  }
}
```
**IDE Quick Fix:** VS Code light bulb → "Install `@types/X`"

---

### TS2322: Type 'X' is not assignable to type 'Y'
**Cause:** Type mismatch in assignments
**Automated Fixes:**
- Enable `strictNullChecks` in `tsconfig.json`
- Use type guards: `if (typeof value === 'string') { ... }`
- ESLint rules: `@typescript-eslint/strict-boolean-expressions`

**Pattern:**
```typescript
// ❌ Before
let value: string = undefined; // TS2322

// ✅ After
let value: string | undefined = undefined;
```

---

### Corruption Pattern: Redundant Object Aliasing ({ foo: foo })
**Cause:** AI hallucination or bad refactoring tools introducing redundant aliases in destructuring or imports.
**Pattern:**
```typescript
// ❌ Corrupted
import { sql: sql } from 'drizzle-orm';
const { id: id } = user;
console.log(`Value: ${ value: value }`);

// ✅ Fixed
import { sql } from 'drizzle-orm';
const { id } = user;
console.log(`Value: ${value}`);
```
**Automated Fix:**
Use `scripts/phase74-batch-import-fixer.cjs` to scan and fix 1000+ files.

---

### TS2345: Argument type mismatch
**Cause:** Function called with wrong argument type
**Automated Fixes:**
- **Dependency Resolution:** Use Yarn resolutions for version conflicts
  ```json
  {
    "resolutions": {
      "@babel/types": "7.23.0"
    }
  }
  ```
- **Type Assertions (with caution):**
  ```typescript
  someFunction(value as ExpectedType);
  ```

---

### TS2339: Property does not exist on type
**Cause:** Accessing undefined property
**Automated Fixes:**
- **Optional Chaining:**
  ```typescript
  // ❌ Before
  const name = user.profile.name; // TS2339 if profile is undefined

  // ✅ After
  const name = user?.profile?.name;
  ```
- **Type Narrowing:**
  ```typescript
  if ('propertyName' in object) {
    // TypeScript now knows the property exists
  }
  ```

---

### TS7006: Implicit 'any' parameter
**Cause:** Function parameter lacks type annotation
**Automated Fixes:**
- **ESLint Auto-fix:**
  ```bash
  npx eslint --fix src/**/*.ts
  ```
- **tsconfig.json:**
  ```json
  {
    "compilerOptions": {
      "noImplicitAny": true
    }
  }
  ```

---

## 🛠️ Automated Fixing Tools (2025)

### 1. **ESLint + @typescript-eslint**
```bash
# Install
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# Auto-fix command
npx eslint --fix src/**/*.{ts,svelte}
```

**Key Rules:**
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/explicit-function-return-type`
- `@typescript-eslint/no-unused-vars`

---

### 2. **ts-fix (Microsoft CLI)**
```bash
# Apply TypeScript code fixes across codebase
npx ts-fix

# Interactive mode
npx ts-fix --interactive
```
Applies VS Code's light bulb fixes programmatically[19].

---

### 3. **ts-morph (AST Manipulation)**
```typescript
import { Project } from "ts-morph";

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.ts");

for (const sourceFile of project.getSourceFiles()) {
  const functions = sourceFile.getFunctions();
  functions.forEach(fn => {
    if (!fn.getReturnTypeNode()) {
      fn.setReturnType("void"); // Add missing return type
    }
  });
}

project.saveSync();
```

---

### 4. **svelte-check**
```bash
# Run full diagnostic
npx svelte-check --threshold error

# Watch mode
npx svelte-check --watch
```

---

## 🚀 Svelte 5 Migration Best Practices (2025)

### Automated Migration Script
```bash
npx sv migrate svelte-5
```
**What it does:**
- Converts `let` → `$state`
- Converts `$:` → `$derived`
- Converts `on:click` → `onclick`
- Converts slots → snippets

### Type Safety with Runes

#### ✅ $state (Reactive Variables)
```svelte
<script lang="ts">
  let count = $state<number>(0);
  let user = $state<User | null>(null);
</script>
```

#### ✅ $derived (Computed Values)
```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2); // Type inferred
</script>
```

#### ✅ $props (Component Props)
```svelte
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
  }

  let { title, count = 0 }: Props = $props();
</script>
```

#### ✅ createContext (Type-Safe Context - Svelte 5.40+)
```typescript
import { createContext } from 'svelte';

interface UserContext {
  user: User;
  logout: () => void;
}

const userContext = createContext<UserContext>('user');

// In parent component
userContext.set({ user, logout });

// In child component
const { user, logout } = userContext.get(); // Fully typed!
```

---

## 📋 SvelteKit 2 TypeScript Strict Mode

### Recommended tsconfig.json
```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
    "types": ["@sveltejs/kit", "vite/client"]
  }
}
```

### End-to-End Type Safety
```typescript
// +page.server.ts
export async function load() {
  return {
    users: await db.users.findMany()
  };
}

// +page.svelte
<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  // data.users is fully typed!
</script>
```

---

## 🔧 Phase 74 Batch Error Fixing Strategy

### Step 1: Identify Top Error Files
```bash
node scripts/phase74-error-analyzer.mjs logs/errors-post-phase73.txt
```

### Step 2: Target High-Impact Patterns
**Priority Order:**
1. **Missing Imports (TS2304)** → Auto-fix with IDE
2. **Null Safety (TS2322)** → Add `| null | undefined`
3. **Function Signatures (TS2345)** → Add explicit types
4. **Property Access (TS2339)** → Optional chaining `?.`
5. **Implicit Any (TS7006)** → Add type annotations

### Step 3: Automated Fix Scripts
```bash
# Fix imports
npx organize-imports-cli src/**/*.ts

# Fix ESLint issues
npx eslint --fix src/**/*.{ts,svelte}

# Run ts-fix
npx ts-fix

# Verify
npx svelte-check --threshold error
```

### Step 4: Commit Incrementally
```bash
git add <fixed-files>
git commit -m "Phase 74.X: Fix <error-pattern> in <file-count> files"
```

---

## 📚 References
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Svelte 5 Docs](https://svelte.dev/docs/svelte/what-is-svelte)
- [SvelteKit Migration Guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-2)
- [ts-morph Documentation](https://ts-morph.com/)
- [VS Code TypeScript Features](https://code.visualstudio.com/docs/languages/typescript)

---

**Last Updated:** 2026-01-05
**Phase:** 74 - Hybrid Error Reduction Approach
