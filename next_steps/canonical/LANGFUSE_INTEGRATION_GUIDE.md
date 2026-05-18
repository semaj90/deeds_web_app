# Langfuse Integration Guide - Phase 66 Observability

**Last Updated**: January 2025
**Status**: ✅ **Production Ready**

## Overview

Langfuse observability is fully integrated into the AutoGen multi-agent system and FastMCP tool registry. This provides real-time tracking of:

- 📊 **LLM Traces**: Input/output, tokens, latency, costs
- 🤖 **Agent Interactions**: Multi-agent conversations and workflows
- 🔧 **Tool Calls**: Function calling observability
- 💰 **Cost Analytics**: Token usage and cost breakdown
- 📈 **Performance Metrics**: Latency, cache hits, error rates

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   AutoGen Multi-Agent System                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ LegalAgent   │  │ ErrorFixer   │  │ ResearchAgent│          │
│  │   Team       │  │    Agent     │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┴─────────────────┘                   │
│                           │                                     │
│                  Langfuse CallbackHandler                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Langfuse v3     │
                    │  (Port 3000)      │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
┌───────▼────────┐                      ┌───────────▼──────────┐
│  PostgreSQL 17 │                      │    ClickHouse        │
│   (langfuse)   │                      │  (legal_analytics)   │
│  Metadata      │◄─────────────────────┤  Time-series traces  │
└────────────────┘   Mirror Service     └──────────────────────┘
                     (5 min sync)
```

## Quick Start

### 1. Generate Langfuse API Keys

1. Open Langfuse UI: **http://localhost:3030**
2. Navigate to **Settings → API Keys**
3. Click **+ Create new API Keys**
4. Copy the **Public Key** and **Secret Key**

### 2. Configure Environment Variables

Add to your `.env` file or shell environment:

```bash
# Langfuse Observability
LANGFUSE_ENABLED=true
LANGFUSE_URL=http://localhost:3030
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Optional**:
```bash
LANGFUSE_DEBUG=false  # Set to 'true' for verbose logging
```

### 3. Restart Services

The integration is **automatic** - just restart your services:

```powershell
# Restart AutoGen agents
docker-compose restart backend

# Restart FastMCP server (if using MCP tools)
node scripts/fastmcp-server.mjs
```

**Verification**:
```
✅ Langfuse observability enabled: http://localhost:3030
   Public Key: pk-lf-ab...
   📊 Langfuse observability attached to AutoGen config
```

### 4. View Traces

Visit **http://localhost:3030/traces** to see real-time LLM traces!

## FastMCP Langfuse Tools

The FastMCP server includes 3 new observability tools:

### 1. `langfuse_log_trace`

**Description**: Log LLM traces to Langfuse
**Use Case**: Track agent calls manually (AutoGen logs automatically)

**Example**:
```javascript
POST http://localhost:3002/function-call

{
  "name": "langfuse_log_trace",
  "arguments": {
    "name": "legal_research_query",
    "input": "Find precedents for trademark dilution",
    "output": "Found 3 relevant cases: Smith v. Jones (2020)...",
    "metadata": {
      "agent": "LegalResearcher",
      "case_id": "CASE-2025-001"
    },
    "model": "gemma3-legal:latest",
    "usage": {
      "prompt_tokens": 120,
      "completion_tokens": 450,
      "total_tokens": 570
    },
    "tags": ["legal_research", "trademark"]
  }
}
```

**Response**:
```json
{
  "ok": true,
  "trace_id": "tr-abc123...",
  "url": "http://localhost:3030/traces/tr-abc123...",
  "logged_at": "2025-01-27T10:30:00Z",
  "meta": {
    "tool": "langfuse_log_trace",
    "model": "gemma3-legal:latest",
    "tokens": 570
  }
}
```

### 2. `langfuse_get_traces`

**Description**: Query trace history
**Use Case**: Retrieve past traces for analysis

**Example**:
```javascript
{
  "name": "langfuse_get_traces",
  "arguments": {
    "limit": 20,
    "page": 1,
    "tags": ["error_fixing"],
    "name": "autogen_error_fixer",
    "fromTimestamp": "2025-01-27T00:00:00Z"
  }
}
```

