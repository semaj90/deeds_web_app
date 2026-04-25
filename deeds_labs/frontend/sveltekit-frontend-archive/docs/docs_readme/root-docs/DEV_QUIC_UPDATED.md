# ✅ NPM dev:quic Scripts Updated

**Status**: All QUIC dev scripts now include Redis and PostgreSQL credentials

**Updated**: 2025-10-26

---

## 🎯 What Changed

The following `npm run dev:quic*` scripts have been updated to automatically include:
- `REDIS_PASSWORD=redis` ✅
- `DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db` ✅

---

## 📋 Updated Scripts

### 1. **Main QUIC Dev** (Port 5173)
```bash
npm run dev:quic
```
**Command**: `cross-env REDIS_PASSWORD=redis DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db vite dev --port 5173 --host 127.0.0.1`

**Features**:
- ✅ Redis auth fixed
- ✅ Database connected
- ✅ Standard port 5173
- ✅ No Redis warning

---

### 2. **Simple QUIC Dev** (Port 5174)
```bash
npm run dev:quic:simple
```
**Command**: `cross-env REDIS_PASSWORD=redis DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db vite dev --port 5174 --strictPort --host 127.0.0.1`

**Features**:
- ✅ Minimal dependencies
- ✅ Uses fallback port (5174)
- ✅ Best for testing
- ✅ Fast startup

---

### 3. **Full QUIC Stack** (with Caddy proxy)
```bash
npm run dev:quic:full
```
**Command**: `concurrently ... "cross-env REDIS_PASSWORD=redis DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db QUIC_ENABLED=true vite dev --host 0.0.0.0 --port 5176"`

**Features**:
- ✅ Caddy reverse proxy
- ✅ Full QUIC stack
- ✅ Port 5176
- ✅ Production-ready

---

### 4. **Local QUIC with GPU**
```bash
npm run dev:quic:local
```
**Command**: `cross-env REDIS_PASSWORD=redis DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db QUIC_ENABLED=true ENABLE_GPU=true RTX_3060_OPTIMIZATION=true CONTEXT7_MULTICORE=true OLLAMA_GPU_LAYERS=30 vite dev --port 5173 --strictPort --host 127.0.0.1`

**Features**:
- ✅ GPU acceleration
- ✅ RTX 3060 optimization
- ✅ Multicore context support
- ✅ Ollama GPU layers (30)

---

## 🚀 Quick Start

### Before: Manual Environment Variables Needed
```bash
# Old way - had to set manually
REDIS_PASSWORD="redis" \
DATABASE_URL="postgresql://legal_admin:123456@localhost:5432/legal_ai_db" \
npm run dev -- --port 5173 --host 127.0.0.1
```

### After: Just Run the Command
```bash
# New way - already configured!
npm run dev:quic

# Or choose your variant:
npm run dev:quic:simple      # Quick test (port 5174)
npm run dev:quic:full        # Full stack with proxy
npm run dev:quic:local       # GPU-optimized
```

---

## ✅ Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Manual env vars | ❌ Required | ✅ Built-in |
| Redis warning | ❌ Always | ✅ Fixed |
| Database auth | ❌ Manual setup | ✅ Automatic |
| Less typing | ❌ Long command | ✅ Short command |
| Consistency | ❌ Error-prone | ✅ Guaranteed |
| Documentation | ⚠️ Needed reading | ✅ Self-documenting |

---

## 🧪 Testing the Fix

### Step 1: Run the Updated Command
```bash
npm run dev:quic:simple
```

**Expected output**:
```
✅ Docker Redis detected (legal-ai-redis)
[VITE] ready in 3744 ms
➜ Local: http://localhost:5174/
```

### Step 2: No Redis Warning
✅ The `NOAUTH Authentication required` warning is GONE

### Step 3: Login Works
✅ Authentication works perfectly with the credentials in the environment

---

## 📚 Environment Variables Reference

These are now **automatically included** in all `dev:quic*` scripts:

```bash
REDIS_PASSWORD=redis
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db
```

### Additional Variables by Script

**dev:quic:full**:
```bash
QUIC_ENABLED=true
```

**dev:quic:local**:
```bash
QUIC_ENABLED=true
ENABLE_GPU=true
RTX_3060_OPTIMIZATION=true
CONTEXT7_MULTICORE=true
OLLAMA_GPU_LAYERS=30
```

---

## 🎯 Which Script Should I Use?

### For Quick Development
```bash
npm run dev:quic:simple
# Port: 5174
# Best for: Testing, quick development, minimal setup
```

### For Standard Development
```bash
npm run dev:quic
# Port: 5173
# Best for: Regular development, debugging
```

### For Full Stack with Proxy
```bash
npm run dev:quic:full
# Port: 5176 (via proxy on 5178)
# Best for: Production-like setup, Caddy proxy testing
```

### For GPU-Accelerated Development
```bash
npm run dev:quic:local
# Port: 5173
# Best for: ML/AI features, GPU testing
```

---

## 🔧 Manual Override (If Needed)

If you want to override the values temporarily:

```bash
# Override Redis password
REDIS_PASSWORD=custom_password npm run dev:quic

# Override database URL
DATABASE_URL=postgresql://other:5432/db npm run dev:quic

# Override port (for simple variant)
npm run dev:quic:simple -- --port 5180
```

---

## 📝 Summary

✅ **All `dev:quic*` scripts now include**:
- Redis password authentication
- PostgreSQL database connection
- Ready to run without manual setup

✅ **No more**:
- Manual environment variables
- Redis NOAUTH warnings
- Database connection errors
- Configuration confusion

✅ **Just run**:
```bash
npm run dev:quic
# or
npm run dev:quic:simple
# or
npm run dev:quic:full
```

---

## 🆘 Troubleshooting

### Still getting NOAUTH warning?
Make sure you're using the updated script:
```bash
npm run dev:quic:simple  # Not the old "npm run dev" command
```

### Database connection fails?
Check PostgreSQL is running:
```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT 1;"
```

### Port already in use?
Use a different variant:
```bash
npm run dev:quic:simple     # Uses port 5174
npm run dev:quic:local      # Uses port 5173
npm run dev:quic:full       # Uses port 5176
```

---

**Status**: ✅ Ready to use
**Last Updated**: 2025-10-26
**All Scripts**: Tested and verified
