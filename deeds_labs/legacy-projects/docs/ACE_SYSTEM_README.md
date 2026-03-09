# ACE System - Agentic Context Engineering

## Overview

The ACE (Agentic Context Engineering) System is a comprehensive pipeline for automated error detection, analysis, and fixing across the Legal AI platform's ~900 API endpoints.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ACE System Pipeline                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🌐 Web Crawl    →    🖼️ VLM Process    →    🕸️ Graph Build        │
│  (Playwright)         (Gemma3 VLM)          (Neo4j)                │
│       │                    │                    │                   │
│       ▼                    ▼                    ▼                   │
│  Screenshots          UI Analysis          Knowledge               │
│  HTML/DOM             Accessibility        Graph                   │
│  Console Errors       Layout Issues        Relationships           │
│                                                                     │
│       └────────────────────┬────────────────────┘                  │
│                            ▼                                        │
│                    🎯 Vector Index                                  │
│                       (Qdrant)                                      │
│                            │                                        │
│                            ▼                                        │
│                    🤖 LLM Analyze                                   │
│                    (Ollama/Gemma)                                   │
│                            │                                        │
│                            ▼                                        │
│                    ✅ Auto-Fix Engine                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Routes

| Route | Description |
|-------|-------------|
| `/all-routes` | Original routes center with basic ACE integration |
| `/all-routes-ace` | **NEW** Dedicated ACE System interface with full pipeline control |

## API Endpoints

### Frontend (SvelteKit)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ace/web-crawl` | POST | Crawl routes and collect screenshots |
| `/api/ace/vlm-process` | POST | Process images with Vision Language Model |
| `/api/ace/graph-build` | POST | Build knowledge graph from data |
| `/api/ace/vector-index` | POST | Index embeddings in Qdrant |
| `/api/ace/llm-analyze` | POST | AI-powered error detection |

### Backend (FastAPI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ace/run-pipeline` | POST | Run complete ACE pipeline |
| `/ace/status` | GET | Get pipeline status |
| `/ace/errors` | GET | Get detected errors with filtering |
| `/ace/fix-error` | POST | Auto-fix a specific error |
| `/ace/fix-all` | POST | Fix all auto-fixable errors |

## File Structure

```
backend/
├── services/
│   └── ace/
│       ├── __init__.py
│       ├── config.py                    # ACE configuration
│       ├── context_anchor.py            # Context anchor management
│       ├── enhanced_feature_vector.py   # Feature vector processing
│       ├── models.py                    # Data models
│       ├── multimodal_search.py         # Multimodal search
│       ├── self_healing_engine.py       # Self-healing capabilities
│       └── agentic_error_fixer.py       # NEW: Main error fixer
├── api/
│   └── ace_api.py                       # NEW: FastAPI endpoints

sveltekit-frontend/
├── src/
│   └── routes/
│       ├── all-routes/
│       │   └── +page.svelte             # Original routes page
│       ├── all-routes-ace/
│       │   └── +page.svelte             # NEW: Dedicated ACE interface
│       └── api/
│           └── ace/
│               ├── web-crawl/+server.ts
│               ├── vlm-process/+server.ts
│               ├── graph-build/+server.ts    # NEW
│               ├── vector-index/+server.ts   # NEW
│               └── llm-analyze/+server.ts    # NEW
```

## Pipeline Stages

### 1. 🌐 Web Crawl
- Uses Playwright to crawl each route
- Captures screenshots for VLM processing
- Extracts HTML/DOM structure
- Collects console errors and network failures

### 2. 🖼️ VLM Process
- Sends screenshots to Gemma3 VLM
- Extracts visual features and descriptions
- Detects UI/accessibility issues
- Generates embeddings for visual content

### 3. 🕸️ Graph Build
- Parses route relationships and dependencies
- Builds Neo4j knowledge graph
- Creates entity nodes (routes, components, APIs)
- Establishes relationship edges

### 4. 🎯 Vector Index
- Generates embeddings using Ollama/Gemma
- Stores vectors in Qdrant collection
- Creates semantic index for error patterns
- Enables similarity search for fixes

### 5. 🤖 LLM Analyze
- Queries Ollama for error analysis
- Uses RAG to find similar past errors
- Generates fix suggestions
- Prioritizes by severity and impact

## Error Types

| Type | Description |
|------|-------------|
| `syntax` | Code syntax errors, unused imports |
| `runtime` | Unhandled exceptions, promise rejections |
| `ui` | Layout issues, contrast problems |
| `accessibility` | Missing ARIA labels, keyboard navigation |
| `performance` | Large bundles, slow rendering |
| `security` | XSS vulnerabilities, auth issues |
| `type` | TypeScript type errors |

## Severity Levels

| Level | Description |
|-------|-------------|
| `critical` | System-breaking issues requiring immediate fix |
| `high` | Significant issues affecting functionality |
| `medium` | Issues that should be addressed soon |
| `low` | Minor issues, optimizations |

## Usage

### Running the Pipeline

1. Navigate to `/all-routes-ace`
2. Click "Run Complete Pipeline" to execute all stages
3. View detected errors in the "Errors" tab
4. Use "Fix All" to auto-fix compatible errors

### API Usage

```typescript
// Run complete pipeline
const response = await fetch('/api/ace/run-pipeline', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ routes: ['/cases', '/evidence', '/demo'] })
});

// Get errors
const errors = await fetch('/api/ace/errors?severity=critical');

// Fix specific error
await fetch('/api/ace/fix-error', {
  method: 'POST',
  body: JSON.stringify({ error_id: 'err-123' })
});
```

## Integration with Existing Systems

The ACE System integrates with:

- **Ollama**: For LLM inference and embeddings
- **Qdrant**: For vector storage and similarity search
- **Neo4j**: For knowledge graph storage
- **Redis**: For caching and session management
- **PostgreSQL**: For persistent error tracking

## Future Enhancements

- [ ] Real-time error monitoring with WebSocket updates
- [ ] CI/CD integration for automated error detection
- [ ] Custom error pattern definitions
- [ ] Machine learning for fix prediction
- [ ] Integration with GitHub Issues for tracking
