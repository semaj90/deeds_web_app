---
tags: ["security", "api", "auth", "middleware"]
symbols: ["locals.user", "redirect", "error", "401", "403"]
route_kind: ["endpoint", "page"]
http_methods: ["ALL"]
risk: ["security"]
---

# Protected Endpoints Patterns

## Intent
Ensures that sensitive routes and data are only accessible to authenticated and authorized users.

## When to use / when not
Apply to any route that exposes user data or performs actions. Public routes (login, landing page) are exceptions.

## Route structure
- **Page Load**: Check `locals.user` at the top of `load`.
- **Form Action**: Check `locals.user` at the top of `actions`.
- **API Handler**: Check `locals.user` at the top of `GET`/`POST`.

## Security model
- **Authentication**: Verify identity (Who are you?).
- **Authorization**: Verify permissions (Can you do this?).
- **Fail Secure**: Default to deny.

## Validation
- `if (!locals.user) throw redirect(302, '/login')` (Pages).
- `if (!locals.user) throw error(401, 'Unauthorized')` (API).

## Caching/rate-limits
- Do not cache private data in shared caches (CDN).
- Use `Cache-Control: private, no-store`.

## Failure modes
- Leaking data via unawaited promises.
- Checking auth but forgetting to return/throw.

## Reference implementation
```typescript
// +page.server.ts
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }
  // ... fetch user data
};

// +server.ts (API)
import { error, json } from '@sveltejs/kit';

export const POST = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }
  // ... perform action
};
```

## Integration checklist
1. Identify all protected routes.
2. Add the auth check guard clause at the very top.
3. Verify redirect vs error behavior.

## Tests
- Access protected page without session -> Redirect to login.
- Access protected API without session -> 401 JSON.
