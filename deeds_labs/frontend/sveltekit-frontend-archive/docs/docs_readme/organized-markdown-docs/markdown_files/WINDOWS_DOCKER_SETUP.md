# Windows Docker Setup Guide

## 🚨 Why Docker Was Crashing

Your Windows system was overwhelmed by:
- Docker Desktop kernel bottlenecks
- `ankane/pgvector` (heavy PostgreSQL + AI extensions)
- Qdrant vector database
- No memory limits
- **Total: ~2GB RAM + high CPU usage**

## ✅ Solutions (Pick One)

### Option A: WSL2 + Native Docker (Best)

**Step 1: Install WSL2**
```powershell
# Run in PowerShell as Administrator
wsl --install
wsl --install -d Ubuntu
```

**Step 2: Setup Docker in WSL2**
```bash
# Inside WSL2 Ubuntu terminal:
sudo apt update
sudo apt install docker.io docker-compose -y
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Restart WSL2
exit
wsl --shutdown
wsl
```

**Step 3: Run Docker in WSL2**
```bash
# Navigate to your project in WSL2:
cd /mnt/c/Users/james/Downloads/Deeds-App-doesn-t-work--main\ \(2\)/

# Start containers (resource-limited)
docker-compose up -d
```

### Option B: Remote Dev Server

**Use cloud services for Docker:**
- **Railway.app** - $5/month, PostgreSQL + Redis
- **Supabase** - Free tier, PostgreSQL + Auth
- **Qdrant Cloud** - Free 1GB, managed vector DB

**Local .env setup:**
```bash
# .env.development (SQLite)
DATABASE_URL="file:./dev.db"

# .env.production (Remote)
DATABASE_URL="postgresql://user:pass@remote-db:5432/db"
QDRANT_URL="https://xyz.qdrant.tech:6333"
```

### Option C: Resource-Limited Local Docker

**Already created `docker-compose.override.yml`:**
- PostgreSQL: 512MB max
- Qdrant: 256MB max
- CPU limits applied

```bash
# This now works safely on Windows:
docker-compose up -d
```

## 🎯 Recommended Development Flow

### Day-to-Day Development
```bash
# Always use SQLite for core development:
cd web-app/sveltekit-frontend
npm run dev
# Fast, reliable, no crashes
```

### Testing Production Features
```bash
# Only when you need to test AI/vector features:

# Option A (WSL2):
wsl
cd /mnt/c/path/to/project
docker-compose up -d

# Option B (Cloud):
# Use remote DATABASE_URL in .env

# Option C (Limited Docker):
docker-compose up -d  # Now resource-limited
```

## 📊 Performance Comparison

| Method | RAM Usage | Crash Risk | Setup Time |
|--------|-----------|------------|------------|
| SQLite Dev | ~50MB | None | 0 minutes |
| WSL2 Docker | ~400MB | Low | 15 minutes |
| Remote Cloud | ~50MB | None | 30 minutes |
| Limited Docker | ~800MB | Low | 5 minutes |
| Previous Setup | ~2GB | High | ❌ Crashes |

## 🚀 Next Steps

1. **Keep developing with SQLite** (current setup is perfect)
2. **When ready for production features**, choose one option above
3. **Test incrementally** - don't run all services at once
4. **Monitor resource usage** with Task Manager

Your current SQLite development setup is optimal. Only add Docker complexity when you actually need vector/AI features!
