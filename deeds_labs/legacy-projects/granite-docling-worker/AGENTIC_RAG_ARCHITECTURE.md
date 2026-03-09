# Agentic RAG Architecture for Granite-Docling Worker

> **Purpose**: Multi-agent RAG system for intelligent document processing, error analysis, and code-to-fix feedback loops
> **Status**: Architecture Design (Ready for Implementation)
> **Date**: December 31, 2025

---

## 📋 Overview

The Agentic RAG system extends the Granite-Docling worker with intelligent document crawling, error analysis, and automated fix generation using a multi-agent architecture with LLM reasoning, knowledge graphs, and validation loops.

### Core Objectives

1. **Document Intelligence**: Crawl web documentation (Svelte, SvelteKit, Python, legal references)
2. **Error Analysis**: Parse code errors → Extract entities → Build knowledge graph
3. **Multi-Stage Retrieval**: BM25 keyword search + semantic search + re-ranking
4. **Fix Generation**: LLM-based code suggestions with retrieved documentation context
5. **Validation Loop**: Test execution → Feedback → Iteration
6. **Agentic Workflow**: Debug Agent, Guide Agent, Feedback Agent coordination

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AGENTIC RAG PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐            │
│  │  Document   │───▶│  Embedding   │───▶│  Clustering &   │            │
│  │  Crawler    │    │  Generation  │    │  Auto-Tagging   │            │
│  └─────────────┘    └──────────────┘    └─────────────────┘            │
│         │                   │                      │                     │
│         ▼                   ▼                      ▼                     │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐            │
│  │  MinIO      │    │  Qdrant      │    │  Knowledge      │            │
│  │  Storage    │    │  Vectors     │    │  Graph (Neo4j)  │            │
│  └─────────────┘    └──────────────┘    └─────────────────┘            │
│                                                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                        ERROR ANALYSIS PIPELINE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐            │
│  │  Code Error │───▶│  Entity      │───▶│  Knowledge      │            │
│  │  Parser     │    │  Extraction  │    │  Graph Linking  │            │
│  └─────────────┘    └──────────────┘    └─────────────────┘            │
│         │                   │                      │                     │
│         │                   ▼                      ▼                     │
│         │            ┌──────────────┐    ┌─────────────────┐            │
│         │            │  PostgreSQL  │    │  Redis Cache    │            │
│         │            │  Error DB    │    │  Query Cache    │            │
│         │            └──────────────┘    └─────────────────┘            │
│         │                                                                │
│         ▼                                                                │
│  ┌─────────────────────────────────────────────────────────┐            │
│  │          MULTI-STAGE RETRIEVAL ENGINE                    │            │
│  ├─────────────────────────────────────────────────────────┤            │
│  │  1. BM25 Keyword Search (top-50)                        │            │
│  │  2. Semantic Search (top-20, Qdrant)                    │            │
│  │  3. Re-ranking (score combination)                      │            │
│  │  4. Context Assembly (top-10 final)                     │            │
│  └─────────────────────────────────────────────────────────┘            │
│         │                                                                │
│         ▼                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                        AGENTIC WORKFLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐            │
│  │  Debug      │───▶│  Guide       │───▶│  Feedback       │            │
│  │  Agent      │    │  Agent       │    │  Agent          │            │
│  │ (Analyze)   │    │ (Generate)   │    │ (Validate)      │            │
│  └─────────────┘    └──────────────┘    └─────────────────┘            │
│         │                   │                      │                     │
│         │                   ▼                      │                     │
│         │            ┌──────────────┐              │                     │
│         │            │  LLM Router  │              │                     │
│         │            │ (Gemini/GPT) │              │                     │
│         │            └──────────────┘              │                     │
│         │                   │                      │                     │
│         │                   ▼                      ▼                     │
│         │            ┌──────────────┐    ┌─────────────────┐            │
│         └───────────▶│  Fix         │◀───│  Test Executor  │            │
│                      │  Generator   │    │  (pytest)       │            │
│                      └──────────────┘    └─────────────────┘            │
│                             │                                             │
│                             ▼                                             │
│                      ┌──────────────┐                                    │
│                      │  Code Writer │                                    │
│                      │  (git commit)│                                    │
│                      └──────────────┘                                    │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Component Design

