---
tags: ["sveltekit", "api", "rest", "routing"]
symbols: ["json", "error", "RequestHandler", "params", "url"]
route_kind: ["endpoint"]
http_methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
risk: ["security"]
---

# SvelteKit REST Route Structure

## Intent
Standardizes the structure of API endpoints to ensure consistent error handling, type safety, and response formatting across the application.

## When to use / when not
Use for all `/api/*` routes that return JSON. Do not use for page load functions (`+page.server.ts`) which should return data objects for Svelte components.

## Route structure
Located in `src/routes/api/[resource]/+server.ts`.
Exports `GET`, `POST`, etc. functions typed with `RequestHandler`.

## Security model
- **Auth**: Check `locals.user` or `locals.session` immediately. Throw `401` if missing.
- **CSRF**: SvelteKit handles origin checks automatically for non-GET requests.
- **Headers**: Use standard headers.

## Validation
- Use Zod for request body parsing.
- Use `z.parse()` or `safeParse()`.
- Return 400 for validation errors.

## Caching/rate-limits
- Apply rate limiting middleware or logic before business logic.
- Set `Cache-Control` headers for GET requests where appropriate.

## Failure modes
- Returning 500 for expected errors (use `error()` helper).
- Leaking stack traces in production.

## Reference implementation
```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const schema = z.object({ name: z.string() });
  const body = await request.json();
  const result = schema.safeParse(body);

  if (!result.success) {
    return json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
  }

  return json({ success: true, data: { id: 1, ...result.data } });
};
```

## Integration checklist
1. Create `+server.ts`.
2. Add `RequestHandler` type.
3. Add Auth check.
4. Add Zod validation.
5. Return `json()`.

## Tests
- Test 401 (Unauth).
- Test 400 (Invalid Input).
- Test 200 (Success).
