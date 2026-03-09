# Authentication Utilities - Quick Reference

Import authentication utilities in any server-side file:

```typescript
import {
  resolveUser,
  requireUser,
  getUserId,
  isAuthenticated,
  isDevBypassEnabled,
  getMetaEnv,
  DEV_STUB_USER,
  type MetaEnv
} from '$lib/server/auth/utils';
```

## Common Patterns

### 1. Optional Authentication (with dev bypass)

```typescript
export const load: PageServerLoad = async ({ locals }) => {
  const user = resolveUser(locals);

  // Return demo data when dev bypass is active
  if (!user && isDevBypassEnabled()) {
    return { data: DEMO_DATA, isDemoMode: true };
  }

  // Return empty data for anonymous users
  if (!user) {
    return { data: [], isDemoMode: false };
  }

  // Fetch user-specific data
  return { data: await getUserData(user.id), isDemoMode: false };
};
```

### 2. Required Authentication

```typescript
export const POST: RequestHandler = async ({ locals, request }) => {
  // Throws error if not authenticated (even with dev bypass)
  const user = requireUser(locals);

  const data = await request.json();
  await saveData({ ...data, userId: user.id });

  return json({ success: true });
};
```

### 3. Conditional User ID

```typescript
export const GET: RequestHandler = async ({ locals }) => {
  const userId = getUserId(locals);

  const query = userId
    ? db.select().from(items).where(eq(items.userId, userId))
    : db.select().from(items).where(eq(items.public, true));

  return json({ items: await query });
};
```

### 4. Auth Status Check

```typescript
export const load: PageServerLoad = async ({ locals }) => {
  return {
    isLoggedIn: isAuthenticated(locals),
    user: resolveUser(locals),
  };
};
```

### 5. Environment Variables

```typescript
const metaEnv = getMetaEnv();

const redisUrl = metaEnv.REDIS_URL || 'redis://localhost:6379';
const bypassAuth = metaEnv.DEV_BYPASS_AUTH === 'true';
```

## Function Reference

| Function | Returns | Throws | Dev Bypass |
|----------|---------|--------|------------|
| `resolveUser(locals)` | `User \| null` | No | Returns stub user |
| `requireUser(locals)` | `User` | Yes (if no user) | Returns stub user |
| `getUserId(locals)` | `string \| null` | No | Returns `'1'` |
| `isAuthenticated(locals)` | `boolean` | No | Returns `true` |
| `isDevBypassEnabled()` | `boolean` | No | N/A |
| `getMetaEnv()` | `MetaEnv` | No | N/A |

## Dev Bypass Behavior

When `DEV_BYPASS_AUTH=true` (only in `dev` mode):

```typescript
DEV_STUB_USER = {
  id: '1',
  email: 'dev@local',
  name: 'Developer'
}
```

- ✅ `resolveUser()` returns `DEV_STUB_USER`
- ✅ `requireUser()` returns `DEV_STUB_USER`
- ✅ `getUserId()` returns `'1'`
- ✅ `isAuthenticated()` returns `true`
- ⚠️ Console warning: "DEV_BYPASS_AUTH active"

## Configuration

### `.env.development`
```bash
DEV_BYPASS_AUTH=true
```

### `vite.config.ts` (alternative)
```typescript
export default defineConfig({
  define: {
    'import.meta.env.DEV_BYPASS_AUTH': JSON.stringify('true'),
  },
});
```

## Type Safety

```typescript
// Typed environment access
const metaEnv = getMetaEnv();
metaEnv.REDIS_URL;        // ✅ string | undefined
metaEnv.DEV_BYPASS_AUTH;  // ✅ string | undefined
metaEnv.anyOtherVar;      // ✅ string | undefined

// User type is properly inferred
const user = resolveUser(locals);
if (user) {
  user.id;    // ✅ string
  user.email; // ✅ string (if defined in App.Locals['user'])
  user.name;  // ✅ string (if defined in App.Locals['user'])
}
```

## Examples by Use Case

### Public API Endpoint
```typescript
export const GET: RequestHandler = async ({ locals }) => {
  const userId = getUserId(locals);

  // Public data visible to everyone
  const data = await getPublicData(userId); // Optional user context

  return json(data);
};
```

### Protected API Endpoint
```typescript
export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals, 'Login required');

  const body = await request.json();
  await createResource({ ...body, ownerId: user.id });

  return json({ success: true });
};
```

### Page with Optional User
```typescript
export const load: PageServerLoad = async ({ locals }) => {
  const user = resolveUser(locals);

  const [publicPosts, userPosts] = await Promise.all([
    getPublicPosts(),
    user ? getUserPosts(user.id) : [],
  ]);

  return { publicPosts, userPosts, user };
};
```

### Page Requiring Auth
```typescript
export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals);

  const [profile, settings] = await Promise.all([
    getUserProfile(user.id),
    getUserSettings(user.id),
  ]);

  return { user, profile, settings };
};
```

## Migration Checklist

- [ ] Import utilities from `$lib/server/auth/utils`
- [ ] Replace `MetaEnv` type with `getMetaEnv()`
- [ ] Replace local `resolveUser` with imported version
- [ ] Remove duplicate auth code
- [ ] Test with `DEV_BYPASS_AUTH=true`
- [ ] Test with `DEV_BYPASS_AUTH=false`
- [ ] Verify production behavior

## Testing

```typescript
import { resolveUser, DEV_STUB_USER } from '$lib/server/auth/utils';

// Mock authenticated user
const mockLocals = {
  user: { id: '123', email: 'user@test.com', name: 'Test User' }
};

const user = resolveUser(mockLocals as any);
expect(user?.id).toBe('123');

// Mock unauthenticated (dev bypass)
process.env.DEV_BYPASS_AUTH = 'true';
const stubUser = resolveUser({} as any);
expect(stubUser).toEqual(DEV_STUB_USER);
```

## Troubleshooting

**Dev bypass not working?**
- Ensure `dev` mode is active
- Check `DEV_BYPASS_AUTH=true` in env
- Look for console warning message
- Verify import from correct path

**TypeScript errors?**
- Ensure `App.Locals['user']` is defined in `src/app.d.ts`
- Check import path: `$lib/server/auth/utils`
- Verify SvelteKit version compatibility

**User is null in production?**
- Dev bypass only works in `dev` mode
- Check Lucia auth setup
- Verify session middleware
- Check `locals.user` is being set