### 1. Document Crawler (`src/agentic_rag/doc_crawler.py`)

**Purpose**: Crawl web documentation and legal references

**Features**:
- **robots.txt Compliance**: Respect crawl delays and disallowed paths
- **Sitemap Parsing**: Automatically discover documentation structure
- **Rate Limiting**: Configurable requests/second (default: 1 req/s)
- **Content Extraction**: Clean HTML → Markdown conversion
- **Deduplication**: SHA256 hash checking to avoid re-crawling
- **Priority Queuing**: Critical pages (API docs, migration guides) crawled first

**Configuration**:
```python
@dataclass
class CrawlerConfig:
    base_urls: List[str]  # ["https://svelte.dev/docs", "https://kit.svelte.dev/docs"]
    max_depth: int = 3
    rate_limit_rps: float = 1.0
    user_agent: str = "Granite-Docling-Crawler/1.0"
    respect_robots_txt: bool = True
    max_pages: int = 10000
    allowed_domains: List[str] = field(default_factory=list)
```

**Output**:
- Raw HTML stored in MinIO (`docs/raw/{domain}/{path}.html`)
- Cleaned Markdown in MinIO (`docs/markdown/{domain}/{path}.md`)
- Metadata in PostgreSQL (`crawled_documents` table)

**API**:
```python
class DocumentCrawler:
    async def crawl(self, base_url: str) -> CrawlResult
    async def crawl_batch(self, urls: List[str]) -> List[CrawlResult]
    async def get_sitemap(self, url: str) -> List[str]
    def set_priority(self, url: str, priority: int)
    def get_stats(self) -> CrawlStats
```

---

### 2. Embedding & Clustering (`src/agentic_rag/embedding_service.py`)

**Purpose**: Generate 768-dim embeddings and auto-cluster documents

**Features**:
- **Embedding Model**: EmbeddingGemma (ollama embeddinggemma:latest)
- **Batch Processing**: 32 documents per batch
- **GPU Acceleration**: CUDA-enabled embedding generation
- **Clustering**: K-Means (k=50) + DBSCAN for outlier detection
- **Auto-Tagging**: Cluster labels from representative keywords (TF-IDF)
- **Qdrant Upload**: Automatic vector indexing with payload metadata

**Configuration**:
```python
@dataclass
class EmbeddingConfig:
    model_name: str = "embeddinggemma:latest"
    embedding_dim: int = 768
    batch_size: int = 32
    k_means_clusters: int = 50
    dbscan_eps: float = 0.3
    dbscan_min_samples: int = 5
    qdrant_collection: str = "agentic_rag_docs"
```

**Pipeline**:
1. **Chunking**: Split documents into 512-token chunks (overlap: 64)
2. **Embedding**: Generate vectors via Ollama API
3. **Clustering**: K-Means on embeddings
4. **Tagging**: Extract cluster keywords (top-10 TF-IDF terms)
5. **Indexing**: Upload to Qdrant with metadata

**API**:
```python
class EmbeddingService:
    async def embed_text(self, text: str) -> np.ndarray
    async def embed_batch(self, texts: List[str]) -> np.ndarray
    async def cluster_embeddings(self, embeddings: np.ndarray) -> ClusterResult
    async def tag_cluster(self, cluster_id: int, documents: List[str]) -> List[str]
    async def index_to_qdrant(self, embeddings: np.ndarray, metadata: List[Dict])
```

---

### 3. Error Parser (`src/agentic_rag/error_parser.py`)

**Purpose**: Parse code errors and extract entities

**Supported Error Types**:
- **Python**: SyntaxError, NameError, AttributeError, ImportError, TypeError
- **TypeScript**: TSError (ts(2304), ts(2339), ts(2345), etc.)
- **Build Errors**: Webpack, Vite, SvelteKit build failures
- **Test Failures**: pytest, vitest output parsing

