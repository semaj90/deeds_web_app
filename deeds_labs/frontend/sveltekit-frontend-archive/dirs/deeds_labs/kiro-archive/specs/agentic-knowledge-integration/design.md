# Agentic Knowledge Integration - Design Document

**Status:** Draft
**Date:** December 20, 2025
**Framework:** Phase 13 + Phase 76 + ACP Tool Registry

---

## Overview

This design integrates Phase 13's Agentic Tool Calling, Phase 76's Knowledge Search Engine, and the existing ACP Tool Registry into a unified, production-ready agentic system. The system provides 21+ tools across 7 categories with robust error handling, comprehensive testing, and seamless Docker container integration.

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend (5173)                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Unified Tool Registry (21+ tools)                             │  │
│  │ - Knowledge: search, index                                    │  │
│  │ - Code: analyze, search, ast                                  │  │
│  │ - LLM: generate, embed                                        │  │
│  │ - Web: crawl, search                                          │  │
│  │ - Agent: delegate, discover, broadcast                        │  │
│  │ - Fix: svelte5, suggest                                       │  │
│  │ - Database: db:query, cache:get/set, minio:upload/download   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬──────────────┬──────────────┐
        ▼            ▼            ▼              ▼              ▼
    ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐
    │ Qdrant │  │ Redis  │  │ Ollama │  │PostgreSQL│  │  MinIO   │
    │ :6333  │  │ :6379  │  │ :11434 │  │  :5432   │  │  :9000   │
    └────────┘  └────────┘  └────────┘  └──────────┘  └──────────┘
        │            │            │              │              │
        └────────────┴────────────┴──────────────┴──────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │   Docker Compose Stack    │
                    │   - legal_ai_db           │
                    │   - All services          │
                    └───────────────────────────┘
```

### Data Flow

```
User/Agent Request
    ↓
[Unified Tool Registry]
    ├─→ Route to correct tool implementation
    ├─→ Apply retry logic with exponential backoff
    └─→ Use circuit breaker for service protection
    ↓
[Tool Execution]
    ├─→ Knowledge tools → [Qdrant + Redis + Ollama]
    ├─→ Code tools → [ACE MCP + ts-morph]
    ├─→ LLM tools → [Ollama/Gemini/Claude]
    ├─→ Web tools → [External URLs + Gemini Search]
    ├─→ Agent tools → [A2A Protocol]
    ├─→ Fix tools → [ACE MCP + Knowledge Search]
    └─→ Database tools → [PostgreSQL + Redis + MinIO]
    ↓
[Result Processing]
    ├─→ Cache results in Redis
    ├─→ Log execution metrics
    └─→ Format response
    ↓
