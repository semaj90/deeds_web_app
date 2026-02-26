# Design Document Summary

**Status:** ✅ Complete
**Date:** December 20, 2025

---

## 🎯 What's Been Designed

A comprehensive, production-ready agentic system that unifies:
- **21+ tools** across 7 categories
- **Phase 13** Agentic Tool Calling
- **Phase 76** Knowledge Search Engine
- **Existing ACP** Tool Registry

---

## 📐 Architecture Highlights

### Unified Tool Registry
```
7 Categories:
├─ Knowledge (2 tools): search, index
├─ Code (3 tools): analyze, search, ast
├─ LLM (2 tools): generate, embed
├─ Web (2 tools): crawl, search
├─ Agent (3 tools): delegate, discover, broadcast
├─ Fix (2 tools): svelte5, suggest
└─ Database (5 tools): db:query, cache:get/set, minio:upload/download
```

### Data Flow
```
Request → Tool Registry → Retry Logic → Circuit Breaker → Tool Execution
                                                              ↓
                                                    [Service Layer]
                                                    ├─ PostgreSQL
                                                    ├─ Redis
                                                    ├─ Qdrant
                                                    ├─ Ollama
                                                    └─ MinIO
                                                              ↓
                                                    Cache & Return
```

### Error Handling
- **Retry Strategy**: 3 attempts with exponential backoff
- **Circuit Breaker**: Opens after 5 failures in 60s
- **Fallback**: Direct implementation when MCP unavailable
- **Timeout**: 5s for MCP calls, service-specific for others

---

## 🔧 Key Components

### 1. Database Tools (NEW)
```typescript
db:query      → Execute PostgreSQL queries (parameterized)
cache:get     → Retrieve from Redis
cache:set     → Store in Redis with TTL
minio:upload  → Upload files to object storage
minio:download → Download files from object storage
```

### 2. CLI Interface (NEW)
```bash
# Interactive tool selection
npm run acp -- knowledge:search --query "Svelte 5" --topK 5

# Database operations
npm run acp -- db:query --query "SELECT * FROM cases LIMIT 10"

# Cache operations
npm run acp -- cache:get --key "search:svelte5:runes"

# File operations
npm run acp -- minio:upload --bucket "docs" --key "file.txt"
```

### 3. VS Code Tasks (NEW)
```json
{
  "label": "ACP: Knowledge Search",
  "command": "npm run acp -- knowledge:search --query \"${input:query}\""
}
```

### 4. Docker Integration (NEW)
- Health checks for all containers
- Automatic reconnection on restart
- Proper authentication to legal_ai_db
- Service discovery and routing

---

## ✅ Correctness Properties (12 Total)

1. **Tool Registry Completeness** - At least one tool per category
2. **Execution Idempotency** - Same args → same results
3. **Error Recovery** - Retry up to 3 times with backoff
4. **Circuit Breaker** - Opens after 5 failures in 60s
5. **Cache Consistency** - Deterministic cache keys
6. **Database Safety** - Parameterized queries only
7. **Redis TTL** - Enforced expiration
8. **MinIO Integrity** - Verify uploads succeed
9. **CLI Validation** - Validate args before execution
10. **Container Health** - Check before routing
11. **MCP Fallback** - Direct impl within 5s
12. **Test Isolation** - Mocks cleaned up after tests

---

## 🧪 Testing Strategy

### Unit Tests
- Mock all external services
- Test success/error paths
- Test edge cases
- Test timeout handling

### Property-Based Tests
- Test all 12 correctness properties
- Use fast-check for random input generation
- Verify properties hold across all inputs

### Integration Tests
- Test tool interactions
- Test service communication
- Test Docker container integration

### End-to-End Tests
- Complete workflows
- CLI usage
- VS Code task execution

---

## 🚀 Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Tool execution | < 500ms | Without LLM |
| LLM synthesis | < 5s | Ollama/Gemini |
| Database query | < 100ms | PostgreSQL |
| Cache operations | < 10ms | Redis |
| MinIO upload/download | < 200ms | Object storage |
| MCP call overhead | < 15ms | Local network |

### Caching Strategy
- Query embeddings: 24 hours
- Search results: 12 hours
- Database results: 5 minutes
- Web pages: 7 days
- LLM responses: 1 hour

---

## 🐳 Docker Compose Stack

```yaml
Services:
├─ sveltekit (5173)
├─ postgres (5432) - legal_ai_db
├─ redis (6379)
├─ qdrant (6333)
├─ ollama (11434)
└─ minio (9000)

All services:
✓ Health checks configured
✓ Automatic restart
✓ Volume persistence
✓ Network isolation
```

---

## 🔒 Security Features

1. **SQL Injection Prevention** - Parameterized queries only
2. **Redis Key Namespacing** - Prevent collisions
3. **MinIO Access Control** - Pre-signed URLs
4. **Input Validation** - JSON Schema validation
5. **Error Message Sanitization** - No sensitive data leaks

---

## 📊 What This Solves

### ✅ Fixes 83 Failing Tests
- Proper mocking infrastructure
- Service isolation in tests
- Mock cleanup after tests
- CI/CD compatibility

### ✅ Unifies Tool Access
- Single registry for all tools
- Consistent API across tools
- MCP protocol support
- CLI and VS Code integration

### ✅ Production Ready
- Docker container integration
- Database persistence
- Health monitoring
- Auto-reconnection
- Comprehensive error handling

### ✅ Developer Experience
- CLI for quick testing
- VS Code tasks for IDE integration
- Comprehensive documentation
- Clear error messages

---

## 📝 Next Steps

### Option 1: Review Design
If you'd like to review or modify the design:
- Architecture changes?
- Different error handling approach?
- Additional components?
- Performance target adjustments?

### Option 2: Proceed to Tasks
If the design looks good, I'll create `tasks.md` with:
- Actionable coding tasks
- Implementation order
- Specific file changes
- Test requirements
- Property-based test specifications

### Option 3: Start Implementation
If you want to start coding immediately:
- I'll begin with the highest priority tasks
- Fix failing tests first
- Then add new database tools
- Then CLI integration
- Then VS Code tasks

---

## 🎯 Design Approval Checklist

- [ ] Architecture is clear and scalable
- [ ] All 12 correctness properties are well-defined
- [ ] Error handling strategy is robust
- [ ] Performance targets are achievable
- [ ] Security considerations are addressed
- [ ] Testing strategy is comprehensive
- [ ] Docker integration is complete
- [ ] CLI and VS Code integration is designed
- [ ] Ready to proceed to implementation

---

**What would you like to do next?**

1. ✅ **Approve design** → I'll create tasks.md
2. 🔄 **Request changes** → Tell me what to modify
3. 🚀 **Start coding** → I'll begin implementation immediately