**Entity Extraction**:
- **Function Names**: `function calculateTotal()`, `def process_document()`
- **Class Names**: `class PageClassifier`, `class EnhancedPipelineManager`
- **Config Keys**: `DATABASE_URL`, `OLLAMA_URL`, `gpu_batch_size`
- **File Paths**: `src/processing/enhanced_pipeline_manager.py`
- **Error Codes**: `ts(2304)`, `E501`, `ENOENT`

**Example**:
```python
error_text = """
TypeError: Cannot read property 'confidence' of undefined
  at _process_gpu_page (enhanced_pipeline_manager.py:412)
  at _process_all_queues (enhanced_pipeline_manager.py:352)
"""

entities = error_parser.extract_entities(error_text)
# Output:
# {
#   "error_type": "TypeError",
#   "functions": ["_process_gpu_page", "_process_all_queues"],
#   "files": ["enhanced_pipeline_manager.py"],
#   "line_numbers": [412, 352],
#   "variables": ["confidence"]
# }
```

**API**:
```python
class ErrorParser:
    def parse_error(self, error_text: str) -> ParsedError
    def extract_entities(self, error_text: str) -> ErrorEntities
    def classify_error(self, error: ParsedError) -> ErrorCategory
    def suggest_query(self, error: ParsedError) -> str  # Generate RAG query
```

---

### 4. Multi-Stage Retrieval Engine (`src/agentic_rag/retrieval_engine.py`)

**Purpose**: Hybrid BM25 + semantic search with re-ranking

**Stages**:

1. **BM25 Keyword Search** (Fast, top-50)
   - Index documents in PostgreSQL with `tsvector`
   - Query: `SELECT * FROM documents WHERE to_tsvector(content) @@ to_tsquery('error & processing')`
   - Score: BM25 relevance score

2. **Semantic Search** (Qdrant, top-20)
   - Generate query embedding via EmbeddingGemma
   - Qdrant vector search with payload filtering
   - Score: Cosine similarity (0-1)

3. **Re-ranking** (Score combination)
   - Normalize BM25 and semantic scores to [0, 1]
   - Combined score: `0.4 * bm25_score + 0.6 * semantic_score`
   - Sort by combined score

4. **Context Assembly** (Top-10 final)
   - Retrieve full documents from MinIO
   - Add metadata (source URL, confidence, cluster tags)
   - Format for LLM consumption

**API**:
```python
class RetrievalEngine:
    async def retrieve_bm25(self, query: str, top_k: int = 50) -> List[Document]
    async def retrieve_semantic(self, query: str, top_k: int = 20) -> List[Document]
    async def rerank(self, bm25_results: List[Document], semantic_results: List[Document]) -> List[Document]
    async def assemble_context(self, documents: List[Document], max_tokens: int = 4096) -> str
```

**Example**:
```python
retrieval_engine = RetrievalEngine()

# User query: "How to fix TypeScript error ts(2304)?"
bm25_results = await retrieval_engine.retrieve_bm25("TypeScript ts(2304) cannot find name", top_k=50)
semantic_results = await retrieval_engine.retrieve_semantic("TypeScript ts(2304) cannot find name", top_k=20)
reranked = await retrieval_engine.rerank(bm25_results, semantic_results)
context = await retrieval_engine.assemble_context(reranked[:10], max_tokens=4096)

# Context now contains top-10 most relevant documentation snippets
```

---

### 5. Knowledge Graph Builder (`src/agentic_rag/knowledge_graph_builder.py`)

**Purpose**: Build entity relationship graph for code understanding

**Graph Schema** (Neo4j):

**Nodes**:
- `ErrorInstance`: Parsed error with metadata
- `Function`: Function/method definitions
- `Class`: Class definitions
- `File`: Source files
- `ConfigKey`: Environment/config variables
- `DocumentChunk`: Documentation snippets

**Relationships**:
- `(ErrorInstance)-[:OCCURS_IN]->(File)`
- `(ErrorInstance)-[:CALLS]->(Function)`
- `(Function)-[:DEFINED_IN]->(Class)`
- `(Function)-[:REFERENCES]->(ConfigKey)`
- `(DocumentChunk)-[:EXPLAINS]->(Function)`
- `(DocumentChunk)-[:FIXES]->(ErrorInstance)`

