# SvelteKit Project Error Log & TODO List

## High Priority Issues (App Breaking)

### 1. **Store Usage Errors** 🔴

**Files:** `src/routes/evidence/realtime/+page.svelte`

- **Issue:** Cannot use 'evidenceStore' as a store - needs proper store access pattern
- **Fix:** Change `$evidenceStore.property` to `$evidenceStore.property` (access individual store properties)
- **Status:** Requires immediate fix

### 2. **Form Handler Errors** 🔴

**Files:** `src/routes/login/+page.svelte`

- **Issue:** SuperFormData is not callable - `use:form` directive usage error
- **Fix:** Use `use:enhance` instead of `use:form` for form submission
- **Status:** Critical - breaks form submission

### 3. **Layout Data Issues** 🔴

**Files:** `src/routes/+layout.svelte`

- **Issue:** Properties 'loginForm' and 'registerForm' don't exist on data type
- **Fix:** Ensure +layout.server.ts returns the forms correctly
- **Status:** High priority

### 4. **Import Casing Issues** 🔴

**Files:** `src/routes/login/+page.svelte`

- **Issue:** File casing mismatch between 'card' and 'Card' imports
- **Fix:** Use consistent casing (PascalCase) for all component imports
- **Status:** High priority

## Medium Priority Issues (Functionality)

### 5. **Label Accessibility Issues** 🟡

**Files:** `src/routes/evidence/realtime/+page.svelte`, `src/routes/login/+page.svelte`

- **Issue:** Form labels not associated with controls
- **Fix:** Add `for` attribute to labels linking to input IDs
- **Status:** Accessibility compliance required

### 6. **Component Props Issues** 🟡

**Files:** `src/routes/login/+page.svelte`

- **Issue:** Label component doesn't accept 'for' prop
- **Fix:** Use `for_` prop instead of `for` (Svelte naming convention)
- **Status:** Component API compliance

### 7. **Variable Assignment Issues** 🟡

**Files:** `src/routes/+layout.svelte`

- **Issue:** Cannot assign to import 'user'
- **Fix:** Use different variable name or destructuring pattern
- **Status:** Medium priority

## Low Priority Issues (Cleanup)

### 8. **Unused CSS Selectors** 🟢

**Files:** `src/routes/login/+page.svelte`

- **Issue:** Unused CSS selectors `.error-alert`, `.success-alert`
- **Fix:** Remove unused styles or implement the missing elements
- **Status:** Code cleanup

### 9. **Type Annotation Issues** 🟢

**Files:** `src/routes/evidence/realtime/+page.svelte`

- **Issue:** Type mismatch in syncStatus assignment
- **Fix:** Add proper type annotations or default values
- **Status:** Type safety improvement

## Detailed Fix Instructions

### Fix 1: Evidence Store Usage

```typescript
// Current (broken)
$: isConnected = $evidenceStore.isConnected;

// Fixed
$: isConnected = $evidenceStore.isConnected;
```

### Fix 2: Form Handler

```svelte
<!-- Current (broken) -->
<form method="POST" use:form>

<!-- Fixed -->
<form method="POST" use:enhance>
```

### Fix 3: Label Components

```svelte
<!-- Current (broken) -->
<Label for="email">Email</Label>

<!-- Fixed -->
<Label for_="email">Email</Label>
```

### Fix 4: Accessibility Labels

```svelte
<!-- Current (broken) -->
<label class="text-sm font-medium">Case Filter:</label>

<!-- Fixed -->
<label for="case-filter" class="text-sm font-medium">Case Filter:</label>
<select id="case-filter">
```

### Fix 5: Import Casing

```typescript
// Current (broken)
import { Card } from "$lib/components/ui/card/index.js";

// Fixed
import { Card } from "$lib/components/ui/Card/index.js";
```

## Testing Checklist

- [ ] Login form submits correctly
- [ ] Evidence store displays data
- [ ] Layout loads without errors
- [ ] All forms have proper labels
- [ ] No TypeScript errors
- [ ] No accessibility warnings
- [ ] All imports resolve correctly

## Priority Order

1. Fix store usage errors (evidenceStore)
2. Fix form handler (superforms)
3. Fix layout data issues
4. Fix import casing
5. Fix accessibility labels
6. Clean up unused CSS
7. Fix type annotations

---

**Generated**: $(Get-Date)
**Total Issues**: 9 categories, ~15 individual errors
**Estimated Fix Time**: 30-45 minutes
