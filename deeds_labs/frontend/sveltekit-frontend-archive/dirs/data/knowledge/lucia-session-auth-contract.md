# Lucia Session Auth Contract

## Tags
#lucia #auth #session #cookie #csrf #security #lucia-v3 #authentication #authorization

## Symbols
`lucia` `validateSession` `createSessionCookie` `createBlankSessionCookie` `event.locals.user` `event.locals.session` `sessionId` `cookies` `auth_session` `Handle` `RequestEvent`

## Route Kind
middleware auth

## HTTP Methods
ALL

## Risk Factors
security data-loss

---

## Intent

The Lucia v3 session contract defines the canonical authentication implementation for this SvelteKit application. It establishes:
- How sessions are created, validated, and destroyed
- What data lives in `event.locals` (user, session)
- Cookie configuration (name, domain, httpOnly, secure)
- CSRF protection rules
- Error behavior (401 vs 403, redirects, JSON responses)

**Solves:**
- Consistent auth state across all routes (pages + API endpoints)
- Type-safe user/session access in load functions and endpoints
- Secure session storage with automatic refresh
- Protection against session fixation and CSRF attacks

---

## When to Use / When Not

### Use Lucia Sessions When:
- Building multi-page applications with server-side auth
- Need secure, HTTP-only cookie-based sessions
- Require automatic session refresh and expiry
- Want type-safe auth state (`event.locals.user`)
- Building protected API endpoints