**Example Cypher Query**:
```cypher
// Find documentation that fixes similar errors
MATCH (e1:ErrorInstance {error_code: 'ts(2304)'})-[:SIMILAR_TO]->(e2:ErrorInstance)
MATCH (e2)<-[:FIXES]-(doc:DocumentChunk)
RETURN doc.content, doc.source_url, doc.confidence
ORDER BY doc.confidence DESC
LIMIT 5
```

**API**:
```python
class KnowledgeGraphBuilder:
    def add_error(self, error: ParsedError) -> str  # Returns node ID
    def add_function(self, name: str, file: str, line: int) -> str
    def link_error_to_function(self, error_id: str, function_id: str)
    def link_doc_to_error(self, doc_id: str, error_id: str, confidence: float)
    def find_similar_errors(self, error_id: str, limit: int = 10) -> List[ErrorInstance]
    def get_fixing_docs(self, error_id: str) -> List[DocumentChunk]
```

---

### 6. Fix Generator (`src/agentic_rag/fix_generator.py`)

**Purpose**: Generate code fixes using LLM with retrieved context

**LLM Integration**:
- **Primary**: Gemini 2.0 Flash (fast, grounded search enabled)
- **Fallback**: GPT-4 Turbo (higher reasoning capability)
- **Local**: Ollama gemma3-legal:latest (privacy-sensitive code)

**Prompt Engineering**:

```python
SYSTEM_PROMPT = """
You are an expert code debugger specializing in TypeScript, Python, and Svelte 5.
You have access to documentation from Svelte, SvelteKit, and Python standard library.

Given an error and relevant documentation, provide:
1. Root cause analysis
2. Step-by-step fix instructions
3. Complete code patch (diff format)
4. Test case to verify the fix

Be concise and focus on minimal changes that resolve the issue.
"""

USER_PROMPT_TEMPLATE = """
# Error Report
{error_text}

# Entities Extracted
{entities}

# Retrieved Documentation
{context}

# Current Code (if available)
{code_snippet}

# Task
Generate a fix for this error. Provide:
1. Root cause (1-2 sentences)
2. Fix instructions (numbered steps)
3. Code patch (unified diff format)
4. Test case (pytest or vitest format)
"""
```

**API**:
```python
class FixGenerator:
    async def generate_fix(self, error: ParsedError, context: str, code_snippet: str = "") -> Fix
    async def apply_fix(self, fix: Fix, file_path: str) -> bool
    async def validate_fix(self, fix: Fix) -> ValidationResult
```

**Output**:
```python
@dataclass
class Fix:
    error_id: str
    root_cause: str
    instructions: List[str]
    code_patch: str  # Unified diff format
    test_case: str
    confidence: float
    llm_provider: str
    thinking_process: Optional[str]  # For Gemini 3.0 thinking mode
```

---

### 7. Validator (`src/agentic_rag/validator.py`)

**Purpose**: Execute tests and provide feedback for fix iteration

**Validation Steps**:

1. **Syntax Check**: Parse code with AST to detect syntax errors
2. **Type Check**: Run `mypy` (Python) or `tsc` (TypeScript)
3. **Test Execution**: Run relevant tests with pytest/vitest
4. **Coverage Check**: Ensure fix doesn't reduce coverage
5. **Regression Check**: Run full test suite to detect side effects

**Feedback Loop**:

```python
validation_result = await validator.validate_fix(fix)

if validation_result.passed:
    await git_commit(fix)
    emit_event(ProcessingStage.COMPLETE, "Fix validated and committed")
else:
    # Provide feedback to Fix Generator for iteration
    feedback = validation_result.format_feedback()
    improved_fix = await fix_generator.generate_fix(
        error=error,
        context=context,
        code_snippet=code_snippet,
        previous_attempt=fix,
        feedback=feedback
    )
    # Retry validation
```

