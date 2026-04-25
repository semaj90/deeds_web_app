# Legal AI Platform Architecture

## 🏗️ Service Communication Flow

### The Complete Stack (Separate Services):

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code (VS Code Extension)              │
│                                                                 │
│  Uses two SEPARATE connections:                                │
│  1. Anthropic API (for LLM) → port 4000                        │
│  2. MCP Protocol (for tools) → port 3002                       │
└─────────────────────────────────────────────────────────────────┘
                    │                           │
                    │                           │
            ┌───────▼─────────┐         ┌───────▼──────────┐
            │  LiteLLM Proxy  │         │  MCP Context7    │
            │   (Port 4000)   │         │   (Port 3002)    │
            │                 │         │                  │
            │  Routes AI      │         │  Provides Tools  │
            │  requests to    │         │  & Context to    │
            │  local models   │         │  Claude Code     │
            └─────────────────┘         └──────────────────┘
                    │                           │
                    │                           │
            ┌───────▼─────────┐         ┌───────▼──────────┐
            │     Ollama      │         │  Redis + PG      │
            │   gemma3-legal  │         │  + Workers       │
            │  (Port 11434)   │         │                  │
            └─────────────────┘         └──────────────────┘
```

## 🔄 How They Communicate (Not Merge!)

### Service 1: LiteLLM Proxy (AI Gateway)
**Purpose**: Route AI requests to local models
**Port**: 4000
**What it does**:
- Receives OpenAI-compatible API calls
- Translates them to Ollama format
- Routes to gemma3-legal model
- Returns responses to Claude Code

**Example Request Flow**:
```javascript
// Claude Code sends:
POST http://localhost:4000/v1/chat/completions
{
  "model": "claude-sonnet-4-5",
  "messages": [{"role": "user", "content": "Analyze contract"}]
}

// LiteLLM translates to:
POST http://localhost:11434/api/generate
{
  "model": "gemma3-legal",
  "prompt": "Analyze contract"
}

// Returns Ollama response as OpenAI format
```

### Service 2: MCP Context7 Server (Tools & Context)
**Purpose**: Provide tools and context to Claude Code
**Port**: 3002
**What it does**:
- Exposes tools via MCP protocol
- Provides database access
- Offers Redis caching
- Runs parallel processing workers

**Example MCP Tool Call**:
```javascript
// Claude Code discovers MCP tools:
GET http://localhost:3002/mcp/tools
{
  "tools": [
    {
      "name": "search_legal_documents",
      "description": "Search legal docs with pgvector",
      "parameters": {...}
    }
  ]
}

// Claude Code calls tool:
POST http://localhost:3002/mcp/process
{
  "tool": "search_legal_documents",
  "query": "contract disputes 2024"
}

// MCP server returns:
{
  "results": [...documents from PostgreSQL...]
}
```

## 🎯 Why They're Separate Services

### LiteLLM (AI Gateway)
- **Responsibility**: Model routing ONLY
- **Doesn't know**: About your database, tools, or workers
- **Provides**: AI completions to Claude Code

### MCP Server (Tool Provider)
- **Responsibility**: Tools, context, and data access
- **Doesn't know**: About AI models or LiteLLM
- **Provides**: Capabilities Claude Code can invoke

## 🔗 How Claude Code Uses Both

Claude Code makes **two types of requests**:

### 1. LLM Requests (to LiteLLM)
```javascript
// Environment variable tells Claude Code where to find LLM
ANTHROPIC_BASE_URL=http://localhost:4000
ANTHROPIC_API_KEY=sk-1234

// Claude Code sends chat messages here
fetch('http://localhost:4000/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer sk-1234' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5',
    messages: [...]
  })
})
```

### 2. Tool/MCP Requests (to MCP Server)
```javascript
// ~/.claude/mcp.json tells Claude Code about MCP servers
{
  "mcpServers": {
    "context7-optimized": {
      "command": "node",
      "args": ["...mcp-context7-optimized.mjs"],
      "env": { "MCP_PORT": "3002" }
    }
  }
}

