# RAG Application Test Suite

This directory contains comprehensive Playwright tests for the SvelteKit 2 + Svelte 5 RAG application with Ollama, PostgreSQL, pgvector, and Drizzle ORM.

## Test Categories

### 1. Ollama Integration Tests (`ollama-integration.spec.ts`)
- Service health checks
- Model listing and availability
- Chat interface functionality
- Streaming responses
- GPU acceleration status
- Embedding generation
- Concurrent request handling
- Token limit enforcement
- Model switching
- Error handling

### 2. RAG System Tests (`rag-system.spec.ts`)
- Document upload and indexing
- Semantic search functionality
- Augmented response generation
- Vector embeddings with pgvector
- Chat conversations with context
- Document update and re-indexing
- Large document chunking
- Metadata filtering
- Hybrid search (keyword + semantic)

### 3. PostgreSQL & pgvector Tests (`postgresql-pgvector.spec.ts`)
- Database connectivity
- pgvector extension verification
- Vector embedding storage and retrieval
- Cosine similarity search
- Dimension validation
- Batch operations
- Update and delete operations
- Index management (HNSW)
- Concurrent operations
- Storage efficiency

### 4. Drizzle ORM Tests (`drizzle-orm.spec.ts`)
- CRUD operations
- Transaction handling
- Complex queries with joins
- Pagination
- Migration status
- Filtering and sorting
- Bulk operations
- JSON field handling
- Database constraints
- Optimistic locking

### 5. RAG Pipeline Integration (`rag-pipeline-integration.spec.ts`)
- Complete end-to-end workflow
- Multi-document processing
- Semantic search verification
- Question answering with context
- Multi-turn conversations
- Dynamic document updates
- Large document handling
- UI integration
- Conversation export

### 6. GPU Acceleration Tests (`gpu-acceleration.spec.ts`)
- CUDA availability detection
- GPU device listing
- Ollama GPU configuration
- CPU vs GPU benchmarking
- Memory monitoring
- Out-of-memory handling
- Batch processing optimization
- Vector operation acceleration
- Temperature monitoring
- Setup validation

## Running Tests

### Prerequisites
1. Ensure PostgreSQL is running with pgvector extension
2. Ollama service should be running (`npm run ollama:start`)
3. Required models should be available (`gemma3-legal:latest`, `nomic-embed-text`)

### Commands

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:ollama      # Ollama integration tests
npm run test:rag        # RAG system tests
npm run test:db         # Database tests (PostgreSQL + Drizzle)
npm run test:pipeline   # Full pipeline integration
npm run test:gpu        # GPU acceleration tests

# Run tests with UI
npm run test:e2e:ui

# Debug tests
npm run test:e2e:debug

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# View test report
npm run test:report
```

## Configuration

Tests are configured in `playwright.config.ts`:
- Base URL: `http://localhost:5175`
- Dev server starts automatically
- Screenshots on failure
- Video recording on failure
- HTML reporter

## Writing New Tests

1. Create a new `.spec.ts` file in the `tests` directory
2. Import Playwright test utilities:
   ```typescript
   import { test, expect } from '@playwright/test';
   ```
3. Group related tests with `test.describe()`
4. Use `test.beforeEach()` for setup
5. Make API calls with `page.request`
6. Interact with UI using locators

## Best Practices

1. **Use data-testid attributes** for reliable element selection
2. **Clean up test data** in `afterAll` hooks
3. **Test both success and error cases**
4. **Use meaningful test descriptions**
5. **Keep tests independent** - each test should work in isolation
6. **Mock external dependencies** when appropriate
7. **Use appropriate timeouts** for long-running operations

## Troubleshooting

### Tests failing due to services not running
- Ensure PostgreSQL is running: `docker ps`
- Check Ollama status: `npm run ollama:health`
- Verify dev server: `npm run dev`

### GPU tests failing
- GPU tests will skip if no CUDA-capable GPU is available
- Check NVIDIA drivers are installed
- Verify CUDA toolkit installation

### Timeout errors
- Increase timeouts for slow operations
- Check if services are responding
- Review system resources

### Database connection errors
- Verify PostgreSQL credentials in `.env`
- Check pgvector extension is installed
- Ensure database migrations are run

## CI/CD Integration

For CI environments:
- Set `CI=true` environment variable
- Tests run with retries enabled
- Single worker to avoid resource conflicts
- Ensure all services are available

## Contributing

When adding new tests:
1. Follow existing patterns
2. Add appropriate test categories
3. Update this README
4. Ensure tests are idempotent
5. Add cleanup procedures