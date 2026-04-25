# Form Actions: Validation Errors & Client Sync

**Category:** User Experience
**Tags:** #sveltekit #form-actions #validation #progressive-enhancement #ux #forms #use:enhance
**Symbols:** `fail` `ActionFailure` `use:enhance` `form` `applyAction` `FormData` `ActionData`
**Route Kind:** `page action`
**HTTP Methods:** `POST`
**Risk:** `ux data-integrity security`
**Last Updated:** 2025-12-24

---

## Intent

Production-ready pattern for handling **form submissions** with **server-side validation**, **client-side error display**, **progressive enhancement**, and **double-submit prevention**. Ensures users never lose form data on validation errors and provides instant feedback.

**One-Sentence Summary:**
User submits form → Server validates with Zod → Return errors + original data → Client displays errors inline → User fixes + resubmits.

---

## When to Use

✅ **Use form actions when:**
- Creating/updating records via HTML forms
- Need progressive enhancement (works without JavaScript)
- Want SvelteKit's built-in CSRF protection
- Need to redirect after successful submission
- Want standardized error handling across forms

❌ **Don't use when:**
- Building a JSON API (use `+server.ts` endpoints instead)
- Need real-time validation (use client-side Zod + debounce)
- Uploading files >10MB (use presigned URLs)
- Building wizard/multi-step forms (use client-side state management)

---

## Route Structure

### File Convention
```
src/routes/
├── cases/
│   ├── create/
│   │   ├── +page.svelte        # Form UI
│   │   └── +page.server.ts     # Form action
│   └── [id]/
│       ├── edit/
│       │   ├── +page.svelte
│       │   └── +page.server.ts
```

### Basic Structure

**Server (`+page.server.ts`)**
```typescript
import { fail, redirect } from '@sveltejs/kit';
import { CreateCaseSchema } from '$lib/schemas';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  return { user: locals.user };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { message: 'Unauthorized' });
    }

    // Parse form data
    const formData = await request.formData();
    const data = {
      title: formData.get('title'),
      description: formData.get('description'),
      priority: formData.get('priority')
    };

    // Validate
    const validation = CreateCaseSchema.safeParse(data);

    if (!validation.success) {
      return fail(400, {
        data,  // Return original data
        errors: validation.error.flatten().fieldErrors
      });
    }

    // Business logic
    const newCase = await db.insert(cases).values({
      ...validation.data,
      assignedAttorney: locals.user.id
    }).returning();

    // Redirect on success
    throw redirect(303, `/cases/${newCase[0].id}`);
  }
};
```

**Client (`+page.svelte` - Svelte 5)**
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  // Client-side state for instant validation feedback
  let clientErrors = $state<Record<string, string[]>>({});

  function validateField(field: string, value: string) {
    // Optional: Client-side validation before submit
    const result = CreateCaseSchema.pick({ [field]: true }).safeParse({ [field]: value });
    if (!result.success) {
      clientErrors[field] = result.error.flatten().fieldErrors[field] || [];
    } else {
      delete clientErrors[field];
    }
  }
</script>

<form method="POST" action="?/create" use:enhance>
  <!-- Title Field -->
  <label>
    <span>Title</span>
    <input
      name="title"
      value={form?.data?.title || ''}
      onblur={(e) => validateField('title', e.currentTarget.value)}
      class:error={form?.errors?.title || clientErrors.title}
    />
    {#if form?.errors?.title}
      <span class="text-red-500">{form.errors.title[0]}</span>
    {:else if clientErrors.title}
      <span class="text-orange-500">{clientErrors.title[0]}</span>
    {/if}
  </label>

  <!-- Description Field -->
  <label>
    <span>Description</span>
    <textarea
      name="description"
      value={form?.data?.description || ''}
      onblur={(e) => validateField('description', e.currentTarget.value)}
    ></textarea>
    {#if form?.errors?.description}
      <span class="text-red-500">{form.errors.description[0]}</span>
    {/if}
  </label>

  <!-- Priority Field -->
  <label>
    <span>Priority</span>
    <select name="priority" value={form?.data?.priority || 'medium'}>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="critical">Critical</option>
    </select>
    {#if form?.errors?.priority}
      <span class="text-red-500">{form.errors.priority[0]}</span>
    {/if}
  </label>

  <button type="submit">Create Case</button>

  {#if form?.message}
    <p class="text-red-500">{form.message}</p>
  {/if}
</form>
```

---

## Security Model

### 1. CSRF Protection (Built-In)
```typescript
// SvelteKit automatically validates Origin header for form actions
// No additional code needed - CSRF protection is automatic
```

### 2. Authentication Check
```typescript
export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { message: 'Unauthorized' });
    }
    // ... rest of action
  }
};
```

### 3. Rate Limiting
```typescript
import { rateLimit } from '$lib/server/rate-limit';