**API**:
```python
class Validator:
    async def validate_syntax(self, code: str, language: str) -> ValidationResult
    async def run_type_check(self, file_path: str) -> ValidationResult
    async def run_tests(self, test_files: List[str]) -> TestResult
    async def check_coverage(self, file_path: str) -> CoverageResult
    async def validate_fix(self, fix: Fix) -> ValidationResult
```

---

### 8. Agent Loop (`src/agentic_rag/agent_loop.py`)

**Purpose**: Coordinate Debug, Guide, and Feedback agents

**Agent Roles**:

1. **Debug Agent** (Analyzer)
   - Parse error from logs/test failures
   - Extract entities (functions, classes, config keys)
   - Query knowledge graph for similar errors
   - Retrieve relevant documentation

2. **Guide Agent** (Generator)
   - Receive error + context from Debug Agent
   - Generate fix using LLM
   - Provide root cause analysis and instructions
   - Create code patch and test case

3. **Feedback Agent** (Validator)
   - Apply fix to codebase
   - Run tests and type checks
   - Collect validation results
   - Provide feedback to Guide Agent for iteration

**Workflow**:

```python
class AgentLoop:
    def __init__(self):
        self.debug_agent = DebugAgent()
        self.guide_agent = GuideAgent()
        self.feedback_agent = FeedbackAgent()
        self.max_iterations = 3

    async def process_error(self, error_text: str) -> FixResult:
        # Phase 1: Debug Agent analyzes
        parsed_error = await self.debug_agent.parse(error_text)
        entities = await self.debug_agent.extract_entities(parsed_error)
        context = await self.debug_agent.retrieve_context(entities)

        # Phase 2: Guide Agent generates fix
        for iteration in range(self.max_iterations):
            fix = await self.guide_agent.generate_fix(
                error=parsed_error,
                context=context,
                previous_attempts=previous_attempts
            )

            # Phase 3: Feedback Agent validates
            validation = await self.feedback_agent.validate(fix)

            if validation.passed:
                await self.feedback_agent.commit(fix)
                return FixResult(success=True, fix=fix, iterations=iteration+1)
            else:
                # Provide feedback for next iteration
                feedback = validation.format_feedback()
                previous_attempts.append((fix, feedback))

        # Max iterations reached
        return FixResult(success=False, error="Max iterations exceeded", attempts=previous_attempts)
```

**API**:
```python
class AgentLoop:
    async def process_error(self, error_text: str) -> FixResult
    async def process_batch(self, error_texts: List[str]) -> List[FixResult]
    def get_metrics(self) -> AgentMetrics
    def reset_metrics(self)
```

---

## 🗄️ Database Schema

### PostgreSQL Tables

**1. `crawled_documents`**
```sql
CREATE TABLE crawled_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    title TEXT,
    content TEXT,
    content_hash TEXT NOT NULL,  -- SHA256 for deduplication
    crawled_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ,
    status TEXT,  -- 'pending', 'crawled', 'indexed', 'failed'
    metadata JSONB,
    tsvector_content TSVECTOR  -- For BM25 search
);

CREATE INDEX idx_crawled_documents_tsvector ON crawled_documents USING GIN(tsvector_content);
CREATE INDEX idx_crawled_documents_domain ON crawled_documents(domain);
CREATE INDEX idx_crawled_documents_hash ON crawled_documents(content_hash);
```

**2. `error_instances`**
```sql
CREATE TABLE error_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_text TEXT NOT NULL,
    error_type TEXT,  -- 'TypeError', 'ts(2304)', etc.
    file_path TEXT,
    line_number INT,
    function_name TEXT,
    entities JSONB,  -- Extracted entities
    stack_trace TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    fix_id UUID REFERENCES fixes(id)
);

CREATE INDEX idx_error_instances_type ON error_instances(error_type);
CREATE INDEX idx_error_instances_file ON error_instances(file_path);
CREATE INDEX idx_error_instances_resolved ON error_instances(resolved);
```

