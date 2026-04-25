---
tags: ["validation", "zod", "schema", "api", "security"]
symbols: ["z.object", "safeParse", "flatten", "ZodError", "z.infer"]
route_kind: ["endpoint", "action"]
http_methods: ["POST", "PUT", "PATCH"]
risk: ["security", "data-integrity"]
---

# Zod Validation Contracts

## Intent
Standardizes input validation for API endpoints and form actions to ensure data integrity and type safety before processing.

## When to use / when not
Use for **all** user input (request body, query params, form data). Do not rely on client-side validation alone.

## Route structure
- Define schemas in a shared `schemas.ts` or collocated with the route.
- Validate immediately after auth check.

## Security model
- **Sanitization**: Zod strips unknown keys by default (`strip`).
- **Type Coercion**: Be careful with `z.coerce` on untrusted input.
- **DoS Prevention**: Limit string lengths (`.max()`) and array sizes.

## Validation
- Use `.safeParse()` instead of `.parse()` to avoid throwing errors.
- Return structured error messages using `.error.flatten()`.

## Caching/rate-limits
- Validation happens before expensive operations (DB/AI), acting as a cheap filter.

## Failure modes
- Returning raw Zod error objects (leaks internal details).
- Forgetting `.max()` on strings (buffer overflow/memory exhaustion).

## Reference implementation
```typescript
import { z } from 'zod';
import { json } from '@sveltejs/kit';

const createCaseSchema = z.object({
  title: z.string().min(3).max(100),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  tags: z.array(z.string()).max(5).optional()
});

export const POST = async ({ request }) => {
  const body = await request.json();
  const result = createCaseSchema.safeParse(body);

  if (!result.success) {
    return json({
      success: false,
      errors: result.error.flatten().fieldErrors
    }, { status: 400 });
  }

  const data = result.data; // Typed as { title: string, ... }
  // ... proceed
};
```

## Integration checklist
1. Define Zod schema with strict constraints.
2. Parse input (`request.json()` or `request.formData()`).
3. Run `safeParse`.
4. Handle `!success` with 400 status.

## Tests
- Test valid payload -> 200.
- Test missing fields -> 400 with specific field error.
- Test invalid types -> 400.
- Test extra fields -> 200 (stripped).