export const actions: Actions = {
  create: async ({ request, locals, getClientAddress }) => {
    if (!locals.user) {
      return fail(401, { message: 'Unauthorized' });
    }

    // Rate limit: 10 form submissions per minute
    const rateLimitResult = await rateLimit(`form_create_case`, {
      max: 10,
      window: 60000,
      identifier: locals.user.id
    });

    if (!rateLimitResult.success) {
      return fail(429, {
        message: 'Too many submissions',
        retryAfter: rateLimitResult.resetIn
      });
    }

    // ... rest of action
  }
};
```

### 4. Idempotency (Prevent Double Submit)
```typescript
import { redis } from '$lib/server/redis';

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();
    const idempotencyKey = formData.get('idempotency_key') as string;

    if (!idempotencyKey) {
      return fail(400, { message: 'Missing idempotency key' });
    }

    // Check if already processed
    const existing = await redis.get(`idempotency:${idempotencyKey}`);
    if (existing) {
      return fail(409, { message: 'Request already processed' });
    }

    // ... process form

    // Mark as processed (24 hour TTL)
    await redis.setex(`idempotency:${idempotencyKey}`, 86400, 'processed');

    throw redirect(303, '/success');
  }
};
```

---

## Validation

### Server-Side Validation with Zod
```typescript
import { z } from 'zod';

const CreateCaseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(10).max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags: z.array(z.string()).max(10).optional()
});

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();

    // Convert FormData to object
    const data = Object.fromEntries(formData);

    // Special handling for arrays
    if (formData.has('tags[]')) {
      data.tags = formData.getAll('tags[]');
    }

    // Validate
    const validation = CreateCaseSchema.safeParse(data);

    if (!validation.success) {
      return fail(400, {
        data,  // Original data for form repopulation
        errors: validation.error.flatten().fieldErrors
      });
    }

    // Type-safe validated data
    const { title, description, priority } = validation.data;

    // ... use validated data
  }
};
```

### Client-Side Validation Sync
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import { CreateCaseSchema } from '$lib/schemas';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  let clientErrors = $state<Record<string, string[]>>({});
  let isSubmitting = $state(false);

  // Validate single field on blur
  function validateField(field: string, value: any) {
    const result = CreateCaseSchema.pick({ [field]: true }).safeParse({ [field]: value });

    if (!result.success) {
      clientErrors[field] = result.error.flatten().fieldErrors[field] || [];
    } else {
      delete clientErrors[field];
    }
  }

  // Validate entire form before submit
  function validateForm(formData: FormData) {
    const data = Object.fromEntries(formData);
    const result = CreateCaseSchema.safeParse(data);

    if (!result.success) {
      clientErrors = result.error.flatten().fieldErrors;
      return false;
    }

    clientErrors = {};
    return true;
  }
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={({ formData, cancel }) => {
    // Client-side validation before submit
    if (!validateForm(formData)) {
      cancel(); // Prevent submission
      return;
    }

    isSubmitting = true;

    return async ({ result, update }) => {
      isSubmitting = false;

      if (result.type === 'failure') {
        // Server validation failed - update form with errors
        await update();
      } else if (result.type === 'redirect') {
        // Success - navigate to redirect
        await update();
      }
    };
  }}
>
  <!-- Form fields... -->
</form>
```

---

## Error Return Shapes

### Standard Error Response
```typescript
interface ActionFailure {
  status: number;
  data?: Record<string, any>;     // Original form data
  errors?: Record<string, string[]>; // Field errors
  message?: string;                // Global error message
}

// Example usage
return fail(400, {
  data: { title: 'My Case', description: 'Test' },
  errors: {
    title: ["Title must be at least 3 characters"],
    priority: ["Invalid enum value"]
  }
});
```

