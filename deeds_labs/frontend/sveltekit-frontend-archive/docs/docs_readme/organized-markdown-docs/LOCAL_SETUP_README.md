# 🚀 Local Development Setup (No Docker)

This guide will help you set up the complete RAG application stack locally on Windows without Docker.

## 🎯 One-Click Setup

### **Option 1: Complete Automated Setup**
```powershell
# Run as Administrator
cd sveltekit-frontend
npm run setup:local
```

This will automatically:
- ✅ Download and install PostgreSQL 16
- ✅ Install pgvector extension
- ✅ Download and install Ollama
- ✅ Pull required AI models (llama3.2, nomic-embed-text)
- ✅ Install Node.js dependencies
- ✅ Setup database schema
- ✅ Create environment files
- ✅ Run validation tests

### **Option 2: Manual Step-by-Step**

#### 1. Setup PostgreSQL Only
```powershell
npm run setup:postgres
```

#### 2. Setup Everything Else
```powershell
npm run setup:local -SkipPostgres
```

## 🏃‍♂️ Running the Application

### **Start Everything**
```powershell
npm run dev:local
```

This starts:
- 🐘 PostgreSQL (localhost:5432)
- 🤖 Ollama with GPU (localhost:11434)
- 🌐 SvelteKit dev server (localhost:5173)

### **Or Start Individual Services**
```powershell
# Start PostgreSQL service
Get-Service postgresql-x64-* | Start-Service

# Start Ollama with GPU
ollama serve

# Start SvelteKit
npm run dev
```

## 🧪 Running Tests

### **Quick Validation**
```powershell
npm run test:quick
```

### **Comprehensive Test Suite**
```powershell
npm run test:local
```

### **Individual Test Categories**
```powershell
npm run test:auth        # Authentication & Session
npm run test:store       # Global Store & State
npm run test:health      # System Health & Logging
npm run test:sw          # Service Worker
npm run test:xstate      # XState Machines
npm run test:loki        # LokiJS Caching
npm run test:ollama      # Ollama Integration
npm run test:rag         # RAG System
npm run test:db          # Database (PostgreSQL + Drizzle)
npm run test:ingestion   # GPU Ollama Ingestion
```

## 📋 System Requirements

### **Required Software**
- ✅ Windows 10/11
- ✅ PowerShell 5.1+ (built-in)
- ✅ Node.js 18+ (for SvelteKit)

### **Hardware Requirements**
- 🖥️ **CPU**: Modern x64 processor
- 🧠 **RAM**: 8GB minimum, 16GB recommended
- 💾 **Storage**: 10GB free space
- 🎮 **GPU**: NVIDIA GPU with CUDA (optional, for acceleration)

### **What Gets Installed**
- **PostgreSQL 16** → `C:\Program Files\PostgreSQL\16\`
- **pgvector extension** → Enabled in database
- **Ollama** → `%LOCALAPPDATA%\Programs\Ollama`
- **AI Models** → `~\.ollama\models\`

## 🔧 Configuration

### **Environment Variables**
Automatically created in `.env.local`:
```env
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/deeds_legal_ai
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres123
POSTGRES_DB=deeds_legal_ai
```

### **Default Credentials**
- **PostgreSQL**: `postgres` / `postgres123`
- **Database**: `deeds_legal_ai`
- **Port**: 5432

## 🏥 Health Checks

### **Manual Verification**
```powershell
# Test PostgreSQL
psql -U postgres -d deeds_legal_ai -c "SELECT version();"

# Test Ollama
ollama list

# Test GPU (if available)
nvidia-smi
```

### **Web Health Checks**
- 🌐 Application: http://localhost:5173
- 🤖 Ollama API: http://localhost:11434/api/tags
- 🐘 pgAdmin: Available from Start Menu

## 🐛 Troubleshooting

### **PostgreSQL Issues**
```powershell
# Restart PostgreSQL service
Get-Service postgresql-x64-* | Restart-Service

# Check if running
Get-Service postgresql-x64-* | Select-Object Status,Name

# Manual connection test
psql -U postgres -d deeds_legal_ai
```

### **Ollama Issues**
```powershell
# Restart Ollama
ollama serve

# Check models
ollama list

# Pull missing models
ollama pull llama3.2
ollama pull nomic-embed-text
```

### **GPU Issues**
```powershell
# Check GPU availability
nvidia-smi

# Verify CUDA
nvcc --version

# Set GPU environment
$env:CUDA_VISIBLE_DEVICES = "0"
```

### **Common Fixes**
1. **Permission Errors**: Run PowerShell as Administrator
2. **Port Conflicts**: Change ports in configuration
3. **Antivirus**: Whitelist project folder
4. **Firewall**: Allow PostgreSQL and Ollama ports

## 📊 Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SvelteKit 2   │    │   PostgreSQL    │    │     Ollama      │
│   (Frontend)    │◄──►│   + pgvector    │    │   (AI Models)   │
│   Port: 5173    │    │   Port: 5432    │    │   Port: 11434   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Test Suite    │
                    │   (Playwright)  │
                    └─────────────────┘
```

## 🎯 Next Steps

1. **Run Setup**: `npm run setup:local`
2. **Start Services**: `npm run dev:local`
3. **Open Browser**: http://localhost:5173
4. **Run Tests**: `npm run test:quick`
5. **Start Coding**: Edit files in `sveltekit-frontend/src/`

## 🔗 Useful Links

- 🌐 **Application**: http://localhost:5173
- 🤖 **Ollama API**: http://localhost:11434
- 🐘 **pgAdmin**: Start Menu → pgAdmin 4
- 📊 **Test Reports**: Auto-generated after test runs
- 🔧 **Database Studio**: `npm run db:studio`

---

🎉 **You're all set!** Your local RAG application environment is ready for development and testing.