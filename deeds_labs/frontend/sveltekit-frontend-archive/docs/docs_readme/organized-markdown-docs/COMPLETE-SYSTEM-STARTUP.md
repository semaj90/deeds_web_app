# 🚀 Complete Legal AI System Startup Guide

## ✅ Your Current System Status

Based on your setup, here's what's working and what needs attention:

### ✅ Working Components
- **PostgreSQL**: ✅ Connected and running
- **Ollama**: ✅ Running on localhost:11434  
- **Go Environment**: ✅ Available (v1.24.5)
- **XState Manager**: ✅ Compiled and tested
- **Node.js/SvelteKit**: ✅ Available with dependencies

### ⚠️ Missing/Optional Components
- **Redis**: ❌ Not running (critical for caching)
- **Qdrant**: ❌ Not installed (optional - can use pgvector)

## 🚀 Quick Start (Optimized for Your Setup)

### 1. Start All Services
```batch
.\SMART-STARTUP-OPTIMIZED.bat
```

This will:
- ✅ Check all service dependencies
- 🚀 Start XState Manager (port 8095)
- 🤖 Start Enhanced RAG (if available)
- 🌐 Start SvelteKit dev server (port 5173)
- 📊 Open health dashboards

### 2. Monitor System Health
```powershell
.\monitor-xstate-health.ps1 -Continuous -ShowDetails
```

### 3. Access Your System
- **Frontend**: http://localhost:5173
- **XState Analytics**: http://localhost:8095/api/learning-analytics
- **Health Check**: http://localhost:8095/health
- **WebSocket**: ws://localhost:8095/ws?userId=demo

## 🧠 XState Manager Features

Your XState Manager provides:

### Real-time User State Tracking
- **State Transitions**: User navigation patterns
- **Typing Metrics**: WPM, error rates, legal term usage
- **Upload Events**: File processing analytics  
- **Search Analytics**: Query patterns and results
- **Document Interactions**: Reading behavior analysis

### LLM Training Integration
- **Learning Weight Calculation**: Based on user activity
- **Pattern Recognition**: Typing rhythms and legal vocabulary
- **Context Updates**: Real-time LLM context learning
- **Analytics Dashboard**: Performance metrics

## 🔧 Quick Fixes for Missing Components

### Install Redis (Recommended)
```batch
winget install Redis.Redis
# OR download from: https://github.com/tporadowski/redis/releases
```

### Alternative: Skip Redis (System works without it)
The system gracefully degrades without Redis - caching will use memory instead.

## 📊 System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   SvelteKit     │    │   XState Manager │    │   PostgreSQL    │
│   Frontend      │◄──►│   (Port 8095)    │◄──►│   Database      │
│   (Port 5173)   │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         │              ┌──────────────────┐              │
         └─────────────►│     Ollama       │◄─────────────┘
                        │   (Port 11434)   │
                        └──────────────────┘
```

## 🎯 Next Steps

1. **Install Redis** for optimal performance
2. **Run the startup script** to test everything
3. **Monitor with health check** script
4. **Explore the XState analytics** dashboard

## 🐛 Troubleshooting

### If XState Manager doesn't start:
```batch
cd go-microservice
go build -o xstate-manager.exe xstate-manager.go
./xstate-manager.exe
```

### If PostgreSQL connection fails:
```batch
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "SELECT version();"
```

### If Ollama isn't responding:
```batch
ollama serve
# Wait for startup, then test:
curl http://localhost:11434/api/tags
```

## 🎉 Success Indicators

When everything is running correctly, you should see:

1. ✅ All health checks pass in the startup script
2. 🌐 SvelteKit loads at http://localhost:5173  
3. 🧠 XState Manager health returns JSON at http://localhost:8095/health
4. 📊 Analytics data available at http://localhost:8095/api/learning-analytics
5. 🔗 WebSocket connections work at ws://localhost:8095/ws?userId=test

Your system is already 80% ready - just need Redis for optimal performance! 🚀