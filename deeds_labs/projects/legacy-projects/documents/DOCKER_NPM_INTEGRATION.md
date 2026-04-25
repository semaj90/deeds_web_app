# Docker + npm run dev Integration Guide

Your SvelteKit authentication system works perfectly with **both** Docker and native `npm run dev`. Here are your options:

## 🎯 **Quick Answer: YES, it works with npm run dev!**

## 🚀 **Option 1: Native Development (Current/Recommended)**
**What you're already using - no changes needed**

```bash
cd sveltekit-frontend
npm run dev
```

**Pros:**
- ✅ Fastest hot reload
- ✅ Native debugging
- ✅ Works with your current setup
- ✅ All your authentication routes work

**Cons:**
- ❌ Need to manage PostgreSQL/Redis locally

---

## 🐳 **Option 2: Hybrid (Docker Infrastructure + Native Frontend)**
**Best of both worlds - recommended for clean development**

```bash
# Windows
.\start-hybrid-dev.bat

# Linux/macOS
./start-hybrid-dev.sh
```

**What this does:**
1. Starts PostgreSQL, Redis, MinIO in Docker containers
2. Runs your SvelteKit app with `npm run dev` natively
3. Connects to Docker services via localhost

**Pros:**
- ✅ Clean isolated database/cache
- ✅ Fast native frontend performance
- ✅ Easy to reset data
- ✅ Best debugging experience

**Cons:**
- ❌ Requires Docker Desktop

---

## 🏗️ **Option 3: Full Docker Development**
**Everything containerized**

```bash
# Windows
.\start-docker-auth.bat

# Linux/macOS
./start-docker-auth.sh

# Or manually
docker-compose -f docker-compose.sveltekit.yml up --build
```

**Pros:**
- ✅ Completely isolated environment
- ✅ Reproducible across machines
- ✅ Production-like setup

**Cons:**
- ❌ Slower hot reload
- ❌ More complex debugging

---

## 🔧 **Your Current npm Scripts Still Work**

All your existing scripts continue to work:

```bash
npm run dev                    # Current working setup
npm run dev:gpu               # GPU-enabled development
npm run dev:full              # Full stack with all services
npm run dev:debug             # Debug mode
```

## 🌐 **URLs (All Options)**

- **Frontend**: http://localhost:5174
- **Protected Route**: http://localhost:5174/protected
- **Login**: http://localhost:5174/auth/login
- **Register**: http://localhost:5174/auth/register
- **Error Logger Proxy**: http://localhost:8080 (hybrid/docker only)

## 🎯 **Recommendation**

1. **For daily development**: Use **Option 2 (Hybrid)** - `.\start-hybrid-dev.bat`
2. **For quick testing**: Use **Option 1 (Native)** - `npm run dev`
3. **For production testing**: Use **Option 3 (Full Docker)**

## ⚡ **Environment Variables**

The Docker integration automatically sets:
```env
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db
REDIS_URL=redis://localhost:6379
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
REDIS_HOST=localhost
REDIS_PORT=6379
```

Your authentication system works with **all options**! 🎉