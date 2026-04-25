# 🚀 **EVIDENCE PROCESSING SYSTEM - WINDOWS NATIVE (SMART SETUP)**

## 📋 **OVERVIEW**

This is a complete Windows-native evidence processing pipeline that **intelligently detects existing services** and uses them when possible, falling back to portable versions only when needed.

### 🧠 **Smart Detection Features**
- ✅ **Automatically detects existing PostgreSQL** (uses your password: 123456)
- ✅ **Finds system Redis and RabbitMQ** installations  
- ✅ **Uses Windows services** when available for better performance
- ✅ **Falls back to portable versions** for missing services
- ✅ **No Docker required** - pure Windows native

---

## 🔧 **TECH STACK (WINDOWS NATIVE)**

**Database & Storage:**
- **PostgreSQL** (existing installation with password 123456)
- **Redis** (system service or portable)
- **MinIO** (portable binary)

**Message Queue & Processing:**
- **RabbitMQ** (system service or manual install)
- **Node.js Workers** (evidence processing pipeline)

**AI & Vector Search:**
- **Qdrant** (portable binary)
- **Neo4j** (portable community edition)
- **Ollama** (optional local LLM)

**Frontend & API:**
- **SvelteKit 2** (web interface)
- **XState** (real-time state management)
- **WebSocket** (live progress updates)

---

## 🚀 **QUICK START (RECOMMENDED)**

### **Step 1: Smart Setup**
```batch
# Run the intelligent setup (detects existing services)
setup-windows-native-smart.bat
```

### **Step 2: Start Services**
```batch
# Starts existing services + portable ones as needed
start-all-services-smart.bat
```

### **Step 3: Setup Database** 
```batch
# Configures PostgreSQL with your password (123456)
setup-database-smart.bat
```

### **Step 4: Test Everything**
```batch
# Comprehensive system test with smart detection
test-system-smart.bat
```

### **Step 5: Start Processing**
```batch
# Begin evidence processing
start-worker.bat
```

---

## 🔍 **SMART DETECTION DETAILS**

### **What Gets Detected:**

**PostgreSQL:**
- ✅ Checks for existing installation
- ✅ Tests connection with password `123456`
- ✅ Uses your existing database server
- ❌ **No Docker containers needed**

**Redis:**
- ✅ Looks for system Redis service
- ✅ Attempts to start existing service
- 🔄 Falls back to portable Redis if needed

**RabbitMQ:**
- ✅ Detects system RabbitMQ installation
- ✅ Starts Windows service if available
- ⚠️ Provides install instructions if missing

**Portable Services:**
- 📦 **Qdrant** - Downloads latest Windows binary
- 🕸️ **Neo4j** - Community edition (no Java install needed)
- 📁 **MinIO** - Object storage binary
- 🦙 **Ollama** - Optional local LLM

---

## 📊 **SYSTEM REQUIREMENTS**

### **Required (Must Have):**
- ✅ **Windows 10/11**
- ✅ **Node.js 18+** 
- ✅ **Python 3.8+** (for native modules)
- ✅ **PostgreSQL** (any version with password `123456`)

### **Optional (Auto-Detected):**
- 🔄 **Redis** (will install portable if missing)
- 🔄 **RabbitMQ** (provides install guidance)
- 🔄 **Other services** (portable versions used)

---

## 🌐 **SERVICE PORTS & ACCESS**

Once running, access these services:

| Service | Port | URL | Credentials |
|---------|------|-----|-------------|
| **PostgreSQL** | 5432 | `localhost:5432` | postgres / 123456 |
| **Redis** | 6379 | `localhost:6379` | (no auth) |
| **RabbitMQ** | 5672, 15672 | http://localhost:15672 | guest / guest |
| **Qdrant** | 6333 | http://localhost:6333/dashboard | (no auth) |
| **Neo4j** | 7474, 7687 | http://localhost:7474 | neo4j / neo4j |
| **MinIO** | 9000, 9001 | http://localhost:9001 | evidence / evidence123 |
| **Ollama** | 11434 | http://localhost:11434 | (no auth) |

---

## 🔧 **MANUAL OVERRIDES**

If smart detection doesn't work perfectly:

### **PostgreSQL Issues:**
```batch
# If password isn't 123456, update it:
psql -U postgres
ALTER USER postgres PASSWORD '123456';
\q
```

### **Service Management:**
```batch
# Start all services (smart mode)
start-all-services-smart.bat

# Stop all services  
stop-all-services.bat

# Test connectivity
test-system-smart.bat
```

### **Database Reset:**
```batch
# Recreate database with correct settings
setup-database-smart.bat
```

---

## 📁 **PROJECT STRUCTURE**