**3. `fixes`**
```sql
CREATE TABLE fixes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_id UUID REFERENCES error_instances(id),
    root_cause TEXT,
    instructions TEXT[],
    code_patch TEXT,  -- Unified diff
    test_case TEXT,
    confidence FLOAT,
    llm_provider TEXT,
    validated BOOLEAN DEFAULT FALSE,
    committed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**4. `validation_results`**
```sql
CREATE TABLE validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fix_id UUID REFERENCES fixes(id),
    syntax_check BOOLEAN,
    type_check BOOLEAN,
    tests_passed BOOLEAN,
    coverage_delta FLOAT,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Qdrant Collection

**Collection**: `agentic_rag_docs`

**Vector Config**:
- Size: 768 (EmbeddingGemma dimensions)
- Distance: Cosine
- On-disk storage: Enabled

**Payload Schema**:
```json
{
    "document_id": "uuid",
    "url": "https://svelte.dev/docs/runes",
    "title": "Svelte 5 Runes",
    "chunk_text": "...",
    "chunk_index": 0,
    "total_chunks": 12,
    "cluster_id": 5,
    "cluster_tags": ["svelte", "runes", "reactivity"],
    "domain": "svelte.dev",
    "crawled_at": "2025-12-31T10:00:00Z"
}
```

**Payload Indexes**:
- `domain` (keyword)
- `cluster_id` (integer)
- `cluster_tags` (keyword array)

---

## 🔄 Workflows

### Workflow 1: Initial Documentation Crawl

```bash
# 1. Start crawler
python -m src.agentic_rag.doc_crawler \
    --urls https://svelte.dev/docs https://kit.svelte.dev/docs \
    --max-depth 3 \
    --max-pages 5000

# 2. Generate embeddings and cluster
python -m src.agentic_rag.embedding_service \
    --batch-size 32 \
    --k-means-clusters 50

# 3. Index to Qdrant
python -m src.agentic_rag.embedding_service \
    --index-to-qdrant \
    --collection agentic_rag_docs

# 4. Build knowledge graph (optional)
python -m src.agentic_rag.knowledge_graph_builder \
    --neo4j-uri bolt://localhost:7687 \
    --import-docs
```

### Workflow 2: Error-to-Fix Loop

```python
# Automatic error processing
from src.agentic_rag.agent_loop import AgentLoop

agent_loop = AgentLoop()

# From pytest output
error_text = """
TypeError: Cannot read property 'confidence' of undefined
  at _process_gpu_page (enhanced_pipeline_manager.py:412)
"""

result = await agent_loop.process_error(error_text)

if result.success:
    print(f"✅ Fix committed in {result.iterations} iterations")
    print(f"Root cause: {result.fix.root_cause}")
    print(f"Patch:\n{result.fix.code_patch}")
else:
    print(f"❌ Failed after {len(result.attempts)} attempts")
    for fix, feedback in result.attempts:
        print(f"Attempt: {fix.instructions}")
        print(f"Feedback: {feedback}")
```

### Workflow 3: Batch Error Processing

```python
# Process multiple errors from Phase 78 error collection
from src.agentic_rag.agent_loop import AgentLoop

agent_loop = AgentLoop()

# Load errors from PostgreSQL
errors = await db.query("SELECT error_text FROM error_instances WHERE resolved = FALSE LIMIT 100")

results = await agent_loop.process_batch([e['error_text'] for e in errors])

# Report
successes = sum(1 for r in results if r.success)
print(f"✅ Fixed: {successes}/{len(results)}")
print(f"Average iterations: {sum(r.iterations for r in results if r.success) / successes}")
```

---

## 📊 Metrics & Monitoring

### Key Metrics

1. **Crawler Metrics**
   - Pages crawled/hour
   - Deduplication rate
   - Failed crawls (4xx/5xx errors)
   - Average page size

2. **Embedding Metrics**
   - Embeddings generated/second
   - GPU utilization
   - Clustering quality (silhouette score)
   - Qdrant upload latency

3. **Retrieval Metrics**
   - BM25 search latency (p50, p95, p99)
   - Semantic search latency
   - Re-ranking time
   - Cache hit rate (Redis)

4. **Agent Metrics**
   - Errors processed/hour
   - Fix success rate
   - Average iterations per fix
   - Validation pass rate
   - LLM token usage (cost tracking)