### Do NOT Use When:
- Building stateless JWT-only APIs (use JWT validation instead)
- OAuth-only flow with no server sessions (use OAuth provider's session)
- Server-to-server API auth (use API keys)
- Real-time connections where cookies aren't sent (WebSockets - send token in connection)

---

## Session Contract

### Cookie Configuration

**Cookie Name:** `auth_session` (configurable via env)

**Cookie Attributes:**
```typescript
{
  path: '/',
  httpOnly: true,        // Cannot be accessed via JavaScript
  secure: production,    // HTTPS-only in production
  sameSite: 'lax',       // CSRF protection (allows GET from external sites)
  maxAge: 60 * 60 * 24 * 30  // 30 days
}
```

**Environment Variables:**
```bash
AUTH_COOKIE_NAME=auth_session
AUTH_COOKIE_DOMAIN=         # Empty for same-domain only
AUTH_COOKIE_SECURE=true     # Force HTTPS in production
```

### Session Lookup Method

**Primary:** Cookie-based session ID validation

```typescript
// hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  // 1. Extract session ID from cookie
  const sessionId = event.cookies.get('auth_session');

  if (!sessionId) {
    event.locals.user = null;
    event.locals.session = null;
    return resolve(event);
  }

  // 2. Validate session with Lucia
  const { session, user } = await lucia.validateSession(sessionId);

  // 3. Refresh session if needed (extends expiry)
  if (session && session.fresh) {
    const sessionCookie = lucia.createSessionCookie(session.id);
    event.cookies.set(sessionCookie.name, sessionCookie.value, {
      path: '/',
      ...sessionCookie.attributes
    });
  }

  // 4. Clear invalid sessions
  if (!session) {
    const sessionCookie = lucia.createBlankSessionCookie();
    event.cookies.set(sessionCookie.name, sessionCookie.value, {
      path: '/',
      ...sessionCookie.attributes
    });
  }

  // 5. Populate locals for downstream use
  event.locals.session = session;
  event.locals.user = user;

  return resolve(event);
};
```

### What Goes Into `event.locals`

**Type Definition:**
```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        username: string;
        email: string | null;
        role: 'USER' | 'ADMIN' | 'INVESTIGATOR';
        createdAt: Date;
      } | null;
      session: {
        id: string;
        userId: string;
        expiresAt: Date;
        fresh: boolean;
      } | null;
    }
  }
}
```

**Access in Load Functions:**
```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  return {
    user: {
      id: locals.user.id,
      username: locals.user.username,
      role: locals.user.role
    }
  };
};
```

**Access in API Endpoints:**
```typescript
// +server.ts
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  // User is authenticated
  const userId = locals.user.id;
  // ...
};
```

### Required Headers

**None required** - Lucia uses cookies which are sent automatically by browsers.

**Optional CSRF Header (for external clients):**
```typescript
// Custom CSRF validation for non-browser clients
const csrfToken = event.request.headers.get('X-CSRF-Token');
```

**Security Note:** SvelteKit validates `Origin` header automatically for form actions and `POST` requests from same domain.

---

## CSRF Protection Rules

### Built-in Protection (SvelteKit)

**Automatic for:**
- Form actions (`<form method="POST">`)
- Same-origin fetch requests
- Requests with `Origin` header matching host

**Implementation:**
```typescript
// SvelteKit automatically validates Origin header
// No additional code needed for same-origin requests
```

### External Client Protection

**For API clients (Postman, mobile apps, external services):**

```typescript
// src/lib/server/csrf.ts
export function validateCSRFToken(event: RequestEvent) {
  const token = event.request.headers.get('X-CSRF-Token');
  const storedToken = event.cookies.get('csrf_token');

  if (!token || !storedToken || token !== storedToken) {
    throw error(403, 'CSRF validation failed');
  }
}

// Generate CSRF token on login
export async function generateCSRFToken(event: RequestEvent): Promise<string> {
  const token = crypto.randomUUID();
  event.cookies.set('csrf_token', token, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'strict',
    maxAge: 60 * 60 // 1 hour
  });
  return token;
}
```

**Usage in Protected Endpoint:**
```typescript
export const POST: RequestHandler = async (event) => {
  validateCSRFToken(event);
  // ... proceed with operation
};
```

### Bypass CSRF (Service-to-Service Auth)

**Use API keys instead of cookies:**
```typescript
const apiKey = event.request.headers.get('X-API-Key');

if (!apiKey || !await validateAPIKey(apiKey)) {
  throw error(401, 'Invalid API key');
}
```

---

## Error Behavior

### 401 Unauthorized (Not Logged In)

**Trigger:** `!locals.user`

**Page Routes:** Redirect to login
```typescript
// +page.server.ts
if (!locals.user) {
  throw redirect(302, '/login?redirect=' + event.url.pathname);
}
```

**API Routes:** Return JSON error
```typescript
// +server.ts
if (!locals.user) {
  throw error(401, {
    message: 'Authentication required',
    code: 'UNAUTHORIZED'
  });
}
```

**Response:**
```json
{
  "message": "Authentication required",
  "code": "UNAUTHORIZED"
}
```

### 403 Forbidden (Insufficient Permissions)

**Trigger:** User authenticated but lacks required role/permission

**Implementation:**
```typescript
// Check role authorization
if (!locals.user) {
  throw error(401, 'Unauthorized');
}

if (locals.user.role !== 'ADMIN') {
  throw error(403, {
    message: 'Insufficient permissions',
    code: 'FORBIDDEN',
    required: 'ADMIN',
    current: locals.user.role
  });
}
```

**Response:**
```json
{
  "message": "Insufficient permissions",
  "code": "FORBIDDEN",
  "required": "ADMIN",
  "current": "USER"
}
```

### Session Expiry Behavior

**Expired Session:**
- `lucia.validateSession()` returns `{ session: null, user: null }`
- Blank session cookie set to clear client-side cookie
- `event.locals.user` and `event.locals.session` are `null`
- Next request will trigger 401/redirect flow

**Fresh Session:**
- `session.fresh === true` means session was just refreshed
- New cookie with extended expiry is set
- User remains logged in

---

## Session Lifecycle

### 1. Login (Create Session)

```typescript
// src/routes/login/+page.server.ts
import { lucia } from '$lib/server/auth/lucia';

export const actions = {
  default: async ({ request, cookies }) => {
    const formData = await request.formData();
    const username = formData.get('username')?.toString();
    const password = formData.get('password')?.toString();

    // 1. Validate credentials
    const user = await validateCredentials(username, password);

    if (!user) {
      return fail(400, { message: 'Invalid credentials' });
    }

    // 2. Create session
    const session = await lucia.createSession(user.id, {});

    // 3. Set session cookie
    const sessionCookie = lucia.createSessionCookie(session.id);
    cookies.set(sessionCookie.name, sessionCookie.value, {
      path: '/',
      ...sessionCookie.attributes
    });

    // 4. Redirect to dashboard
    throw redirect(302, '/dashboard');
  }
};
```

### 2. Session Validation (Every Request)

```typescript
// hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('auth_session');

  if (sessionId) {
    const { session, user } = await lucia.validateSession(sessionId);

    if (session?.fresh) {
      // Extend session expiry
      const sessionCookie = lucia.createSessionCookie(session.id);
      event.cookies.set(sessionCookie.name, sessionCookie.value, {
        path: '/',
        ...sessionCookie.attributes
      });
    }

    event.locals.user = user;
    event.locals.session = session;
  }

  return resolve(event);
};
```

### 3. Logout (Destroy Session)

```typescript
// src/routes/logout/+server.ts
import { lucia } from '$lib/server/auth/lucia';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.session) {
    throw error(401, 'Not logged in');
  }

  // 1. Invalidate session in database
  await lucia.invalidateSession(locals.session.id);

  // 2. Clear session cookie
  const sessionCookie = lucia.createBlankSessionCookie();
  cookies.set(sessionCookie.name, sessionCookie.value, {
    path: '/',
    ...sessionCookie.attributes
  });

  // 3. Redirect to login
  throw redirect(302, '/login');
};
```

---

## Database Schema

**Session Table (PostgreSQL):**
```sql
CREATE TABLE user_session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_user_session_user_id ON user_session(user_id);
```

**Drizzle Schema:**
```typescript
// src/lib/server/db/schema-postgres.ts
export const userSession = pgTable('user_session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
});
```

---

## Common Patterns

### Protected Page
```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  return { user: locals.user };
};
```

### Protected API Endpoint
```typescript
// +server.ts
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Proceed with operation
};
```

### Role-Based Access
```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  if (locals.user.role !== 'ADMIN') {
    throw error(403, 'Admin access required');
  }

  return { adminData: await fetchAdminData() };
};
```

### Optional Authentication
```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  // Page accessible to all, but personalized if logged in
  return {
    user: locals.user || null,
    publicData: await fetchPublicData(),
    personalizedData: locals.user ? await fetchUserData(locals.user.id) : null
  };
};
```

---

## Testing

### Unit Test (Session Validation)
```typescript
// tests/unit/auth/session.test.ts
import { describe, it, expect } from 'vitest';
import { lucia } from '$lib/server/auth/lucia';

describe('Lucia Session', () => {
  it('creates valid session', async () => {
    const session = await lucia.createSession('user123', {});
    expect(session.id).toBeDefined();
    expect(session.userId).toBe('user123');
  });

  it('validates active session', async () => {
    const session = await lucia.createSession('user123', {});
    const { session: validated, user } = await lucia.validateSession(session.id);

    expect(validated).toBeDefined();
    expect(user).toBeDefined();
  });

  it('returns null for invalid session', async () => {
    const { session, user } = await lucia.validateSession('invalid-session-id');

    expect(session).toBeNull();
    expect(user).toBeNull();
  });
});
```

### Integration Test (Login Flow)
```typescript
// tests/integration/auth/login.test.ts
import { describe, it, expect } from 'vitest';

describe('Login Flow', () => {
  it('sets session cookie on successful login', async () => {
    const response = await fetch('http://localhost:5173/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=testuser&password=testpass'
    });

    const cookies = response.headers.get('set-cookie');
    expect(cookies).toContain('auth_session=');
    expect(response.status).toBe(302); // Redirect after login
  });

  it('rejects invalid credentials', async () => {
    const response = await fetch('http://localhost:5173/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=invalid&password=wrong'
    });

    expect(response.status).toBe(400);
  });
});
```

---

## Security Checklist

- [x] Session cookies are `httpOnly` (not accessible via JavaScript)
- [x] Session cookies are `secure` in production (HTTPS only)
- [x] Session cookies use `sameSite: 'lax'` (CSRF protection)
- [x] Sessions expire after inactivity (30 days default)
- [x] Fresh sessions are automatically refreshed (extends expiry)
- [x] Invalid sessions are cleared with blank cookie
- [x] Password hashing uses Argon2 (Lucia default)
- [x] `event.locals` is populated on every request
- [x] Protected routes check `locals.user`
- [x] API endpoints return consistent error shapes (401/403)
- [x] CSRF protection via `Origin` header validation
- [x] Database uses foreign key constraints (`ON DELETE CASCADE`)

---

## Troubleshooting

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `locals.user` is always `null` | `hooks.server.ts` not running | Ensure `handle` is exported |
| Session cookie not set | Cookie attributes misconfigured | Check `secure` attribute matches env (HTTP vs HTTPS) |
| Redirect loop on login | Session created but cookie not sent | Verify cookie `path: '/'` and domain matches |
| 401 on authenticated request | Session expired | Check session `expiresAt` in database |
| `Cannot read 'id' of null` | Missing null check on `locals.user` | Always check `if (!locals.user)` first |
| CSRF error on form submit | `Origin` header blocked | Check reverse proxy preserves `Origin` header |
| Logout doesn't work | Session invalidation failed | Check database connection + session ID validity |
