# Enhanced RAG System Integration Guide

## Quick Start

### 1. Run the Comprehensive Integration Script

```powershell
# Full integration with all checks and fixes
.\COMPREHENSIVE-RAG-SYSTEM-INTEGRATION.ps1

# Skip dependency installation (if already done)
.\COMPREHENSIVE-RAG-SYSTEM-INTEGRATION.ps1 -SkipDependencies

# Skip tests (for faster execution)
.\COMPREHENSIVE-RAG-SYSTEM-INTEGRATION.ps1 -SkipTests

# Verbose output for debugging
.\COMPREHENSIVE-RAG-SYSTEM-INTEGRATION.ps1 -VerboseOutput
```

### 2. What the Script Does

#### **Prerequisites Testing**
- ✅ Node.js (v18+)
- ✅ npm (v9+)
- ✅ Python (v3.9+)
- ✅ Git
- ⚠️ PostgreSQL (optional)
- ⚠️ Docker (optional)

#### **Dependency Installation**
- 📦 Root project dependencies
- 📦 SvelteKit frontend dependencies
- 📦 RAG backend dependencies
- 📦 MCP server dependencies
- 📦 Python RAG dependencies

#### **Error Testing & Fixing**
- 🔍 SvelteKit `npm run check` validation
- 🔍 RAG backend structure validation
- 🔧 Automatic error reporting
- 📊 Detailed error analysis

#### **Agent Orchestrator Refactoring**
- 🤖 **Claude Agent**: Legal document analysis with Anthropic API
- 🤖 **CrewAI Agent**: Multi-agent collaboration workflows
- 🤖 **Gemma Agent**: Local LLM with GGUF model support
- 🤖 **Ollama Agent**: Multi-model support and switching
- 🎯 **Main Orchestrator**: Coordinates all agents with synthesis

#### **Configuration Management**
- ⚙️ Context7 MCP server configuration
- ⚙️ Enhanced RAG backend integration
- ⚙️ Agent orchestrator setup
- ⚙️ VS Code extension configuration

#### **Documentation Structure**
- 📁 Context7 docs directory validation
- 📁 Required SvelteKit structure
- 📁 Configuration files generation

#### **Best Practices Generation**
- 📋 Enhanced RAG system best practices
- 📋 Context7 integration guidelines
- 📋 Multi-agent orchestration patterns
- 📋 Security and performance recommendations

#### **Component Testing**
- 🧪 PostgreSQL connection testing
- 🧪 Ollama service validation
- 🧪 Agent orchestrator module testing
- 🧪 RAG backend validation
- 🧪 SvelteKit frontend testing
- 🧪 Context7 MCP configuration validation

## Key Features Implemented

### 1. **Enhanced Agent System**

#### Claude Agent (`agent-orchestrator/agents/claude.js`)
```javascript
// Legal document analysis with confidence scoring
const analysis = await claudeAgent.analyzeLegalDocument(document, context);
console.log(analysis.confidence); // 0.0 - 1.0 confidence score

// Generate legal briefs
const brief = await claudeAgent.generateLegalBrief(caseData, requirements);
```

#### CrewAI Agent (`agent-orchestrator/agents/crewai.js`)
```javascript
// Create multi-agent research crews
const crew = await crewaiAgent.createLegalResearchCrew(caseData);
const results = await crewaiAgent.executeCrew(crew.id, inputData);
```

#### Gemma Agent (`agent-orchestrator/agents/gemma.js`)
```javascript
// Local GGUF model inference
const analysis = await gemmaAgent.analyzeLegalDocument(document, 'contract');
const summary = await gemmaAgent.summarizeDocument(document, 500);
```

#### Ollama Agent (`agent-orchestrator/agents/ollama.js`)
```javascript
// Multi-model comparative analysis
const comparison = await ollamaAgent.compareLegalAnalysis(document, ['gemma3:latest', 'llama3:latest']);
const embeddings = await ollamaAgent.generateEmbeddings(text);
```

### 2. **Main Orchestrator** (`agent-orchestrator/index.js`)
```javascript
import AgentOrchestrator from './agent-orchestrator/index.js';

const orchestrator = new AgentOrchestrator({
  claude: { enabled: true, apiKey: process.env.ANTHROPIC_API_KEY },
  gemma: { enabled: true, modelPath: './gemma3Q4_K_M/mohf16-Q4_K_M.gguf' },
  ollama: { enabled: true, endpoint: 'http://localhost:11434' },
  crewai: { enabled: true, endpoint: 'http://localhost:8001' }
});

await orchestrator.initialize();
const results = await orchestrator.analyzeLegalDocument(document);
console.log(results.synthesis); // AI-powered synthesis of all agent results
```

### 3. **Context7 MCP Configuration**