### Dashboard (Grafana)

**Panels**:
1. Crawler throughput (line graph)
2. Document count by domain (pie chart)
3. Cluster distribution (bar chart)
4. Retrieval latency heatmap
5. Fix success rate over time (line graph)
6. Agent iteration distribution (histogram)
7. LLM cost per day (line graph)

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1)

- [x] Task 10: Status Events (COMPLETE)
- [ ] Document Crawler implementation
- [ ] Embedding Service with K-Means clustering
- [ ] PostgreSQL schema creation
- [ ] Qdrant collection setup

### Phase 2: Retrieval (Week 2)

- [ ] BM25 indexing with tsvector
- [ ] Semantic search integration
- [ ] Re-ranking algorithm
- [ ] Redis caching layer
- [ ] Retrieval benchmarking

### Phase 3: Error Analysis (Week 3)

- [ ] Error Parser for Python/TypeScript
- [ ] Entity extraction NER
- [ ] Knowledge Graph builder (Neo4j)
- [ ] Error similarity detection

### Phase 4: Agentic Workflow (Week 4)

- [ ] Fix Generator with LLM integration
- [ ] Validator with pytest/vitest execution
- [ ] Debug Agent implementation
- [ ] Guide Agent implementation
- [ ] Feedback Agent implementation
- [ ] Agent Loop coordinator

### Phase 5: Production (Week 5)

- [ ] Dashboard integration
- [ ] Metrics collection
- [ ] Cost tracking (LLM API usage)
- [ ] Batch processing optimization
- [ ] Comprehensive testing (50+ test cases)

---

## 🔧 Configuration

### Environment Variables

```bash
# Document Crawler
CRAWLER_BASE_URLS="https://svelte.dev/docs,https://kit.svelte.dev/docs"
CRAWLER_MAX_DEPTH=3
CRAWLER_RATE_LIMIT_RPS=1.0
CRAWLER_USER_AGENT="Granite-Docling-Crawler/1.0"

# Embedding Service
EMBEDDING_MODEL="embeddinggemma:latest"
EMBEDDING_BATCH_SIZE=32
KMEANS_CLUSTERS=50
QDRANT_COLLECTION="agentic_rag_docs"

# LLM Configuration
LLM_PRIMARY_PROVIDER="gemini"
LLM_FALLBACK_PROVIDER="openai"
GEMINI_MODEL="gemini-2.0-flash-exp"
GEMINI_ENABLE_SEARCH=true
OPENAI_MODEL="gpt-4-turbo"

# Agent Configuration
AGENT_MAX_ITERATIONS=3
AGENT_PARALLEL_WORKERS=4
AGENT_TIMEOUT_SECONDS=300

# Database
POSTGRES_URL="postgresql://user:pass@localhost:5434/legal"
REDIS_URL="redis://localhost:6379"
QDRANT_URL="http://localhost:6333"
NEO4J_URI="bolt://localhost:7687"

# MinIO
MINIO_ENDPOINT="localhost:9000"
MINIO_BUCKET_DOCS="agentic-rag-docs"
MINIO_BUCKET_FIXES="agentic-rag-fixes"
```

---

## 📝 Example: End-to-End Error Fix

