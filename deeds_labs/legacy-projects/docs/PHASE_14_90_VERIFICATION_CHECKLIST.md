# Phase 14 & 90: Pre-Deployment Verification Checklist

**Date:** 2025-12-06
**Purpose:** Verify all ports, secrets, and configurations are consistent before going live

---

## ✅ Critical Consistency Checks

### 1. PostgreSQL Port Alignment

**Current Phase 14 config:** `5432`
**Phase 90 script:** `5432`

**Verify these all match:**

```powershell
# Check what port PostgreSQL is actually running on
Get-Process postgres | Select-Object Id,ProcessName
netstat -an | findstr "543"

# Test connection with Phase 14 port
$env:PGPASSWORD='123456'
psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -c "SELECT 1;"
```

**If you see 5434 instead of 5432:**
- [ ] Either move PostgreSQL to 5432, OR
- [ ] Update Phase 14 config to 5434
- [ ] Update Phase 90 script to 5434

**Files to check if changing:**
- `docs/PHASE_14_ENVIRONMENT_CONFIG.md` - `PGPORT`, `DATABASE_URL`
- `sveltekit-frontend/scripts/phase90-migration-safety.ps1` - `$DbPort`
- `.env.phase14` (once created)
- `sveltekit-frontend/.env`

---

### 2. Redis Port Alignment

**Current Phase 14 config:** `4005`

**Verify Redis is actually on 4005:**

```powershell
# Check Redis port
netstat -an | findstr "400"
netstat -an | findstr "6379"

# Test connection
redis-cli -h 127.0.0.1 -p 4005 -a redis PING
```

**If Redis is on 6379:**
- [ ] Update Phase 14 config:
  ```env
  REDIS_URL=redis://127.0.0.1:6379
  ```

**If Redis is on 4005 (current assumption):**
- [ ] ✅ No change needed

**Files to check if changing:**
- `docs/PHASE_14_ENVIRONMENT_CONFIG.md` - `REDIS_URL`
- `.env.phase14`
- `sveltekit-frontend/.env`

---

### 3. Lucia Auth Secret Name

**Current Phase 14 config:** `LUCIA_AUTH_SECRET`

**Verify your Lucia setup uses this name:**

```powershell
# Search for AUTH_SECRET usage in your code
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
rg "AUTH_SECRET" src/lib/server/auth/
```

**Expected patterns:**
```typescript
// Option A: Uses LUCIA_AUTH_SECRET
const lucia = new Lucia(adapter, {
  secret: env.LUCIA_AUTH_SECRET,
  // ...
});

// Option B: Uses AUTH_SECRET
const lucia = new Lucia(adapter, {
  secret: env.AUTH_SECRET,
  // ...
});
```

**Action:**
- [ ] If code uses `AUTH_SECRET`, update Phase 14 to use `AUTH_SECRET`
- [ ] If code uses `LUCIA_AUTH_SECRET`, ✅ no change needed (current)

**Files to check if changing:**
- `docs/PHASE_14_ENVIRONMENT_CONFIG.md`
- `.env.phase14`
- `sveltekit-frontend/.env`

---

### 4. VS Code Task (Optional)

**If you're using the VS Code task from the docs:**

**Check this typo is fixed:**

```json
// WRONG (has space in Copy-Item)
"command": "Copy- Item ..\\env.phase14 .\\.env -Force; npm run dev:quic"

// CORRECT
"command": "Copy-Item ..\\.env.phase14 .\\.env -Force; npm run dev:quic"
```

**Files to check:**
- `.vscode/tasks.json`

---

## 🔐 Security Checklist (Before Production)

### Development (Current)

These are **intentionally weak** for local dev:

```env
PGPASSWORD=123456                    # ⚠️ Weak, dev only
LUCIA_AUTH_SECRET=replace_with...    # 🔴 MUST change
REDIS_PASSWORD=redis                 # ⚠️ Weak, dev only
MINIO_SECRET_KEY=change_me...        # 🔴 MUST change
```

### Production

- [ ] **Generate strong LUCIA_AUTH_SECRET:**
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- [ ] **Change PostgreSQL password** from `123456` to something strong

- [ ] **Change Redis password** from `redis` to something strong

- [ ] **Change MinIO credentials** from `legalminio/change_me_minio_secret`

- [ ] **Update RabbitMQ** from `guest/guest` to dedicated user

- [ ] **Set `NODE_ENV=production`**

