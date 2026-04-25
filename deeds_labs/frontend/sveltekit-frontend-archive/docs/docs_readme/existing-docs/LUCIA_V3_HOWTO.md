Lucia v3 How‑To Guide

Purpose

- This guide shows how to install, configure and migrate to Lucia v3 in a SvelteKit project
  (server + client integration). It includes sample `hooks.server.ts`, a protected route example,
  environment variables to set, session storage options, and troubleshooting tips.

Prerequisites

- Node.js >= 20
- SvelteKit project (v1 / compatible with Svelte 5)
- A database adapter supported by Lucia (e.g., Postgres via `lucia-auth` adapters, or
  `lucia-auth-sqlite`, etc.)

1. Install Lucia v3 and a DB adapter

From the `sveltekit-frontend` folder run (powershell):

```powershell
npm install lucia-auth@^3.0.0
# pick an adapter, for example postgres via drizzle or prismadb adapter
npm install @lucia-auth/postgres-adapter
# or for prisma:
# npm install lucia-auth@^3.0.0 @lucia-auth/prisma-adapter
```

2. Add environment variables

Create or edit your `.env` (do NOT commit credentials):

```env
# .env
DATABASE_URL=postgres://legal_admin:123456@localhost:5434/legal_ai_db
LUCIA_SECRET=some-long-random-secret
LUCIA_REDIRECT_URL=http://localhost:5173/auth/callback
```

3. Minimal server setup (hooks and auth)

Create `src/lib/server/auth.ts` (example using a postgres adapter):

```ts
import lucia from 'lucia-auth';
import { postgresAdapter } from '@lucia-auth/postgres-adapter';
import { dev } from '$app/environment';

const adapter = postgresAdapter({ connectionString: process.env.DATABASE_URL! });

export const auth = lucia({
  adapter,
  env: dev ? 'DEV' : 'PROD',
  secret: process.env.LUCIA_SECRET!,
  cookie: {
    secure: !dev,
    httpOnly: true,
    sameSite: 'lax',
  },
});
```

Create `src/hooks.server.ts` to attach the Lucia session to `event.locals`:

```ts
import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  // read session from cookie using lucia
  const session = await auth.getSessionFromRequest(event.request).catch(() => null);
  event.locals.user = session?.user ?? null;
  event.locals.session = session ?? null;
  return await resolve(event);
};
```

4. Protecting routes

In `src/routes/protected/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/auth/login');
  }
  return { user: locals.user };
};
```

Or check inside endpoints:

```ts
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  return json({ secret: 'value' });
};
```

5. Client-side usage

To fetch current user data in a Svelte page component, rely on server-provided data (via `load`) or
fetch an API route that returns `locals.user`.

Example `src/routes/profile/+page.server.ts`:

```ts
export const load = ({ locals }) => {
  return { user: locals.user };
};
```

Then in `+page.svelte`:

```svelte
<script lang="ts">
  export let data: { user: any };
</script>

{#if data.user}
  <p>Welcome {data.user.email}</p>
{:else}
  <a href="/auth/login">Sign in</a>
{/if}
```

6. Login / OAuth flows

Lucia v3 offers built-in strategies for OAuth providers. Configure a provider strategy per adapter
docs and create callback routes that call `auth.createSession`.

7. Session management options

- Cookie sessions (recommended for SSR apps): configure lifetimes in `auth` init.
- JWT sessions: optional via adapters.

8. Migration notes from older Lucia versions

- API names may change between v2 and v3; check `auth.createSession`, `auth.invalidateSession`, and
  `auth.getSessionFromRequest` signatures.
- `auth.getUser` may be `auth.getUserById` depending on adapter.

9. Troubleshooting

- Missing types/errors: ensure `types` are installed and TS paths include `node_modules`.
- Session not found: check `LUCIA_SECRET`, cookie names, `sameSite` and `secure` flags when running
  locally.
- OAuth: ensure redirect URLs match provider console and `LUCIA_REDIRECT_URL`.
- If using edge adapters or Vercel/Netlify, prefer stateless JWT sessions or ensure adapter supports
  the environment.

10. Example quick-check script

Run a simple script to verify DB connectivity and basic auth operations (save as
`scripts/lucia-test.mjs`):

```mjs
import { auth } from '../src/lib/server/auth.js';
(async () => {
  try {
    const u = await auth.createUser({
      primaryKey: { providerId: 'email', providerUserId: 'demo@example.com' },
      attributes: { email: 'demo@example.com' },
    });
    console.log('created user', u.id);
  } catch (e) {
    console.error('error', e);
  }
})();
```

Files added

- `sveltekit-frontend/docs/LUCIA_V3_HOWTO.md` (this file)

If you want, I can also:

- Add concrete `src/lib/server/auth.ts` + `src/hooks.server.ts` files tailored to your DB adapter
  (Postgres/Prisma/Drizzle).
- Add a small example `+page.server.ts` and `+page.svelte` for a protected route.
- Run a local quick check script to verify connectivity (if you want me to run commands, say so).
