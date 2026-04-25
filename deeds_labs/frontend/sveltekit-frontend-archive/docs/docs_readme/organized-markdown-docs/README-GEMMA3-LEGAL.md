# Legal AI Assistant - Gemma3 Legal Model Integration

## 🤖 Gemma3 Legal AI Model

This legal AI assistant is optimized to use the **Gemma3 Legal** model, a specialized AI model fine-tuned for legal document analysis, compliance checking, and legal research tasks.

### Model Features

- **Legal Document Analysis**: Specialized understanding of legal terminology and concepts
- **Compliance Checking**: Automated detection of regulatory compliance issues
- **Risk Assessment**: Evaluation of legal risks in contracts and documents
- **Entity Extraction**: Identification of legal entities (cases, citations, statutes, parties)
- **Contract Analysis**: Review of contract clauses and terms
- **Legal Research**: Assistance with legal precedent research

### System Requirements

- **Memory**: 6GB allocated to Ollama container (4GB minimum reserved)
- **GPU**: NVIDIA GPU with CUDA 12 support (optional, falls back to CPU)
- **Storage**: ~3GB for model storage
- **Platform**: Windows 10/11 with WSL2, macOS, or Linux

## 🚀 Quick Start

### Option 1: Using .bat files (Windows)
```bash
# Complete setup with Gemma3 Legal model
setup-complete-with-ollama.bat

# Quick start (if already set up)
quick-start.bat

# Check system health
check-setup.bat
```

### Option 2: Using npm scripts (Cross-platform)
```bash
# Install dependencies
npm install

# Complete setup
npm run setup

# Start development environment
npm run dev

# Test Gemma3 Legal AI
npm run ai:test

# Health monitoring
npm run health
```

## 📋 Available Commands

### Development Commands
- `npm run setup` - Complete environment setup with Gemma3 Legal model
- `npm run dev` - Start development environment (frontend + backend)
- `npm run build` - Build production application
- `npm run preview` - Preview production build

### AI & Docker Commands
- `npm run ai:start` - Start AI services (Postgres, Ollama, Qdrant)
- `npm run ai:stop` - Stop AI services
- `npm run ai:test` - Test Gemma3 Legal AI model with legal analysis prompt
- `npm run docker:up` - Start all Docker services
- `npm run docker:down` - Stop all Docker services
- `npm run docker:logs` - View service logs
- `npm run docker:status` - Show container status

### Monitoring & Maintenance
- `npm run health` - Comprehensive system health check
- `npm run monitor` - Real-time resource monitoring
- `npm run db:migrate` - Apply database migrations
- `npm run db:studio` - Open database studio

## 🔧 Configuration

### Docker Compose (Optimized)
The system uses `docker-compose-optimized.yml` with:
- 6GB memory allocation for Ollama
- Proper volume mounting (no copying required)
- Health checks for all services
- Service dependencies
- GPU acceleration support

### Model Configuration
```yaml
ollama:
  environment:
    - OLLAMA_DEFAULT_MODEL=gemma3-legal
    - OLLAMA_MAX_LOADED_MODELS=1
    - OLLAMA_KEEP_ALIVE=5m
    - OLLAMA_RUNNERS_TTL=5m
    - OLLAMA_NUM_PARALLEL=2
```

### WSL2 Optimization (Windows)
Create `%USERPROFILE%\.wslconfig`:
```ini
[wsl2]
memory=16GB
processors=8
swap=4GB
localhostForwarding=true

[experimental]
autoMemoryReclaim=gradual
networkingMode=mirrored
dnsTunneling=true
```

## 🏗️ Architecture

### Domain-Driven Structure
```
src/
├── domains/
│   ├── case-management/
│   │   ├── components/
│   │   ├── stores/
│   │   └── ai-integrations/
│   ├── document-analysis/
│   │   ├── components/
│   │   ├── ml-models/
│   │   └── processing/
│   └── legal-research/
├── lib/
│   ├── ai/
│   ├── security/
│   └── compliance/
└── routes/
    └── [domain]/
```

### AI Integration Components
- **Legal Document Service**: Clean architecture for AI analysis
- **Legal Case Store**: Svelte 5 runes with audit logging
- **AI Cache Service**: 30-minute TTL with IndexedDB persistence
- **Web Workers**: Non-blocking document processing
- **Legal Analysis Dialog**: Bits UI components with accessibility

## 🤖 Model Usage Examples

### Testing the Legal AI Model
```bash
# Test legal document analysis
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma3-legal",
    "prompt": "Analyze this contract clause for potential liability issues: The contractor shall indemnify and hold harmless the client from any claims arising from the work performed.",
    "stream": false
  }'
```

