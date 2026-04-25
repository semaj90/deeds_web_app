# 🚀 One-Click Legal AI System Setup Guide for Windows 10

## 📋 Quick Start

### Option 1: Super Quick Launch (Recommended)

```cmd
# Double-click this file:
legal-ai-launcher.bat --setup --gpu
```

### Option 2: PowerShell Direct

```powershell
# Run this in PowerShell:
.\one-click-legal-ai-launcher.ps1 -Setup -GPU
```

## 🛠️ What This Setup Includes

### 🏗️ Infrastructure Components

- **PostgreSQL 16** with pgvector extension (Docker)
- **Qdrant** vector database for embeddings (Docker)
- **Ollama** with legal-optimized AI models
- **SvelteKit** frontend application
- **Docker Desktop** container orchestration

### 🤖 AI Models Included

- **llama3.1:8b** - Main legal reasoning model
- **nomic-embed-text** - Text embedding model
- **mistral:7b** - Alternative reasoning model
- **llama3.1:70b** - Large model (GPU mode only)
- **codellama:13b** - Code analysis (GPU mode only)

### 🔧 Development Tools

- **Drizzle ORM** for database management
- **Playwright** for E2E testing
- **Vite** for fast development builds
- **TypeScript** with full type safety

## 📋 System Requirements

### ✅ Minimum Requirements

- **OS**: Windows 10 version 1903 or later
- **RAM**: 8GB (16GB recommended for GPU mode)
- **Storage**: 20GB free space
- **CPU**: 4+ cores recommended
- **GPU**: NVIDIA GPU with 8GB+ VRAM (optional, for GPU mode)

### 📦 Required Software (Auto-installed)

- **Node.js** 18+ (auto-installed)
- **Docker Desktop** (auto-installed)
- **PostgreSQL** (Docker container)
- **Ollama** (auto-installed)

## 🎯 Installation Steps

### Step 1: Download and Extract

1. Download the Legal AI system files
2. Extract to `C:\legal-ai` (or your preferred directory)
3. Open PowerShell as Administrator

### Step 2: First-Time Setup

```powershell
# Navigate to the directory
cd C:\legal-ai

# Run first-time setup with GPU support
.\legal-ai-launcher.bat --setup --gpu
```

### Step 3: Verify Installation

The script will automatically:

- ✅ Check system requirements
- ✅ Install missing dependencies
- ✅ Setup Docker containers
- ✅ Download AI models
- ✅ Configure database
- ✅ Start all services
- ✅ Open web interface

## 🔧 Usage Commands

### 🚀 Launch Commands

```cmd
# Normal launch (after setup)
legal-ai-launcher.bat

# Quick launch (skip health checks)
legal-ai-launcher.bat --quick

# GPU-accelerated launch
legal-ai-launcher.bat --gpu

# Reset everything and start fresh
legal-ai-launcher.bat --reset
```

### 🎛️ PowerShell Advanced Options

```powershell
# Custom PostgreSQL password
.\one-click-legal-ai-launcher.ps1 -Setup -PostgresPassword "your_secure_password"

# Use native PostgreSQL instead of Docker
.\one-click-legal-ai-launcher.ps1 -Setup -Native

# Setup only (no launch)
.\one-click-legal-ai-launcher.ps1 -Setup

# Health check only
.\one-click-legal-ai-launcher.ps1 -Quick
```

## 🌐 Access Points

After successful launch, access these URLs:

| Service                 | URL                             | Purpose                |
| ----------------------- | ------------------------------- | ---------------------- |
| 🎨 **Main Web App**     | http://localhost:5173           | Legal AI interface     |
| 🐘 **PostgreSQL**       | localhost:5432                  | Database (use pgAdmin) |
| 🔍 **Qdrant Dashboard** | http://localhost:6333/dashboard | Vector database        |
| 🤖 **Ollama API**       | http://localhost:11434          | AI model API           |
| 📊 **Database Studio**  | http://localhost:4983           | Drizzle Studio         |

## 🧪 Testing Your Installation

### 1. Web Interface Test

1. Open http://localhost:5173
2. Navigate to "AI Chat" section
3. Upload a legal document
4. Ask: "Summarize this document"
5. Verify AI response

### 2. API Test

```powershell
# Test Ollama API
Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -Method GET

# Test Qdrant
Invoke-WebRequest -Uri "http://localhost:6333/health" -Method GET

# Test PostgreSQL connection
cd sveltekit-frontend
npm run db:studio
```

### 3. Automated E2E Tests

```cmd
cd sveltekit-frontend
npm run test:e2e
npm run test:rag
npm run test:ollama
```

## 🚨 Troubleshooting

### ❌ Common Issues

#### Docker Desktop Not Running

```powershell
# Start Docker Desktop
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Wait 30 seconds, then retry
Start-Sleep 30
.\legal-ai-launcher.bat
```

