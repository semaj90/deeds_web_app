# 🔐 Authentication - Quick Reference Card

## Start Dev Server
```bash
cd sveltekit-frontend
REDIS_PASSWORD="redis" \
DATABASE_URL="postgresql://legal_admin:123456@localhost:5432/legal_ai_db" \
npm run dev -- --port 5173 --host 127.0.0.1
```

## Test Credentials (Pick One)
```
📧 demo@legal-ai.com           🔐 demo123
📧 admin@legal.ai.dev          🔐 AdminPassword123!
📧 prosecutor@legal.ai.dev     🔐 ProsecutorPass123!
📧 detective@legal.ai.dev      🔐 DetectivePass123!
📧 analyst@legal.ai.dev        🔐 AnalystPass123!
```

## Access URLs
| Purpose | URL | Status |
|---------|-----|--------|
| **Login Form** | `http://localhost:5173/login` | ✅ Public |
| **Dashboard** | `http://localhost:5173/(ai)/dashboard` | 🔒 Protected |
| **API Login** | `POST /api/auth/login` | ✅ Public |

## Form-Based Login
```
1. Visit http://localhost:5173/login
2. Enter email: demo@legal-ai.com
3. Enter password: demo123
4. Click "Login"
5. ✅ Redirected to dashboard
```

## API Login (cURL)
```bash
curl -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@legal-ai.com",
    "password": "demo123"
  }'
```

### Success Response
```json
{
  "success": true,
  "user": {
    "id": "b679a93c-e460-4ce6-8dae-f82abcd2f731",
    "email": "demo@legal-ai.com",
    "firstName": "Demo",
    "lastName": "User",
    "role": "prosecutor",
    "avatarUrl": null
  },
  "session": {
    "id": "vxewalm57vmdyfbsdremrtipaillsnbl7up24fhi",
    "expiresAt": "2025-11-25T06:50:56.987Z"
  }
}
```

## Code Patterns

### Protect a Route
```typescript
// src/routes/protected/+page.server.ts
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }
  return { user: locals.user };
};
```

### Get Current User
```typescript
// In any component or endpoint
let user = $page.data.user;
let isAuthenticated = !!user;
```

### Password Hashing (Register)
```typescript
import bcrypt from 'bcryptjs';

const hash = await bcrypt.hash(password, 12);
```

### Password Verification (Login)
```typescript
import bcrypt from 'bcryptjs';

const isValid = await bcrypt.compare(password, hashedPassword);
```

## Common Issues & Fixes

### ❌ "Invalid email or password"
- Check email spelling (case-sensitive)
- Verify user exists in database
- Test with `demo@legal-ai.com` / `demo123`

### ❌ "Session not found"
- Cookies not enabled in browser
- Check DevTools → Application → Cookies for `auth_session`
- Try clearing cookies and login again

### ❌ "The client is closed" (Redis)
- This is a warning, not an error
- App works fine without Redis
- For production Redis, set REDIS_PASSWORD env var

### ❌ Redirect loop (login → dashboard → login)
- Check `/(ai)/dashboard/+page.server.ts` exists
- Verify hooks.server.ts is running
- Clear cookies and try again

## Database Queries

### View All Users
```sql
SELECT id, email, role, is_active FROM users;
```

### View Sessions
```sql
SELECT id, user_id, expires_at FROM sessions;
```

### Reset User Password
```sql
-- Generate new bcryptjs hash with: await bcrypt.hash('newpass', 12)
UPDATE users SET hashed_password = '$2a$12$...' WHERE email = 'user@test.com';
```

### Create New User
```sql
-- Hash password first: await bcrypt.hash('password', 12)
INSERT INTO users (id, email, hashed_password, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'newuser@test.com',
  '$2a$12$...',  -- bcryptjs hash
  'First',
  'Last',
  'prosecutor',
  true,
  NOW(),
  NOW()
);
```

## Session Duration
- **Default**: 30 days
- **Cookie Name**: `auth_session`
- **Storage**: PostgreSQL `sessions` table
- **Auto-renew**: Yes (on each request)

## Security Features
✅ bcryptjs password hashing (12 rounds)
✅ httpOnly cookies (server-side only)
✅ sameSite=lax (prevents CSRF)
✅ Secure flag in production (HTTPS)
✅ Session validation on every request
✅ Automatic session expiration

## Files to Know
- **Login Page**: `src/routes/login/+page.server.ts`
- **API Endpoint**: `src/routes/api/auth/login/+server.ts`
- **Dashboard**: `src/routes/(ai)/dashboard/+page.server.ts`
- **Auth Service**: `src/lib/server/auth.ts`
- **Auth Hooks**: `src/hooks.server.ts`
- **Seed Script**: `scripts/seed-test-users.ts`

## Full Documentation
See these files for complete details:
- `FINAL_AUTH_SUMMARY.md` - Complete overview
- `AUTHENTICATION_SETUP_COMPLETE.md` - Technical details
- `LANGEXTRACT_QUICK_START.md` - Language support

---

**Status**: ✅ Working
**Last Updated**: October 26, 2025
**Session Expiry**: 30 days