### In Application Code
```typescript
// Using the Legal Document Service
const analysis = await legalDocumentService.analyzeDocument(documentId);

// Example response structure
{
  document: LegalDocument,
  insights: {
    riskAssessment: { level: 'MEDIUM', score: 0.6 },
    complianceChecks: [...],
    entities: [...],
    findings: [...]
  }
}
```

## 🔍 Model Fallback Strategy

If `gemma3-legal` is not available, the system automatically falls back to `gemma2:9b`:

1. **Primary**: `gemma3-legal` (specialized legal model)
2. **Fallback**: `gemma2:9b` (general purpose model)
3. **Error Handling**: Graceful degradation with user notification

## 📊 Performance Optimization

### AI Response Caching
- 30-minute TTL for legal analysis results
- IndexedDB persistence across sessions
- LRU eviction policy
- Cache hit rate tracking

### Memory Management
- 6GB container memory allocation
- 4GB minimum reserved
- Ollama memory mapping optimization
- Automatic cleanup of expired cache entries

### Web Workers
- Non-blocking document processing
- Progress tracking for long operations
- Error handling and recovery
- Legal entity extraction pipeline

## 🛡️ Security & Compliance

### Audit Logging
All legal operations are logged with:
- User identification
- IP address tracking
- Action timestamps
- Document access trails
- Compliance verification

### Access Control
- Confidentiality level filtering
- User clearance verification
- Role-based permissions
- Secure session management

## 🚨 Troubleshooting

### Common Issues

1. **Model Not Found**
   ```bash
   # Check available models
   docker exec deeds-ollama-gpu ollama list
   
   # Pull Gemma3 Legal model
   docker exec deeds-ollama-gpu ollama pull gemma3-legal
   ```

2. **Memory Issues**
   ```bash
   # Check container memory usage
   docker stats deeds-ollama-gpu
   
   # Increase WSL2 memory in .wslconfig
   ```

3. **Health Check Failures**
   ```bash
   # Run comprehensive health check
   npm run health
   
   # Or use the .bat file
   check-setup.bat
   ```

### Support Commands
- `npm run health` - Diagnose system issues
- `npm run monitor` - Monitor resource usage
- `npm run docker:logs` - View detailed logs
- `service-manager.bat` - Interactive service management

## 🎯 Legal AI Capabilities

### Document Analysis
- Contract review and clause analysis
- Compliance checking against regulations
- Risk assessment and scoring
- Legal entity extraction and classification

### Case Management
- Case document organization
- AI-powered case analysis
- Priority scoring and recommendations
- Audit trail maintenance

### Research Assistance
- Legal precedent research
- Citation analysis and verification
- Regulatory compliance checking
- Document similarity analysis

## 📈 Next Steps

1. **Complete Setup**: Run `npm run setup` or `setup-complete-with-ollama.bat`
2. **Test AI Model**: Use `npm run ai:test` to verify Gemma3 Legal model
3. **Start Development**: Run `npm run dev` for full development environment
4. **Monitor Health**: Regular `npm run health` checks
5. **Configure Context7**: Add MCP server for up-to-date documentation
6. **GPU Optimization**: Ensure NVIDIA drivers are updated
7. **Frontend Development**: Build components using established patterns

## 🔄 Migration from .bat to npm

Use `migrate-to-npm.bat` to transition from Windows batch files to cross-platform npm scripts:

```bash
# Run migration helper
migrate-to-npm.bat

# This provides guidance on:
# • Command mappings
# • Benefits of npm scripts
# • Cross-platform compatibility
# • Modern development workflows
```

## 📚 Additional Resources

### File Structure
```
deeds-web-app/
├── .bat files (Windows compatibility)
│   ├── check-setup.bat
│   ├── quick-start.bat
│   ├── setup-complete-with-ollama.bat
│   ├── service-manager.bat
│   └── migrate-to-npm.bat
├── scripts/
│   ├── setup.js (Cross-platform setup)
│   └── health-check.js
├── docker-compose-optimized.yml
├── .wslconfig (WSL2 optimization)
├── sveltekit-frontend/
│   └── src/
│       ├── domains/ (Domain-driven architecture)
│       ├── lib/
│       │   ├── components/
│       │   ├── services/
│       │   ├── stores/
│       │   └── types/
│       └── static/workers/
└── package.json (npm scripts)
```

### Key Features Implemented

✅ **6GB optimized memory allocation** for stable AI inference  
✅ **Cross-platform npm scripts** replacing Windows-only .bat files  
✅ **Domain-driven architecture** for maintainable legal software  
✅ **AI response caching** for improved performance  
✅ **Web Workers** for non-blocking document processing  
✅ **Comprehensive type safety** with TypeScript  
✅ **Audit logging** for legal compliance  
✅ **Modern SvelteKit 2** with Bits UI components  
✅ **Gemma3 Legal model** with automatic fallback  

This implementation delivers immediate performance gains while establishing a scalable foundation for legal AI application development with the specialized Gemma3 Legal model.