**Response**:
```json
{
  "ok": true,
  "traces": [
    {
      "id": "tr-abc123...",
      "name": "autogen_error_fixer",
      "input": "Fix TypeScript error TS2322...",
      "output": "Applied fix: Changed type to union type...",
      "timestamp": "2025-01-27T10:15:00Z",
      "tags": ["error_fixing", "typescript"]
    }
  ],
  "total_count": 42,
  "page": 1,
  "limit": 20
}
```

### 3. `langfuse_query_analytics`

**Description**: Query ClickHouse analytics
**Use Case**: Cost analysis, performance metrics, error trends

**Pre-built Query Types**:
- `cost_summary`: Token usage and costs by model
- `error_trends`: Error patterns over time
- `agent_performance`: Agent success rates and latency
- `cache_performance`: GPU cache hit rates

**Example**:
```javascript
{
  "name": "langfuse_query_analytics",
  "arguments": {
    "query_type": "cost_summary",
    "hours": 24,
    "model": "gemma3-legal:latest"  // Optional filter
  }
}
```

**Response**:
```json
{
  "ok": true,
  "query_type": "cost_summary",
  "hours": 24,
  "rows": [
    {
      "model": "gemma3-legal:latest",
      "total_calls": 1523,
      "total_prompt_tokens": 182400,
      "total_completion_tokens": 456000,
      "total_tokens": 638400,
      "avg_latency_ms": 342.5,
      "total_cost": 0.00  // Self-hosted = $0!
    }
  ],
  "row_count": 1
}
```

## AutoGen Integration

**Phase 66** AutoGen agents automatically log to Langfuse with **zero code changes**!

### What Gets Logged?

1. **Agent Messages**: All multi-agent conversations
2. **LLM Calls**: Input, output, tokens, latency
3. **Tool Calls**: Function calling (RAG, Neo4j, Redis, etc.)
4. **Errors**: Failed calls with stack traces
5. **Metadata**: Case ID, agent name, workflow context

### Example Trace in Langfuse UI

**Trace Name**: `autogen_legal_team_case_analysis`

```
┌─ Input
│  Case ID: CASE-2025-001
│  Task: Analyze evidence for trademark dilution claim
│
├─ Agent: LegalResearcher
│  ├─ Tool Call: rag_vector_search
│  │  Query: "trademark dilution precedents"
│  │  Results: 5 cases found
│  │
│  └─ LLM Call: gemma3-legal:latest
│      Tokens: 820 (prompt: 320, completion: 500)
│      Latency: 1.2s
│      Output: "Based on Smith v. Jones (2020)..."
│
├─ Agent: TimelineBuilder
│  └─ Tool Call: postgres_query_knowledge_base
│      Query: "Evidence chronology CASE-2025-001"
│      Results: 12 evidence items
│
└─ Output
   Status: success
   Confidence: 0.89
   Total Tokens: 1523
   Total Cost: $0.00
```

## ClickHouse Analytics

The **Phase 66 Mirror Service** syncs PostgreSQL → ClickHouse every 5 minutes with:

- **Auto-tagging**: Ollama gemma3-legal generates tags for errors
- **Redis Cache**: Avoids redundant GPU calls (cache hit rate: ~92%)
- **Time-series**: Partitioned by month for fast queries
- **TTL Policies**: 30-day retention for traces (configurable)

### Available Tables

1. **error_embeddings**: Mirrored from PostgreSQL with auto-tags
2. **llm_traces**: Langfuse LLM call traces
3. **agent_runs**: AutoGen workflow tracking
4. **gpu_cache_hits**: Redis cache performance
5. **vector_search_cache**: Qdrant search results (7-day TTL)

### Custom Queries

Query ClickHouse directly via `langfuse_query_analytics` or PostgreSQL wire protocol:

```python
# Via FastMCP tool
result = await langfuse_query_analytics({
    "query_type": "cost_summary",
    "hours": 168  # Last 7 days
})

# Via ClickHouse HTTP interface
curl -X POST 'http://localhost:5123' \
  -H 'X-ClickHouse-User: default' \
  -H 'X-ClickHouse-Key: default' \
  -H 'X-ClickHouse-Format: JSONCompact' \
  -d 'SELECT model, SUM(total_tokens) FROM llm_traces GROUP BY model'
```

## Cost Tracking

### Self-Hosted = $0/month

