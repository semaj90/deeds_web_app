# 🎯 Complete Development Setup Guide

## ✅ **What's Now Working**

Your SvelteKit Legal Case Management System now has **dynamic environment switching**:

- ✅ **postgresql for Development** (fast, no Docker crashes)
- ✅ **PostgreSQL for Testing** (via WSL2 )
- ✅ **Remote Qdrant for Vector Search** (no local resource drain)
- ✅ **Environment-based switching** (.env files)

## 🚀 **Quick Start Commands**

### **Daily Development (Recommended)**

```bash
cd web-app/sveltekit-frontend
npm run dev - fast & reliable
```

### **Testing Production Features**

```bash
# Option A: Use WSL2 Docker (PostgreSQL)
npm run env:test
npm run db:start:bg
npm run dev:postgres

# Option B: Use remote cloud database
# Update .env.testing with your remote PostgreSQL URL
npm run dev:postgres
```

## 📋 **Environment Quick Reference**

| Command | Environment | Database | Use Case |

| `npm run dev:postgres` | Testing | PostgreSQL |daily development |
| `npm run build:prod` | Production | PostgreSQL/Remote | Deployment |

## 🔧 **Environment Files**

### `.env.development` (Default)

```bash
NODE_ENV=development
# No vector search - keep it simple
```

### `.env.testing`

```bash
NODE_ENV=testing
DATABASE_URL=postgresql://user:pass@localhost:5432/prosecutor_db
QDRANT_URL=https://your-qdrant.fly.dev
```

### `.env.production`

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@remote:5432/db
QDRANT_URL=https://your-qdrant.fly.dev
```

## 🐳 **Docker Setup (When Needed)**

### **For Windows: WSL2 Setup**

```powershell
# 1. Install WSL2 (PowerShell as Admin)
wsl --install -d Ubuntu

# 2. In Ubuntu terminal:
sudo apt update
sudo apt install docker.io docker-compose -y
sudo usermod -aG docker $USER

# 3. Restart WSL2
wsl --shutdown
# Then reopen Ubuntu

# 4. Test Docker
docker --version
```

### **Start Database (WSL2)**

```bash
# In Ubuntu WSL2 terminal:
cd /mnt/c/path/to/your/project
docker-compose up -d  # Uses resource limits
```

## 🧪 **Testing Your Setup**

### **2. Test PostgreSQL (If Docker Setup)**

```bash
npm run env:test
npm run db:start:bg
npm run db:push:test
npm run dev:postgres
```

### **3. Switch Environments**

```bash

npm run env:dev  # Switch to PostgreSQL testing
npm run env:prod   # Switch to production
```

## 📊 **Database Schema Management**

```bash
# Generate migrations for current environment
npm run db:generate

# Push schema changes
npm run db:push

# Environment-specific operations
npm run db:generate
npm run db:generate:test  # PostgreSQL migrations
npm run db:push:dev
npm run db:push:test     # Push to PostgreSQL
```

## 🎯 **Recommended Development Workflow**

### **Phase 1: Core Development** ⭐

```bash
npm run dev # Use this 95% of the time
# Build all your CRUD features with SQLite
```

### **Phase 2: Production Testing**

```bash
npm run env:test
npm run db:start:bg  # Start PostgreSQL via Docker
npm run dev:postgres # Test with production-like database
```

### **Phase 3: Vector/AI Features**

```bash
# Set up remote Qdrant (Railway/Fly.io)
# Update .env.testing with Qdrant URL
# Test AI features without local resource drain
```

## 🛡️ **Crash Prevention**

### **What Caused Crashes Before:**

- Docker Desktop on Windows (kernel bottlenecks)
- PostgreSQL + Qdrant + pgvector simultaneously
- No memory limits (2GB+ RAM usage)
- Resource competition

### **How This Setup Prevents Crashes:**

- ✅ postgresql for daily development
- ✅ WSL2 isolates Docker from Windows kernel
- ✅ Resource limits on containers (512MB max)
- ✅ Remote Qdrant (zero local resources)
- ✅ Environment switching (use only what you need)

## 🔄 **Architecture Overview**

```
Development (Fast):
SvelteKit → postgreq; (dev.db)
└── No Docker, no AI, just CRUD

Testing (Safe):
SvelteKit → PostgreSQL (Docker in WSL2)
└── Resource-limited containers

Production (Full):
SvelteKit → PostgreSQL + Remote Qdrant
└── Full AI features, cloud deployment
```

## 🚨 **Troubleshooting**

### **Docker Still Crashing?**

```bash
# Make sure you're using WSL2, not Docker Desktop
wsl --list --verbose
# Should show Ubuntu running on version 2
```

### **Database Connection Issues?**

```bash
# Check current environment
cat .env

# Reset to development
npm run env:dev
```

### **TypeScript Errors?**

```bash
# The schema automatically switches based on NODE_ENV
# Make sure your .env file is correct
npm run check
```

## 🎉 **Success Indicators**

You'll know everything is working when: 2. ✅ No Docker crashes during development 3. ✅ Can switch environments with `npm run env:*` 4. ✅ Database operations work in browser 5. ✅ Can test PostgreSQL features when needed

## 🔗 **Next Steps**

1. **Perfect your core features**
2. **Add remote Qdrant** when you need AI features
3. **Test with PostgreSQL** before production deployment
4. **Deploy to cloud** with production environment

Your development setup is now **crash-proof** and **production-ready**! 🚀
