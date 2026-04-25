# Development Bypass Authentication - Testing Guide

## 🔓 What is DEV_BYPASS_AUTH?

`DEV_BYPASS_AUTH` is a development-only feature flag that allows testing file uploads, database operations, and API access **without requiring user authentication**.

## ⚙️ How to Enable

### Option 1: Environment Variable (Recommended)
```bash
# In .env.development or .env
DEV_BYPASS_AUTH=true
```

### Option 2: Quick Test
```bash
# PowerShell
$env:DEV_BYPASS_AUTH="true"; npm run dev

# Bash/Terminal
DEV_BYPASS_AUTH=true npm run dev
```

## 🎯 What It Enables

When `DEV_BYPASS_AUTH=true` is set in development mode:

1. **Automatic Stub User Creation**
   - User ID: `dev-user-001`
   - Email: `dev@localhost`
   - Role: `prosecutor`
   - No password required

2. **API Endpoints Bypass Auth**
   - `/api/cases` - List and create cases
   - `/api/evidence` - Upload evidence files
   - `/api/documents` - Document management
   - All other protected endpoints

3. **Database Operations**
   - Records saved with `dev-user-001` as creator
   - Full CRUD operations allowed
   - Vector embeddings generated
   - RAG queries processed

4. **Visual Indicator**
   - Yellow development banner shows on pages
   - Console logs indicate bypass is active

## 📋 Example Usage

### Testing File Upload Without Auth
```typescript
// Upload files directly without login
const formData = new FormData();
formData.append('file', myFile);
formData.append('caseId', 'test-case-001');

const response = await fetch('/api/evidence/upload', {
  method: 'POST',
  body: formData
});

// Works! Dev user is injected automatically
```

### Testing Case Creation
```typescript
// Create cases without authentication
const newCase = {
  title: 'Test Case',
  description: 'Testing without auth',
  priority: 'medium',
  status: 'open'
};

const response = await fetch('/api/cases', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(newCase)
});

// Saved to database with dev-user-001 as creator
```

## 🔒 Security Notes

### ⚠️ IMPORTANT: Production Safety

1. **Only Works in Development**
   ```typescript
   const devBypass = dev && process.env.DEV_BYPASS_AUTH === 'true';
   ```
   - Requires `dev === true` (NODE_ENV !== 'production')
   - Fails silently in production builds

2. **Never Deploy with DEV_BYPASS_AUTH=true**
   - Add to `.gitignore`: `.env.development`
   - Production uses `.env.production` without bypass
   - CI/CD should validate this

3. **Console Warnings**
   ```
   🔓 DEV_BYPASS_AUTH: Creating stub user for development testing
   ```
   - Clearly indicates bypass is active
   - Helps prevent accidental production use

## 📁 Where It's Implemented

### Server-Side Load Functions
```typescript
// src/routes/(legal)/cases/+page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  const devBypass = dev && process.env.DEV_BYPASS_AUTH === 'true';

  if (devBypass && !locals.user) {
    locals.user = { id: 'dev-user-001', email: 'dev@localhost', ... };
  }
  // ...
};
```

### API Endpoints
```typescript
// src/routes/api/cases/+server.ts
function resolveUser(locals: App.Locals) {
  if (locals?.user) return locals.user;

  const bypass = dev && process.env.DEV_BYPASS_AUTH === 'true';
  if (bypass) {
    return { id: '1', email: 'dev@local', name: 'Developer' };
  }
  return null;
}
```

### Client Components
```svelte
<!-- src/routes/(legal)/cases/+page.svelte -->
{#if devBypassActive}
  <div class="dev-banner">
    🔓 Development Mode: Authentication Bypassed
  </div>
{/if}
```

## 🧪 Testing Checklist

- [ ] File uploads save to database
- [ ] MinIO stores uploaded files
- [ ] Vector embeddings generated
- [ ] Cases display in UI
- [ ] Evidence canvas works
- [ ] RAG queries execute
- [ ] Database records show `dev-user-001`
- [ ] No authentication errors in console

## 🚀 Quick Start

1. **Copy environment file**
   ```bash
   cp .env.example .env.development
   ```

2. **Ensure DEV_BYPASS_AUTH=true**
   ```bash
   echo "DEV_BYPASS_AUTH=true" >> .env.development
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Visit protected routes**
   - http://localhost:5173/(legal)/cases
   - http://localhost:5173/evidence/upload
   - Yellow banner confirms bypass is active

## 🐛 Troubleshooting

### Still Getting 401 Errors?
1. Check `.env.development` exists
2. Verify `DEV_BYPASS_AUTH=true` (no quotes)
3. Restart dev server (`Ctrl+C` then `npm run dev`)
4. Check console for warning message

### Not Seeing Dev Banner?
1. Ensure `dev` mode is active (NODE_ENV !== 'production')
2. Check `import.meta.env.DEV` returns true
3. Verify route has `+page.server.ts` with bypass logic

### Database Records Show "null" User?
1. API endpoint may not have bypass implemented
2. Add `resolveUser()` function to endpoint
3. Check server logs for bypass confirmation

## 📚 Related Files

- `.env.example` - Template with all variables
- `.env.development` - Development config (gitignored)
- `src/routes/api/cases/+server.ts` - API bypass implementation
- `src/routes/(legal)/cases/+page.server.ts` - SSR bypass implementation
- `src/hooks.server.ts` - Global auth handling

---

**Remember**: This is for **development and testing only**. Never use in production!