// Claude Code discovers and calls tools
fetch('http://localhost:3002/mcp/process', {
  method: 'POST',
  body: JSON.stringify({
    tool: 'search_legal_documents',
    params: {...}
  })
})
```

## 📊 Communication Pattern Example

**User asks**: "Find similar contract disputes and analyze them"

### Step 1: Claude Code → LiteLLM (AI reasoning)
```
POST http://localhost:4000/v1/chat/completions
Request: "Find similar contract disputes and analyze them"
Response: "I'll use the search_legal_documents tool..."
```

### Step 2: Claude Code → MCP Server (tool execution)
```
POST http://localhost:3002/mcp/process
Request: { tool: "search_legal_documents", query: "contract disputes" }
Response: { results: [...legal documents...] }
```

### Step 3: Claude Code → LiteLLM (AI analysis)
```
POST http://localhost:4000/v1/chat/completions
Request: "Here are the documents: [...]. Analyze them."
Response: "Analysis: These contract disputes show patterns..."
```

## 🚀 Service Independence

### LiteLLM Can:
- ✅ Run without MCP server
- ✅ Serve any OpenAI-compatible client
- ✅ Route to multiple model providers

### MCP Server Can:
- ✅ Run without LiteLLM
- ✅ Serve any MCP-compatible client
- ✅ Provide tools to any application

### They Don't Merge Because:
1. **Different protocols**: OpenAI API vs MCP protocol
2. **Different ports**: 4000 vs 3002
3. **Different responsibilities**: Model routing vs Tool execution
4. **Independent scaling**: Scale AI separately from tools

## 🔧 Configuration Summary

### LiteLLM Configuration (`litellm_config.yaml`):
```yaml
model_list:
  - model_name: claude-sonnet-4-5
    litellm_params:
      model: ollama/gemma3-legal
      api_base: http://localhost:11434
```
**Purpose**: Map Claude model names → Ollama models

### MCP Configuration (`~/.claude/mcp.json`):
```json
{
  "mcpServers": {
    "context7-optimized": {
      "command": "node",
      "args": ["mcp-context7-optimized.mjs"],
      "env": {
        "MCP_PORT": "3002",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```
**Purpose**: Tell Claude Code where to find MCP tools

### Claude Code Configuration:
```bash
ANTHROPIC_BASE_URL=http://localhost:4000  # For LLM
ANTHROPIC_API_KEY=sk-1234                  # LiteLLM auth
# MCP servers discovered from ~/.claude/mcp.json
```

## 📈 Performance Benefits of Separation

### LiteLLM (AI Gateway)
- Handles AI completions
- Can route to fastest available model
- Caches responses independently

### MCP Server (Tool Layer)
- Handles data access with 16 workers
- Caches database results in Redis
- Processes requests in parallel

### Result:
- AI requests don't block data access
- Data access doesn't block AI
- Each service scales independently
- Total throughput: AI + Tools in parallel

## 🎯 Real-World Workflow

```
User: "Analyze contract XYZ for risks"
    ↓
Claude Code → LiteLLM: "What should I do?"
    ↓
LiteLLM → Ollama gemma3-legal: Process request
    ↓
gemma3-legal → LiteLLM: "I need contract XYZ"
    ↓
Claude Code → MCP Server: get_contract(id='XYZ')
    ↓
MCP Server → PostgreSQL: SELECT * FROM contracts WHERE id='XYZ'
    ↓
MCP Server → Claude Code: {contract data}
    ↓
Claude Code → LiteLLM: "Analyze this: {contract data}"
    ↓
LiteLLM → Ollama gemma3-legal: Analyze contract
    ↓
gemma3-legal → User: "Risk analysis: ..."
```

## ✅ Key Takeaways

1. **LiteLLM = AI Gateway**: Routes model requests ONLY
2. **MCP Server = Tool Provider**: Executes tools and provides context
3. **They Don't Merge**: Communicate via HTTP on different ports
4. **Claude Code Orchestrates**: Uses both services together
5. **Independent Services**: Each can scale and restart separately

This architecture follows the **microservices pattern**:
- Single responsibility per service
- Independent deployment
- Horizontal scalability
- Fault isolation

---

**LiteLLM**: AI routing service (port 4000)
**MCP Server**: Tool execution service (port 3002)
**Claude Code**: Orchestrator using both services