Response to User/Agent
```

### MCP Server Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              MCP Server (Port 3002)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Tool Registry Proxy                                  │   │
│  │ - Exposes all 21+ tools via MCP protocol            │   │
│  │ - Automatic fallback to direct implementation       │   │
│  │ - 5-second timeout with graceful degradation        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Endpoints:                                                  │
│  - GET  /tools        → List all tools                      │
│  - POST /function-call → Execute tool                       │
│  - GET  /health       → Health check                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### Unified Tool Registry

```typescript
// Core types
interface ACPTool {
  name: string;
  description: string;
  category: 'knowledge' | 'code' | 'llm' | 'web' | 'agent' | 'fix' | 'database';
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  examples: ToolExample[];
  handler: (args: unknown) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

// Registry API
class ACPToolRegistry {
  register(tool: ACPTool): void;
  execute(toolName: string, args: unknown): Promise<ToolResult>;
  list(): ACPTool[];
  byCategory(category: string): ACPTool[];
}
```

### Database Tools

```typescript
// PostgreSQL query tool
interface DbQueryArgs {
  query: string;
  params?: any[];
  timeout?: number;
}

interface DbQueryResult {
  rows: any[];
  rowCount: number;
  fields: string[];
}

// Redis cache tools
interface CacheGetArgs {
  key: string;
}

interface CacheSetArgs {
  key: string;
  value: any;
  ttl?: number; // seconds
}

// MinIO storage tools
interface MinioUploadArgs {
  bucket: string;
  key: string;
  data: Buffer | string;
  contentType?: string;
}

interface MinioDownloadArgs {
  bucket: string;
  key: string;
}
```

### CLI Interface

```typescript
// CLI command structure
interface CLICommand {
  name: string;
  description: string;
  args: CLIArg[];
  handler: (args: Record<string, any>) => Promise<void>;
}

interface CLIArg {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  default?: any;
}

// CLI usage
// $ npm run acp -- knowledge:search --query "Svelte 5 runes" --topK 5
// $ npm run acp -- db:query --query "SELECT * FROM cases LIMIT 10"
// $ npm run acp -- cache:get --key "search:svelte5:runes"
```

### VS Code Tasks

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "ACP: Knowledge Search",
      "type": "shell",
      "command": "npm run acp -- knowledge:search --query \"${input:searchQuery}\"",
      "problemMatcher": []
    },
    {
      "label": "ACP: Database Query",
      "type": "shell",
      "command": "npm run acp -- db:query --query \"${input:sqlQuery}\"",
      "problemMatcher": []
    },
    {
      "label": "ACP: Code Analysis",
      "type": "shell",
      "command": "npm run acp -- code:analyze --filePath \"${file}\"",
      "problemMatcher": []
    }
  ],
  "inputs": [
    {
      "id": "searchQuery",
      "type": "promptString",
      "description": "Enter search query"
    },
    {
      "id": "sqlQuery",
      "type": "promptString",
      "description": "Enter SQL query"
    }
  ]
}
```

---

## Data Models

### Tool Execution Context

```typescript
interface ExecutionContext {
  toolName: string;
  args: unknown;
  startTime: number;
  retryCount: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  cacheKey?: string;
}
```

### Error Tracking

```typescript
interface ToolError {
  toolName: string;
  error: Error;
  timestamp: number;
  retryAttempt: number;
  context: ExecutionContext;
}
```

### Performance Metrics

```typescript
interface ToolMetrics {
  toolName: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;
  p95Duration: number;
  p99Duration: number;
  cacheHitRate: number;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tool Registry Completeness
*For any* tool category, the registry SHALL contain at least one tool for that category.
**Validates: Requirements 1.1, 1.2**

### Property 2: Tool Execution Idempotency
*For any* tool execution with the same arguments, repeated calls SHALL return consistent results (when not time-dependent).
**Validates: Requirements 3.1, 3.2**

### Property 3: Error Recovery
*For any* tool execution that fails, the system SHALL retry up to 3 times with exponential backoff before returning an error.
**Validates: Requirements 4.1, 4.2**

### Property 4: Circuit Breaker Protection
*For any* service that fails 5 times in 60 seconds, the circuit breaker SHALL open and prevent further calls for 30 seconds.
**Validates: Requirements 4.5**

### Property 5: Cache Consistency
*For any* cached result, the cache key SHALL be deterministic based on tool name and arguments.
**Validates: Requirements 7.1, 7.2**

### Property 6: Database Query Safety
*For any* database query, the system SHALL use parameterized queries to prevent SQL injection.
**Validates: Requirements 8.1**

### Property 7: Redis TTL Enforcement
*For any* cached value, the TTL SHALL be enforced and the value SHALL expire after the specified duration.
**Validates: Requirements 8.3**

### Property 8: MinIO Upload Integrity
*For any* file upload, the system SHALL verify the upload succeeded by checking the object exists.
**Validates: Requirements 8.4**

### Property 9: CLI Argument Validation
*For any* CLI command, the system SHALL validate all required arguments before execution.
**Validates: Requirements 9.1, 9.2**

### Property 10: Container Health Monitoring
*For any* Docker container, the system SHALL check health status before routing requests.
**Validates: Requirements 10.1, 10.5**

### Property 11: MCP Fallback Behavior
*For any* MCP tool call that times out, the system SHALL fall back to direct implementation within 5 seconds.
**Validates: Requirements 5.3**

### Property 12: Test Mock Isolation
*For any* test execution, mocks SHALL be isolated and cleaned up after test completion.
**Validates: Requirements 2.2, 2.3**

---

## Error Handling

### Retry Strategy

```typescript
class RetryStrategy {
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 100
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Circuit Breaker

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly threshold: number = 5;
  private readonly timeout: number = 30000; // 30 seconds

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

### Error Categories

```typescript
enum ErrorCategory {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  INTERNAL = 'internal'
}

class ToolError extends Error {
  constructor(
    message: string,
    public category: ErrorCategory,
    public toolName: string,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'ToolError';
  }
}
```

---

## Testing Strategy

### Unit Testing

**Test each tool independently:**
- Mock all external service calls
- Test success paths
- Test error paths
- Test edge cases (empty inputs, invalid formats)
- Test timeout handling

**Example:**
```typescript
describe('db:query tool', () => {
  it('should execute parameterized query', async () => {
    const mockPool = createMockPool();
    const result = await dbQuery({
      query: 'SELECT * FROM cases WHERE id = $1',
      params: [123]
    });

    expect(result.rows).toHaveLength(1);
    expect(mockPool.query).toHaveBeenCalledWith(
      'SELECT * FROM cases WHERE id = $1',
      [123]
    );
  });
});
```

### Property-Based Testing

**Test universal properties across all tools:**
- Property 1: Tool registry completeness
- Property 2: Execution idempotency
- Property 3: Error recovery
- Property 4: Circuit breaker protection
- Property 5: Cache consistency
- Property 6: Database query safety
- Property 7: Redis TTL enforcement
- Property 8: MinIO upload integrity
- Property 9: CLI argument validation
- Property 10: Container health monitoring
- Property 11: MCP fallback behavior
- Property 12: Test mock isolation

**Example:**
```typescript
import fc from 'fast-check';

describe('Property 3: Error Recovery', () => {
  it('should retry failed operations up to 3 times', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(), // tool name
        fc.record({}), // args
        async (toolName, args) => {
          let attempts = 0;
          const mockTool = vi.fn(async () => {
            attempts++;
            if (attempts < 3) throw new Error('Simulated failure');
            return { success: true };
          });

          const result = await executeWithRetry(mockTool, 3);

          expect(attempts).toBe(3);
          expect(result.success).toBe(true);
        }
      )
    );
  });
});
```

### Integration Testing

**Test tool interactions:**
- Knowledge Search → Qdrant + Redis + Ollama
- Database tools → PostgreSQL + Redis
- Storage tools → MinIO
- Agent tools → A2A Protocol
- CLI → Tool Registry
- VS Code tasks → Tool Registry

### End-to-End Testing

**Test complete workflows:**
1. User searches knowledge base via CLI
2. Results are cached in Redis
3. Subsequent searches hit cache
4. LLM synthesis uses Ollama
5. Results are displayed in formatted output

---

## Performance Targets

### Latency

- **Tool execution**: < 500ms (without LLM)
- **LLM synthesis**: < 5s
- **Database query**: < 100ms
- **Cache operations**: < 10ms
- **MinIO upload/download**: < 200ms
- **MCP call overhead**: < 15ms

### Throughput

- **Concurrent tool executions**: 100+
- **Requests per second**: 50+
- **Database connections**: 20 pool size
- **Redis connections**: 10 pool size

### Caching

- **Query embeddings**: 24 hours
- **Search results**: 12 hours
- **Database query results**: 5 minutes
- **Web pages**: 7 days
- **LLM responses**: 1 hour

---

## Deployment Considerations

### Docker Container Integration

**Using `docker exec` and `docker run` for service interaction:**

```bash
# Check if containers are running
docker ps --filter "name=legal_ai" --format "{{.Names}}: {{.Status}}"

# Execute commands in running containers
docker exec legal_ai_postgres psql -U legal_ai_user -d legal_ai_db -c "SELECT version();"
docker exec legal_ai_redis redis-cli ping
docker exec legal_ai_qdrant curl -f http://localhost:6333/health
docker exec legal_ai_ollama curl -f http://localhost:11434/api/tags
docker exec legal_ai_minio mc admin info local

# Run one-off commands
docker run --rm --network legal_ai_network \
  postgres:17 psql -h legal_ai_postgres -U legal_ai_user -d legal_ai_db -c "SELECT COUNT(*) FROM cases;"

# Health check script
#!/bin/bash
CONTAINERS=("legal_ai_postgres" "legal_ai_redis" "legal_ai_qdrant" "legal_ai_ollama" "legal_ai_minio")

for container in "${CONTAINERS[@]}"; do
  if docker ps --filter "name=$container" --filter "status=running" | grep -q "$container"; then
    echo "✓ $container is running"
  else
    echo "✗ $container is not running"
    exit 1
  fi
done
```

**Container Connection Configuration:**

```typescript
// Detect if running inside Docker or on host
const isDocker = process.env.DOCKER_ENV === 'true';

const CONFIG = {
  postgres: {
    host: isDocker ? 'legal_ai_postgres' : 'localhost',
    port: 5432,
    database: 'legal_ai_db',
    user: process.env.DB_USER || 'legal_ai_user',
    password: process.env.DB_PASSWORD
  },
  redis: {
    host: isDocker ? 'legal_ai_redis' : 'localhost',
    port: 6379
  },
  qdrant: {
    url: isDocker ? 'http://legal_ai_qdrant:6333' : 'http://localhost:6333'
  },
  ollama: {
    url: isDocker ? 'http://legal_ai_ollama:11434' : 'http://localhost:11434'
  },
  minio: {
    endPoint: isDocker ? 'legal_ai_minio' : 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: process.env.MINIO_USER || 'minioadmin',
    secretKey: process.env.MINIO_PASSWORD || 'minioadmin'
  }
};
```

**Container Network Setup:**

```bash
# Create network if it doesn't exist
docker network create legal_ai_network 2>/dev/null || true

# Ensure all containers are on the same network
docker network connect legal_ai_network legal_ai_postgres 2>/dev/null || true
docker network connect legal_ai_network legal_ai_redis 2>/dev/null || true
docker network connect legal_ai_network legal_ai_qdrant 2>/dev/null || true
docker network connect legal_ai_network legal_ai_ollama 2>/dev/null || true
docker network connect legal_ai_network legal_ai_minio 2>/dev/null || true
```

### Environment Configuration

```bash
# Database
DATABASE_URL=postgresql://legal_ai_user:password@localhost:5432/legal_ai_db

# Cache
REDIS_URL=redis://localhost:6379

# Vector Search
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=phase76_knowledge_base

# LLM
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest

# Object Storage
MINIO_URL=http://localhost:9000
MINIO_USER=minioadmin
MINIO_PASSWORD=minioadmin

# MCP Servers
KNOWLEDGE_MCP_URL=http://localhost:3004
ACE_MCP_URL=http://localhost:3002
A2A_URL=http://localhost:3005

# API Keys (optional)
GEMINI_API_KEY=your_key_here
SEARCH_API_KEY=your_key_here
```

### Health Monitoring

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    postgres: ServiceHealth;
    redis: ServiceHealth;
    qdrant: ServiceHealth;
    ollama: ServiceHealth;
    minio: ServiceHealth;
  };
  timestamp: string;
}