### Error Display Component
```svelte
<!-- ErrorMessage.svelte -->
<script lang="ts">
  let { errors, field }: { errors?: Record<string, string[]>; field: string } = $props();

  let errorMessage = $derived(errors?.[field]?.[0]);
</script>

{#if errorMessage}
  <span class="text-sm text-red-500" role="alert">
    {errorMessage}
  </span>
{/if}

<!-- Usage -->
<ErrorMessage {errors} field="title" />
```

---

## Progressive Enhancement

### use:enhance Patterns

**Basic Enhancement (Default Behavior)**
```svelte
<form method="POST" action="?/create" use:enhance>
  <!-- Form automatically submits via fetch, updates page data on success -->
</form>
```

**Custom Enhancement (Loading States)**
```svelte
<script lang="ts">
  let isSubmitting = $state(false);
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={() => {
    isSubmitting = true;

    return async ({ update }) => {
      await update();
      isSubmitting = false;
    };
  }}
>
  <button type="submit" disabled={isSubmitting}>
    {isSubmitting ? 'Creating...' : 'Create Case'}
  </button>
</form>
```

**Advanced Enhancement (Custom Success/Error Handling)**
```svelte
<script lang="ts">
  import { applyAction } from '$app/forms';

  let successMessage = $state<string | null>(null);
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={() => {
    return async ({ result, update }) => {
      if (result.type === 'redirect') {
        // Show success toast before redirect
        successMessage = 'Case created successfully!';
        setTimeout(() => {
          applyAction(result);
        }, 1000);
      } else if (result.type === 'failure') {
        // Custom error handling
        console.error('Form submission failed:', result.data);
        await update();
      } else {
        await update();
      }
    };
  }}
>
  <!-- Form fields... -->
</form>

{#if successMessage}
  <div class="toast toast-success">{successMessage}</div>
{/if}
```

---

## Double Submit Prevention

### Client-Side (Disable Button)
```svelte
<script lang="ts">
  let isSubmitting = $state(false);
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={() => {
    isSubmitting = true;

    return async ({ update }) => {
      await update();
      isSubmitting = false;
    };
  }}
>
  <button type="submit" disabled={isSubmitting}>
    {isSubmitting ? 'Submitting...' : 'Submit'}
  </button>
</form>
```

### Server-Side (Idempotency Key)
```svelte
<script lang="ts">
  import { randomBytes } from 'crypto';

  // Generate idempotency key on component mount
  const idempotencyKey = `${Date.now()}-${randomBytes(8).toString('hex')}`;
</script>

<form method="POST" action="?/create" use:enhance>
  <input type="hidden" name="idempotency_key" value={idempotencyKey} />
  <!-- Other fields... -->
</form>
```

```typescript
// Server action
export const actions: Actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();
    const idempotencyKey = formData.get('idempotency_key') as string;

    // Check Redis for duplicate submission
    const exists = await redis.get(`idempotency:${idempotencyKey}`);
    if (exists) {
      return fail(409, { message: 'Request already processed' });
    }

    // Process form...

    // Mark as processed
    await redis.setex(`idempotency:${idempotencyKey}`, 86400, 'processed');

    throw redirect(303, '/success');
  }
};
```

---

## Failure Modes

| Symptom | Root Cause | Fix | Verification |
|---------|-----------|-----|--------------|
| Form data lost on validation error | Not returning `data` in `fail()` | Return `fail(400, { data, errors })` | Submit invalid form, check if fields repopulated |
| Errors not displayed | Using `form.error` instead of `form.errors` | Access `form?.errors?.fieldName` | Check component props structure |
| Double submission creates duplicates | No idempotency check | Add idempotency key + Redis check | Submit form twice rapidly |
| Client validation out of sync | Using different schema on client | Import same Zod schema on client/server | Change schema, verify both fail |
| CSRF error on submission | Custom fetch instead of form action | Use SvelteKit form actions (automatic CSRF) | Submit from different origin |
| Redirect doesn't work | Using `redirect(302)` instead of `throw redirect(303)` | Always `throw redirect(303, path)` after success | Check browser doesn't stay on form page |
| `use:enhance` not working | Missing `use:` prefix | Change `enhance` to `use:enhance` | Form should use fetch, not full page reload |
| Form submits on Enter key in text field | Missing `type="button"` on non-submit buttons | Add `type="button"` to all non-submit buttons | Press Enter in text field |
| Validation passes empty strings | FormData returns empty string for missing fields | Transform empty strings to `undefined` or validate with `.min(1)` | Submit form with empty optional field |