- [ ] **Set `SESSION_COOKIE_SECURE=true`** (requires HTTPS)

- [ ] **Disable debug tools:**
  ```env
  VITE_PUBLIC_SHOW_DEBUG_TOOLS=false
  VITE_PUBLIC_SHOW_PHASE72_PANEL=false
  ```

---

## 🧪 Verification Tests

### Test 1: PostgreSQL Connection

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
npm run postgres:test
```

**Expected:** Connection successful on correct port

### Test 2: Redis Connection

```powershell
npm run redis:test
```

**Expected:** `PONG` response

### Test 3: Phase 90 Duplicate Check

```powershell
npm run db:check-duplicates
```

**Expected:** Either success or clear error message (not hang/crash)

### Test 4: Phase 6 Core Validation

```powershell
# Apply Phase 14 env first
Copy-Item ..\.env.phase14 .\.env -Force

# Run Phase 6
npm run phase6:core
```

**Expected:** Core routes/machines validate successfully

### Test 5: Phase 90 Snapshot (Dry Run)

```powershell
# Take before snapshot (won't fail if no data changes)
npm run db:snapshot-before

# Check snapshot was created
ls logs/phase90/before-migration.txt
```

**Expected:** Snapshot file exists with row counts

---

## 📋 Final Checklist Summary

Before deploying Phase 14 + 90:

### Ports & Services
- [ ] PostgreSQL port matches in Phase 14, Phase 90, and actual service
- [ ] Redis port matches in Phase 14 and actual service
- [ ] Ollama confirmed running on `11434`
- [ ] Qdrant confirmed running on `6333`
- [ ] Go services confirmed on `8080/8081/8082`

### Auth & Secrets
- [ ] Lucia secret name matches in Phase 14 and code (`LUCIA_AUTH_SECRET` or `AUTH_SECRET`)
- [ ] Generated strong `LUCIA_AUTH_SECRET` (32+ hex chars)
- [ ] Updated placeholder passwords for production

### Files & Scripts
- [ ] Created `.env.phase14` at repo root from template
- [ ] Copied to `sveltekit-frontend/.env`
- [ ] Phase 90 PowerShell script uses correct port
- [ ] VS Code task has no typos (if using it)

### Testing
- [ ] All verification tests pass (PostgreSQL, Redis, Phase 6, Phase 90)
- [ ] No connection errors in logs
- [ ] `npm run db:migrate-safe` works (even if no migrations pending)

---

## 🎯 Success Criteria

**Phase 14 is trusted as "the law" when:**

1. ✅ All ports in config match actual running services
2. ✅ All secrets are generated and match code expectations
3. ✅ Phase 6 validates successfully with Phase 14 env
4. ✅ Phase 90 can connect, check duplicates, and take snapshots
5. ✅ No "connection refused" errors in any service

**Phase 90 is trusted as "the bouncer" when:**

1. ✅ Exits with code 1 when PostgreSQL is down
2. ✅ Exits with code 1 when duplicates are found
3. ✅ Exits with code 1 when snapshots are missing
4. ✅ `npm run db:migrate-safe` chain stops if any check fails

---

## 🚨 If Something Doesn't Match

**Don't force the config to match docs—fix docs to match reality!**

Example: If PostgreSQL is really on 5434:

```powershell
# Update Phase 14 docs
# Update Phase 90 script
# Update .env files
# Then verify all tests pass
```

**The goal is consistency, not arbitrary port numbers.**

---

## 📁 Quick Reference: Where Everything Lives

| File | Purpose |
|------|---------|
| `docs/PHASE_14_ENVIRONMENT_CONFIG.md` | ✅ Master env template |
| `.env.phase14` | Created manually from template |
| `sveltekit-frontend/.env` | Copy of `.env.phase14` |
| `sveltekit-frontend/scripts/phase90-migration-safety.ps1` | Migration safety wrapper |
| `sveltekit-frontend/scripts/phase90-migration-check.sql` | SQL safety checks |
| `docs/PHASE_90_SAFE_MIGRATIONS.md` | Phase 90 full guide |
| `docs/PHASE_14_90_CORRECTIONS.md` | Port corrections log |
| `docs/PHASE_90_QUICK_REFERENCE.md` | Quick commands |

---

**Once all checkboxes are ticked:**

✅ **Phase 14 = The Law**
✅ **Phase 90 = The Bouncer**
✅ **You're ready to ship** 🚀
