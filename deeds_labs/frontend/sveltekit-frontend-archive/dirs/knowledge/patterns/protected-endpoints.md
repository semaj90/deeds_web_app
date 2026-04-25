# Protected Endpoints & Authorization Patterns

## Overview
This document defines the standard patterns for securing API endpoints and Page Load functions in the SvelteKit application using Lucia Auth.

## Core Principles
1.  **Fail Closed**: Endpoints should deny access by default.
2.  **Explicit Checks**: Every protected route must explicitly check `locals.user`.
3.  **Role-Based Access Control (RBAC)**: Check specific permissions, not just authentication.

## Implementation Patterns

### 1. Server-Side Load Functions (`+page.server.ts`)

```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // 1. Authentication Check
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // 2. Authorization Check (Optional)
  if (locals.user.role !== 'ADMIN') {
    throw redirect(302, '/dashboard'); // Or 403 error
  }

  return {
    user: locals.user
  };
};
```

### 2. API Endpoints (`+server.ts`)

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  // 1. Authentication Check
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Authorization Check
  if (!locals.user.permissions.includes('WRITE_DATA')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  // ... logic ...
};
```

### 3. Form Actions (`+page.server.ts`)

```typescript
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ locals, request }) => {
    if (!locals.user) {
      return fail(401, { message: 'Unauthorized' });
    }

    // ... logic ...
  }
};
```

## Security Checklist
- [ ] **Middleware**: Ensure `hooks.server.ts` populates `locals.user`.
- [ ] **CSRF Protection**: SvelteKit handles this automatically for Form Actions, but verify `origin` headers for API endpoints.
- [ ] **Rate Limiting**: Apply rate limiting to sensitive endpoints (Login, Register, Password Reset).