```python
# Complete example: Parse error → Retrieve docs → Generate fix → Validate → Commit

from src.agentic_rag.agent_loop import AgentLoop
from src.core.processing_events import get_event_emitter, ProcessingStage

# Initialize
agent_loop = AgentLoop()
event_emitter = get_event_emitter()

# Subscribe to events for monitoring
def log_event(event):
    print(f"[{event.stage.value}] {event.message}")

event_emitter.subscribe(ProcessingStage.ERROR, log_event)
event_emitter.subscribe(ProcessingStage.COMPLETE, log_event)

# Error from pytest
error_text = """
=================================== FAILURES ====================================
_______________ test_enhanced_pipeline_processes_document ______________

    def test_enhanced_pipeline_processes_document():
        manager = EnhancedPipelineManager()
        pages = [create_test_image() for _ in range(5)]

>       result = manager.process_document(pages, "test-doc-123")
E       TypeError: Cannot read property 'confidence' of undefined
E         at _process_gpu_page (enhanced_pipeline_manager.py:412)

enhanced_pipeline_manager.py:412: TypeError
"""

# Process with agent loop
result = await agent_loop.process_error(error_text)

if result.success:
    print(f"\n✅ SUCCESS: Fix applied in {result.iterations} iterations\n")
    print(f"Root Cause:\n{result.fix.root_cause}\n")
    print(f"Code Patch:\n{result.fix.code_patch}\n")
    print(f"Test Case:\n{result.fix.test_case}\n")

    # Verify fix
    import subprocess
    test_result = subprocess.run(["pytest", "tests/test_enhanced_pipeline.py", "-v"], capture_output=True)
    if test_result.returncode == 0:
        print("✅ Tests passing after fix!")
    else:
        print("⚠️ Tests still failing, manual review needed")
else:
    print(f"\n❌ FAILED: Could not fix error after {len(result.attempts)} attempts\n")
    for i, (fix, feedback) in enumerate(result.attempts):
        print(f"\nAttempt {i+1}:")
        print(f"Instructions: {fix.instructions}")
        print(f"Feedback: {feedback}")
```

**Expected Output**:

```
[error] Parsing error from pytest output
[classification] Extracted entities: {'functions': ['_process_gpu_page', 'process_document'], 'files': ['enhanced_pipeline_manager.py'], 'line_numbers': [412], 'error_type': 'TypeError'}
[gpu_processing] Generating embeddings for error query
[rag_indexing] Retrieved 8 relevant documentation chunks
[llm:generate] Generating fix with Gemini 2.0 Flash
[validation] Applying fix to enhanced_pipeline_manager.py
[validation] Running tests with pytest
[complete] Fix validated and committed

✅ SUCCESS: Fix applied in 1 iterations

Root Cause:
The _process_gpu_page method accesses priority_page.classification.confidence without checking if the classification object exists. This occurs when GPU processing fails early and returns None.

Code Patch:
--- a/src/processing/enhanced_pipeline_manager.py
+++ b/src/processing/enhanced_pipeline_manager.py
@@ -409,7 +409,10 @@ class EnhancedPipelineManager:

             if result:
                 result.metadata["classification"] = {
-                    "category": priority_page.classification.category,
+                    "category": priority_page.classification.category if priority_page.classification else "unknown",
-                    "confidence": priority_page.classification.confidence,
+                    "confidence": priority_page.classification.confidence if priority_page.classification else 0.0,
                     "route": "gpu",

Test Case:
def test_gpu_processing_handles_missing_classification():
    manager = EnhancedPipelineManager()
    page = create_test_image()
    priority_page = PriorityPage(priority=1.0, page_num=1, image=page, classification=None)

    result = manager._process_gpu_page(priority_page, "test-doc")

    assert result is not None
    assert result.metadata["classification"]["category"] == "unknown"
    assert result.metadata["classification"]["confidence"] == 0.0

✅ Tests passing after fix!
```

---

## 🎯 Success Criteria

1. **Crawling**: 10,000+ documentation pages indexed
2. **Clustering**: Silhouette score >0.5 for K-Means clusters
3. **Retrieval**: <200ms p95 latency for hybrid search
4. **Fix Success Rate**: >70% for common error types (TypeError, NameError, ImportError)
5. **Validation**: >90% test pass rate after fix application
6. **Cost**: <$5/day for LLM API usage (Gemini Flash is cheap)

---

## 📚 References

- **Svelte Documentation**: https://svelte.dev/docs
- **SvelteKit Documentation**: https://kit.svelte.dev/docs
- **EmbeddingGemma**: https://ollama.com/library/embeddinggemma
- **Qdrant**: https://qdrant.tech/documentation
- **Neo4j**: https://neo4j.com/docs
- **BM25 Algorithm**: https://en.wikipedia.org/wiki/Okapi_BM25

---

**Status**: Ready for implementation
**Next Step**: Implement Document Crawler (Phase 1, Week 1)