The script automatically configures:
- **Legal AI Context**: SvelteKit5 + PostgreSQL + Drizzle + Gemma3 + AutoGen + CrewAI
- **Enhanced RAG Backend**: Multi-layered caching + vector search
- **Agent Orchestrator**: Multi-agent coordination
- **VS Code Extension**: Context7 integration

### 4. **Best Practices Integration**

Generated guides include:
- **Performance Optimization**: Caching strategies, GPU acceleration
- **Security**: Encryption, access controls, audit trails
- **Monitoring**: Health checks, metrics collection, alerting
- **Development**: Testing strategies, deployment practices

## Usage Examples

### Starting the System

1. **Run Integration Script**:
   ```powershell
   .\COMPREHENSIVE-RAG-SYSTEM-INTEGRATION.ps1
   ```

2. **Start Services**:
   ```bash
   # Start PostgreSQL (if using Docker)
   docker run -d --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:15

   # Start Ollama
   ollama serve

   # Start RAG Backend
   cd rag-backend && npm start

   # Start SvelteKit Frontend
   cd sveltekit-frontend && npm run dev
   ```

3. **Load Gemma3 Model** (if needed):
   ```bash
   ollama create gemma3-legal -f ./gemma3Q4_K_M/Modelfile-gemma3-legal
   ollama run gemma3-legal
   ```

### Using the VS Code Extension

After running the integration script, your VS Code extension will have new commands:

- **Context7 Analysis**: `Ctrl+Shift+P` → "MCP: Analyze Current Context"
- **Best Practices**: `Ctrl+Shift+P` → "MCP: Generate Best Practices"
- **Agent Orchestration**: `Ctrl+Shift+P` → "MCP: Create Workflow"
- **Library Search**: `Ctrl+Shift+P` → "MCP: Search Libraries"

### API Endpoints Available

After integration, you'll have these endpoints:

```typescript
// Enhanced RAG API
POST /api/rag?action=upload     // Document upload
POST /api/rag?action=search     // Vector/hybrid search
POST /api/rag?action=analyze    // AI text analysis
POST /api/rag?action=workflow   // Multi-agent workflows
GET  /api/rag?action=status     // System health

// Agent Orchestrator API
POST /api/orchestrator          // Create and execute workflows
GET  /api/orchestrator          // View active workflows

// Library Sync API
POST /api/libraries             // Sync library metadata
GET  /api/libraries             // Search libraries
GET  /api/agent-logs            // View agent call logs
```

## Troubleshooting

### Common Issues

1. **"Prerequisites check failed"**
   - Install Node.js 18+ from https://nodejs.org
   - Install Python 3.9+ from https://python.org

2. **"PostgreSQL connection failed"**
   - Install PostgreSQL or use Docker: `docker run -d --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:15`

3. **"Ollama service unavailable"**
   - Install Ollama from https://ollama.ai
   - Start service: `ollama serve`

4. **"Agent orchestrator module failed"**
   - Check Node.js version compatibility
   - Run `npm install` in agent-orchestrator directory

### Log Files

The script generates detailed logs:
- **Integration Log**: `comprehensive-integration-log-TIMESTAMP.txt`
- **Error Report**: `error-report-TIMESTAMP.json`
- **Frontend Errors**: `frontend-check-errors-TIMESTAMP.txt`

### Success Metrics

- **80%+ Success Rate**: System is largely functional
- **60-79% Success Rate**: Partial success, some fixes needed
- **<60% Success Rate**: Significant issues require attention

## Advanced Configuration

### Custom Agent Configuration

```javascript
// Custom agent configuration
const customConfig = {
  claude: {
    enabled: true,
    apiKey: 'your-anthropic-key',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.1
  },
  gemma: {
    enabled: true,
    modelPath: './custom-model.gguf',
    contextWindow: 8192
  }
};
```

### Environment Variables

Set these in your `.env` file:
```bash
# Required for Claude
ANTHROPIC_API_KEY=your_key_here

# Optional configurations
OLLAMA_ENDPOINT=http://localhost:11434
DATABASE_URL=postgresql://postgres:password@localhost:5432/legal_ai_db
RAG_BACKEND_URL=http://localhost:8000
CONTEXT7_SERVER_PORT=40000
```

## Next Steps

After successful integration:

1. **Test Individual Agents**: Use VS Code commands to test each agent
2. **Load Legal Documents**: Upload test documents via `/api/rag?action=upload`
3. **Create Workflows**: Use the orchestrator to create multi-agent workflows
4. **Monitor Performance**: Check `/api/rag?action=status` for system health
5. **Provide Feedback**: Use VS Code feedback commands to improve AI responses

## Support

- **Integration Issues**: Check the generated error report JSON
- **Agent Problems**: Review individual agent logs in the orchestrator
- **Performance**: Use the metrics API endpoints for monitoring
- **Development**: Follow the generated best practices guides

---

🎉 **Your Enhanced RAG System with Context7 MCP integration is now ready for advanced legal AI workflows!**