```
deeds-web-app/
├── 📜 setup-windows-native-smart.bat    # Smart setup script
├── 🚀 start-all-services-smart.bat      # Intelligent service startup
├── 🗄️ setup-database-smart.bat          # Database config (password: 123456)
├── 🧪 test-system-smart.bat             # Smart system testing
├── 🏭 start-worker.bat                  # Evidence processing worker
├── 🛑 stop-all-services.bat             # Stop everything
├── 🔧 .env                              # Auto-generated configuration
├── services/                            # Portable service binaries
│   ├── qdrant.exe                       # Vector database
│   ├── minio.exe                        # Object storage
│   ├── ollama.exe                       # Local LLM (optional)
│   ├── neo4j/                           # Graph database
│   └── redis-server.exe                 # Cache (if needed)
├── workers/                             # Processing pipeline
│   ├── evidenceProcessor.js             # Main worker
│   ├── services/
│   │   ├── smart-service-detector.js    # Service detection logic
│   │   ├── ocr.js                       # Text extraction
│   │   ├── embeddings.js                # Vector generation
│   │   └── rag.js                       # AI analysis
│   └── health-check.js                  # System health monitoring
├── sveltekit-frontend/                  # Web interface
│   └── src/lib/components/evidence/
│       └── EvidenceProcessor.svelte     # Real-time UI component
└── migrations/                          # Database schema
    └── create_evidence_processing_schema.sql
```

---

## 🎯 **PROCESSING WORKFLOW**

```
📤 Upload Evidence → 🔍 Smart Service Detection → 🚀 Start Pipeline

1. 📄 OCR: Extract text from documents
   ├── PDF, DOCX, images supported
   └── Tesseract + native extraction

2. 🧠 Embeddings: Generate vectors for similarity
   ├── Ollama (local) or OpenAI (cloud)
   └── Store in Qdrant + PostgreSQL

3. 📚 RAG Analysis: AI-powered insights
   ├── LLM analysis of evidence content
   ├── Entity extraction to Neo4j
   └── Cross-reference with similar cases

4. 📊 Real-time Updates: Live progress via WebSocket
   ├── XState manages UI state
   └── Progress bars, status updates, error handling
```

---

## 🔍 **SMART FEATURES**

### **Service Intelligence:**
- 🔍 **Auto-detects** existing PostgreSQL with your password
- 🔄 **Preferentially uses** system services (better performance)
- 📦 **Falls back gracefully** to portable versions
- ⚡ **Optimizes startup** based on what's available

### **Configuration Intelligence:**
- 🔧 **Auto-generates** `.env` with detected settings
- 🗄️ **Uses correct** PostgreSQL password (123456)
- 🌐 **Maps services** to available ports
- 📝 **Creates connection strings** automatically

### **Error Recovery:**
- 🔁 **Retry logic** for failed service starts
- 📊 **Health monitoring** with detailed diagnostics
- 🛠️ **Troubleshooting guides** for common issues
- 📞 **Fallback options** when services unavailable

---

## 📈 **PERFORMANCE & SCALING**

### **Windows Native Advantages:**
- ⚡ **No Docker overhead** - direct process execution
- 🔗 **Native service integration** - uses Windows services
- 💾 **Memory efficient** - no container virtualization
- 🚀 **Faster startup** - no image pulling or container creation

### **Horizontal Scaling:**
```batch
# Start multiple workers on different machines
start-worker.bat  # Machine 1
start-worker.bat  # Machine 2
start-worker.bat  # Machine 3
```

### **Resource Management:**
- 🧠 **Memory**: ~2GB recommended (PostgreSQL + services)
- 💾 **Storage**: ~10GB for services + data
- 🌐 **Network**: All services run on localhost
- ⚡ **CPU**: Multi-threaded worker processing

---

## 🛠️ **TROUBLESHOOTING**

### **Common Issues & Solutions:**

**PostgreSQL Connection Failed:**
```batch
# Check password
set PGPASSWORD=123456
psql -U postgres -c "SELECT 1;"

# If failed, reset password:
# 1. Edit pg_hba.conf (change md5 to trust)
# 2. Restart PostgreSQL service
# 3. psql -U postgres -c "ALTER USER postgres PASSWORD '123456';"
# 4. Change pg_hba.conf back to md5
# 5. Restart PostgreSQL service
```

**Redis Not Starting:**
```batch
# Try system service first
sc start Redis

# If failed, portable version will be used
# Check: services/redis-server.exe
```

**RabbitMQ Issues:**
```batch
# Install via Chocolatey
choco install rabbitmq -y

# Enable management plugin
rabbitmq-plugins enable rabbitmq_management
```

**Port Conflicts:**
```batch
# Check what's using ports
netstat -ano | findstr ":5432"
netstat -ano | findstr ":6379"
netstat -ano | findstr ":5672"
```

**Windows Firewall:**
```batch
# Allow ports through firewall
netsh advfirewall firewall add rule name="Evidence Processing" dir=in action=allow protocol=TCP localport=5432,6379,5672,6333,7474,9000,9001,11434
```

---

## 🎉 **READY TO USE!**

Your Windows-native evidence processing system is now ready with:

✅ **Smart service detection** (uses existing PostgreSQL with password 123456)  
✅ **Intelligent fallbacks** (portable services when needed)  
✅ **No Docker required** (pure Windows native)  
✅ **Real-time processing** (OCR → Embeddings → RAG analysis)  
✅ **Web interface** (live progress tracking)  
✅ **Production ready** (error handling, monitoring, scaling)  

### **Start Processing Evidence Now:**

1. **Upload documents** → MinIO storage
2. **Submit processing job** → API endpoint  
3. **Watch real-time progress** → WebSocket updates
4. **Get AI insights** → RAG analysis results
5. **Explore connections** → Neo4j knowledge graph

**The system intelligently uses your existing services and scales automatically! 🚀**