#### Port Conflicts

```powershell
# Check what's using the ports
netstat -ano | findstr ":5173"
netstat -ano | findstr ":5432"
netstat -ano | findstr ":6333"

# Kill processes if needed
taskkill /PID [PID_NUMBER] /F
```

#### Ollama Models Not Downloading

```powershell
# Manual model pull
ollama pull llama3.1:8b
ollama pull nomic-embed-text
ollama list
```

#### PostgreSQL Connection Issues

```powershell
# Check container logs
docker logs legal-ai-postgres

# Restart PostgreSQL container
docker restart legal-ai-postgres

# Manual connection test
docker exec -it legal-ai-postgres psql -U postgres -d legal_ai_db
```

### 🔧 Recovery Commands

#### Complete Reset and Reinstall

```powershell
# Stop everything
.\legal-ai-launcher.bat --reset

# Clean Docker
docker system prune -f
docker volume prune -f

# Fresh setup
.\legal-ai-launcher.bat --setup --gpu
```

#### Update AI Models

```powershell
# Update to latest models
ollama pull llama3.1:8b
ollama pull nomic-embed-text

# Restart Ollama service
Stop-Process -Name "ollama" -Force
Start-Sleep 5
ollama serve
```

## 📊 Performance Tuning

### 🎮 GPU Optimization

```powershell
# For NVIDIA GPUs, ensure CUDA is available
nvidia-smi

# Enable GPU mode permanently
$env:OLLAMA_GPU_LAYERS = "35"
$env:OLLAMA_KEEP_ALIVE = "5m"
```

### 💾 Memory Optimization

```powershell
# Adjust Docker memory limits
# Docker Desktop → Settings → Resources → Memory → 8GB+

# PostgreSQL memory tuning (in container)
docker exec legal-ai-postgres psql -U postgres -c "
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
SELECT pg_reload_conf();
"
```

### 🚀 SvelteKit Performance

```powershell
cd sveltekit-frontend

# Production build
npm run build

# Preview production build
npm run preview
```

## 📈 Monitoring and Maintenance

### 📊 Health Monitoring

```powershell
# Check all services
.\one-click-legal-ai-launcher.ps1

# Individual service checks
docker ps
ollama list
```

### 🧹 Regular Maintenance

```powershell
# Weekly cleanup
docker system prune -f
docker volume prune -f

# Update models monthly
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

### 📋 Log Monitoring

```powershell
# View container logs
docker logs legal-ai-postgres --tail 50
docker logs legal-ai-qdrant --tail 50

# SvelteKit logs
cd sveltekit-frontend
npm run dev  # Check console output
```

## 🔐 Security Configuration

### 🔒 Database Security

```sql
-- Change default password
ALTER USER postgres PASSWORD 'your_new_secure_password';

-- Create application user
CREATE USER legal_ai_app WITH PASSWORD 'app_password';
GRANT CONNECT ON DATABASE legal_ai_db TO legal_ai_app;
GRANT USAGE ON SCHEMA legal_ai TO legal_ai_app;
```

### 🛡️ Network Security

```powershell
# Restrict to localhost only (default)
# All services bound to 127.0.0.1

# For production, configure proper firewall rules
New-NetFirewallRule -DisplayName "Legal AI PostgreSQL" -Direction Inbound -Port 5432 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Legal AI Qdrant" -Direction Inbound -Port 6333 -Protocol TCP -Action Allow
```

## 🎓 Learning Resources

### 📚 Documentation Links

- **SvelteKit**: https://kit.svelte.dev/docs
- **Drizzle ORM**: https://orm.drizzle.team/docs
- **Ollama**: https://ollama.ai/docs
- **Qdrant**: https://qdrant.tech/documentation
- **pgvector**: https://github.com/pgvector/pgvector

### 🧑‍💻 Development Guides

- **TypeScript**: https://www.typescriptlang.org/docs
- **Playwright Testing**: https://playwright.dev/docs
- **Docker**: https://docs.docker.com/desktop/windows

## 🆘 Getting Help

### 📞 Support Channels

1. **Check logs**: Use monitoring commands above
2. **Search issues**: Common problems in troubleshooting section
3. **Reset and retry**: Use `--reset` flag
4. **Documentation**: Review component-specific docs

### 🐛 Reporting Issues

When reporting issues, include:

- System specifications (RAM, CPU, GPU)
- Error messages from logs
- Steps to reproduce
- Output from health check command

## 🎉 Success Indicators

Your installation is successful when:

- ✅ All health checks pass
- ✅ Web interface loads at http://localhost:5173
- ✅ You can upload and process legal documents
- ✅ AI chat responds to queries
- ✅ Vector search returns relevant results
- ✅ E2E tests pass

---

**🏛️ Legal AI System v2.0** | Powered by PostgreSQL + pgvector + Qdrant + Ollama + SvelteKit
