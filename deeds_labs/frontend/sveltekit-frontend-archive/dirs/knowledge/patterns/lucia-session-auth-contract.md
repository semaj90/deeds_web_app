---
tags: ["auth", "lucia", "session", "security"]
symbols: ["validateSession", "locals.user", "locals.session", "Cookie"]
route_kind: ["endpoint", "page"]
http_methods: ["ALL"]
risk: ["security", "data-loss"]
---

# Lucia Session Auth Contract

## Intent
Defines the contract for session management, cookie handling, and authentication state across the application.

## When to use / when not
Use this contract for all protected routes and API endpoints. Do not roll your own session management.

## Route structure
- `src/hooks.server.ts`: Handles session validation on every request.
- `src/lib/server/auth.ts`: Lucia configuration.

## Security model
- **Cookie Name**: `auth_session` (configured in `.env`).
- **Attributes**: `HttpOnly`, `Secure`, `SameSite=Lax` (Strict for some).
- **CSRF**: Handled by SvelteKit's origin check.

## Validation
- `locals.user` is populated if session is valid.
- `locals.session` contains session metadata.
- If `locals.user` is null, the user is unauthenticated.

## Caching/rate-limits
- Session validation hits the database (or Redis if configured).
- Rate limit login attempts to prevent brute force.

## Failure modes
- Session expiry (requires redirect to login).
- Invalid cookie format.
- Database downtime (fails open or closed? Closed).

## Reference implementation
```typescript
// src/hooks.server.ts
import { lucia } from '$lib/server/auth';

export const handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(lucia.sessionCookieName);
	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await lucia.validateSession(sessionId);
	if (session && session.fresh) {
		const sessionCookie = lucia.createSessionCookie(session.id);
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
	}
	if (!session) {
		const sessionCookie = lucia.createBlankSessionCookie();
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
	}
	event.locals.user = user;
	event.locals.session = session;
	return resolve(event);
};
```

## Integration checklist
1. Ensure `hooks.server.ts` is active.
2. Check `locals.user` in `load` functions or API handlers.
3. Use `lucia.createSessionCookie` for login.
4. Use `lucia.invalidateSession` for logout.

## Tests
- Test valid session (populates locals).
- Test invalid session (clears cookie).
- Test expired session (redirects).