interface ServiceHealth {
  status: 'up' | 'down';
  latency: number;
  lastCheck: string;
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = await checkAllServices();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

## Security Considerations

### SQL Injection Prevention

```typescript
// ✅ GOOD: Parameterized query
await pool.query('SELECT * FROM cases WHERE id = $1', [caseId]);

// ❌ BAD: String concatenation
await pool.query(`SELECT * FROM cases WHERE id = ${caseId}`);
```

### Redis Key Namespacing

```typescript
// Prevent key collisions
const cacheKey = `acp:${toolName}:${hash(args)}`;
```

### MinIO Access Control

```typescript
// Use pre-signed URLs for temporary access
const presignedUrl = await minioClient.presignedGetObject(
  bucket,
  key,
  24 * 60 * 60 // 24 hours
);
```

### Input Validation

```typescript
function validateToolArgs(tool: ACPTool, args: unknown): void {
  const validator = new Ajv();
  const valid = validator.validate(tool.inputSchema, args);

  if (!valid) {
    throw new ToolError(
      `Invalid arguments: ${validator.errorsText()}`,
      ErrorCategory.VALIDATION,
      tool.name,
      false
    );
  }
}
```

---

## CLI Implementation

### Command Structure

```typescript
// scripts/acp-cli.mjs
import { ACPToolRegistry } from '../src/lib/services/knowledge-search/ACPToolRegistry';
import { parseArgs } from 'node:util';
import chalk from 'chalk';

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      verbose: { type: 'boolean', short: 'v' }
    },
    allowPositionals: true
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    return;
  }

  const toolName = positionals[0];
  const args = parseToolArgs(positionals.slice(1));

  const registry = new ACPToolRegistry();
  const result = await registry.execute(toolName, args);

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printFormattedResult(result, values.verbose);
  }
}

function printFormattedResult(result: ToolResult, verbose: boolean) {
  if (result.success) {
    console.log(chalk.green('✓ Success'));
    console.log(chalk.gray(`Duration: ${result.duration}ms`));
    console.log();
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    console.log(chalk.red('✗ Error'));
    console.log(chalk.red(result.error));
  }
}

main().catch(console.error);
```

### Usage Examples

```bash
# Knowledge search
npm run acp -- knowledge:search --query "Svelte 5 runes" --topK 5

# Database query
npm run acp -- db:query --query "SELECT * FROM cases LIMIT 10"

# Cache operations
npm run acp -- cache:get --key "search:svelte5:runes"
npm run acp -- cache:set --key "test:key" --value "test value" --ttl 3600

# MinIO operations
npm run acp -- minio:upload --bucket "documents" --key "test.txt" --data "Hello World"
npm run acp -- minio:download --bucket "documents" --key "test.txt"

# Code analysis
npm run acp -- code:analyze --filePath "src/routes/+page.svelte"

# LLM generation
npm run acp -- llm:generate --prompt "Explain Svelte 5 runes" --provider ollama

# List all tools
npm run acp -- --help
```

---

## Summary

This design provides a comprehensive, production-ready agentic system that:

1. **Unifies 21+ tools** across 7 categories
2. **Fixes 83 failing tests** with proper mocking infrastructure
3. **Provides robust error handling** with retry logic and circuit breakers
4. **Integrates seamlessly** with Docker containers and legal_ai_db
5. **Offers CLI and VS Code integration** for developer productivity
6. **Maintains high performance** with caching and batching
7. **Ensures security** with parameterized queries and input validation
8. **Provides comprehensive testing** with unit, property-based, and integration tests

**Status:** Ready for Implementation
**Next Step:** Create tasks.md with actionable coding tasks