---

## Integration Checklist

- [ ] **1. Create page route:** `src/routes/{route}/+page.svelte`
- [ ] **2. Create server actions:** `src/routes/{route}/+page.server.ts`
- [ ] **3. Define Zod schema:** In `$lib/schemas/`
- [ ] **4. Export actions object:** `export const actions: Actions = { ... }`
- [ ] **5. Add auth check:** `if (!locals.user) return fail(401, ...)`
- [ ] **6. Parse FormData:** `await request.formData()`
- [ ] **7. Validate with Zod:** `schema.safeParse(data)`
- [ ] **8. Return errors + data:** `fail(400, { data, errors })`
- [ ] **9. Redirect on success:** `throw redirect(303, path)`
- [ ] **10. Add `use:enhance`:** On form element
- [ ] **11. Display errors:** `{#if form?.errors?.field}` blocks
- [ ] **12. Repopulate fields:** `value={form?.data?.field || ''}`
- [ ] **13. Add loading states:** `isSubmitting` state
- [ ] **14. Prevent double submit:** Disable button + idempotency key
- [ ] **15. Test progressive enhancement:** Disable JavaScript, form should still work

---

## Tests

### Unit Test: Form Action
```typescript
import { describe, it, expect } from 'vitest';
import { actions } from './+page.server';

describe('create action', () => {
  it('should return errors on invalid data', async () => {
    const result = await actions.create({
      request: new Request('http://localhost', {
        method: 'POST',
        body: new URLSearchParams({ title: 'AB' }) // Too short
      }),
      locals: { user: { id: '123', username: 'test', role: 'USER' } },
      getClientAddress: () => '192.168.1.1'
    });

    expect(result.status).toBe(400);
    expect(result.data.errors.title).toBeDefined();
  });

  it('should redirect on valid data', async () => {
    let redirected = false;

    try {
      await actions.create({
        request: new Request('http://localhost', {
          method: 'POST',
          body: new URLSearchParams({
            title: 'Valid Case Title',
            description: 'Valid description here.',
            priority: 'high'
          })
        }),
        locals: { user: { id: '123', username: 'test', role: 'USER' } },
        getClientAddress: () => '192.168.1.1'
      });
    } catch (err) {
      if (err.status === 303) {
        redirected = true;
      }
    }

    expect(redirected).toBe(true);
  });
});
```

---

## Related Patterns

- **Zod Validation Contracts** - Schema design for form validation
- **Protected Endpoints Patterns** - Auth + rate limiting
- **SvelteKit REST Route Structure** - Form actions vs API endpoints

---

**Pattern Status:** ✅ Complete
**Next Review:** After Phase 79 testing
**Maintained By:** UX Engineering Team

## Failure modes
- Forgetting `return fail(...)` throws 500 or redirects unexpectedly.
- Not returning `data` (user loses their input).
- Double submissions (use `use:enhance` to disable button).

## Reference implementation
```typescript
// +page.server.ts
import { fail } from '@sveltejs/kit';

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get('email');

    const result = schema.safeParse({ email });

    if (!result.success) {
      return fail(400, {
        email,
        errors: result.error.flatten().fieldErrors,
        missing: true
      });
    }
    // ... success
  }
};
```

```svelte
<!-- +page.svelte -->
<script>
  let { form } = $props();
</script>

<form method="POST" use:enhance>
  <input name="email" value={form?.email ?? ''} />
  {#if form?.errors?.email}
    <span class="error">{form.errors.email[0]}</span>
  {/if}
</form>
```

## Integration checklist
1. Define action in `+page.server.ts`.
2. Handle validation failure with `fail(400)`.
3. Expose `form` prop in `+page.svelte`.
4. Bind values and show errors.

## Tests
- Submit valid form -> Success.
- Submit invalid form -> 400 + Errors displayed + Input preserved.