Since you're using Ollama (self-hosted), all LLM costs are **$0**!

**Comparison**:
- **Vertex AI**: $595 - $43,000/month (cloud-based)
- **LangSmith**: ~$100/month (observability only)
- **Your Stack**: **$0/month** (self-hosted Ollama + Langfuse)

### Token Usage

Track token usage via analytics:

```javascript
{
  "name": "langfuse_query_analytics",
  "arguments": {
    "query_type": "cost_summary",
    "hours": 24
  }
}
```

**Example Output**:
```
Total Tokens: 638,400
Estimated Cloud Cost: $1.91 (if using GPT-4)
Your Cost: $0.00 (Ollama self-hosted)
Savings: $1.91/day = $57/month = $684/year
```

## Troubleshooting

### API Keys Not Working

**Error**: `Langfuse API keys not configured`

**Solution**:
1. Visit http://localhost:3030
2. Settings → API Keys → Create new API Keys
3. Copy keys to `.env` file
4. Restart backend

### Langfuse Container Not Running

**Check Status**:
```powershell
docker ps --filter "name=langfuse"
```

**Expected Output**:
```
langfuse         Up (healthy)   0.0.0.0:3030->3000/tcp
langfuse-clickhouse  Up (healthy)   0.0.0.0:5123->8123/tcp
```

**Restart if Needed**:
```powershell
cd C:\Users\james\Videos\deeds-web-app
docker-compose -f docker-compose.langfuse.yml up -d
```

### No Traces Appearing

**Check Callback Handler**:
Look for this in AutoGen startup logs:
```
✅ Langfuse observability enabled: http://localhost:3030
   Public Key: pk-lf-abc...
   📊 Langfuse observability attached to AutoGen config
```

**If Missing**:
1. Verify `LANGFUSE_ENABLED=true` in `.env`
2. Verify API keys are set
3. Check Langfuse SDK installed: `pip list | grep langfuse`

### ClickHouse Analytics Failing

**Check Mirror Service**:
```powershell
docker logs phase66-clickhouse-mirror
```

**Expected Output**:
```
✅ Synced 1523 error embeddings (auto-tagged by Ollama)
✅ Synced 42 vector search cache entries
✅ Synced 189 GPU cache hits
📊 Next sync in 5 minutes...
```

## Advanced Configuration

### Custom Trace Metadata

Add custom metadata to traces:

```python
from backend.config.autogen_llm_config import get_autogen_config

config = get_autogen_config()
config["metadata"] = {
    "case_id": "CASE-2025-001",
    "user_id": "user-123",
    "session_id": "sess-abc",
    "environment": "production"
}
```

### Disable Observability (Development)

Set `LANGFUSE_ENABLED=false` in `.env`:

```bash
LANGFUSE_ENABLED=false
```

**Use Case**: Disable during high-volume testing to avoid trace bloat.

### Custom Analytics Queries

Add your own pre-built queries to `fastmcp-server.mjs`:

```javascript
const queries = {
  custom_query: `
    SELECT
      toStartOfDay(timestamp) as day,
      agent_name,
      AVG(confidence_score) as avg_confidence
    FROM agent_runs
    WHERE status = 'success'
    GROUP BY day, agent_name
    ORDER BY day DESC
    LIMIT 30
  `
};
```

## Next Steps

1. **Generate API Keys**: http://localhost:3030 → Settings → API Keys
2. **Update `.env`**: Add `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`
3. **Restart Services**: `docker-compose restart backend`
4. **Run AutoGen Agent**: Test with `POST /api/agents/autogen/fix-error`
5. **View Traces**: http://localhost:3030/traces

## Related Documentation

- [AUTOGEN_CREWAI_GO_INTEGRATION.md](./AUTOGEN_CREWAI_GO_INTEGRATION.md) - AutoGen architecture
- [docker-compose.langfuse.yml](./docker-compose.langfuse.yml) - ClickHouse + Langfuse deployment
- [FastMCP Server](./sveltekit-frontend/scripts/fastmcp-server.mjs) - Observability tools
- [Langfuse Docs](https://langfuse.com/docs) - Official documentation

---

**Phase 66**: Self-hosted observability with $0/month cost!
**Status**: ✅ Production ready (Langfuse v3, ClickHouse, PostgreSQL 17)
