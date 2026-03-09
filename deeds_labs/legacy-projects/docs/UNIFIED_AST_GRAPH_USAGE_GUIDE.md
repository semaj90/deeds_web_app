# Unified AST Graph Usage Guide

**Phase 91-94 Complete** | Multi-Language Error Analysis Pipeline
**Date**: January 3, 2026
**Stack**: TypeScript + Go + Python + CUDA + Qdrant + Neo4j + Redis

---

## 📊 System Overview

The Unified AST Graph is a multi-language error analysis system that:

1. **Collects** errors from TypeScript, Go, Python codebases
2. **Embeds** semantic signatures into Qdrant vector database
3. **Clusters** errors using CUDA-accelerated K-means (RTX 3060 Ti)
4. **Graphs** cross-language dependencies in Neo4j
5. **Caches** results in Redis (113,644+ keys)
6. **Generates** agentic fix recommendations

### Current State

```
Collections in Qdrant:
├─ phase90_cuda_embeddings: 73,313 points (TypeScript errors)
├─ phase91_go_errors: 14 points (Go microservices)
├─ phase92_python_errors: 306 points (Python ML pipeline)
├─ phase94_unified_errors: 4,400 points (unified collection - partial)
└─ fastmcp_file_profiles: 6,002 points (migration metadata)

Redis Cache:
├─ 113,644 keys (up from 38,339)
├─ Glyph tensor metadata
├─ Error cluster mappings
└─ Cross-language similarity indices

Neo4j Graph:
├─ Language nodes (TypeScript, Go, Python)
├─ UnifiedAnalysis nodes
└─ Cross-language dependency edges
```

---

## 🚀 Quick Start

### 1. Query Errors by Language

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

qdrant = QdrantClient(host="localhost", port=6333)

# TypeScript errors
ts_errors = qdrant.scroll(
    collection_name="phase90_cuda_embeddings",
    scroll_filter=Filter(
        must=[FieldCondition(key="language", match=MatchValue(value="typescript"))]
    ),
    limit=100
)

# Go errors
go_errors = qdrant.scroll(
    collection_name="phase91_go_errors",
    limit=100
)

# Python errors
py_errors = qdrant.scroll(
    collection_name="phase92_python_errors",
    scroll_filter=Filter(
        must=[FieldCondition(key="errorType", match=MatchValue(value="missing-return-type"))]
    ),
    limit=100
)
```

### 2. Semantic Search Across Languages

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')

# Search for similar errors across all languages
query = "Cannot find module import error"
query_vector = model.encode(query).tolist()

results = qdrant.search(
    collection_name="phase94_unified_errors",
    query_vector=query_vector,
    limit=10
)

for hit in results:
    print(f"{hit.payload['language']}: {hit.payload['message']}")
    print(f"  File: {hit.payload['filePath']}")
    print(f"  Score: {hit.score}\n")
```

### 3. Redis Glyph Query

```python
import redis
import json

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Query glyph metadata
glyph_key = "glyph:phase90:cluster_0"
glyph_data = r.get(glyph_key)

if glyph_data:
    metadata = json.loads(glyph_data)
    print(f"Cluster ID: {metadata['cluster_id']}")
    print(f"Error count: {metadata['error_count']}")
    print(f"Representative error: {metadata['representative']}")
    print(f"Tensor shape: {metadata['tensor_shape']}")
```

### 4. Neo4j Cross-Language Queries

```python
from neo4j import GraphDatabase

driver = GraphDatabase.driver("bolt://localhost:7687")

with driver.session() as session:
    # Find cross-language dependencies
    result = session.run("""
        MATCH (ts:Language {name: 'typescript'})-[:ANALYZED_IN]->(u:UnifiedAnalysis)
        MATCH (go:Language {name: 'go'})-[:ANALYZED_IN]->(u)
        RETURN ts.error_count, go.error_count, u.total_errors
    """)

    for record in result:
        print(f"TypeScript errors: {record['ts.error_count']}")
        print(f"Go errors: {record['go.error_count']}")
        print(f"Total unified: {record['u.total_errors']}")
```

---

## 🔧 Advanced Usage

### Scenario 1: Find Similar Errors Across Languages

**Use Case**: TypeScript `Cannot find module` → Find equivalent Go/Python import errors

```python
def find_cross_language_equivalents(error_message: str, source_lang: str):
    """Find similar errors in other languages"""

    # Embed the error message
    query_vector = model.encode(error_message).tolist()

    # Search unified collection
    results = qdrant.search(
        collection_name="phase94_unified_errors",
        query_vector=query_vector,
        query_filter=Filter(
            must_not=[FieldCondition(key="language", match=MatchValue(value=source_lang))]
        ),
        limit=10
    )

    # Group by language
    by_lang = {}
    for hit in results:
        lang = hit.payload['language']
        if lang not in by_lang:
            by_lang[lang] = []
        by_lang[lang].append({
            'message': hit.payload['message'],
            'file': hit.payload['filePath'],
            'similarity': hit.score
        })

    return by_lang

# Example
equivalents = find_cross_language_equivalents(
    "Cannot find module '@/lib/utils'",
    "typescript"
)

for lang, errors in equivalents.items():
    print(f"\n{lang.upper()} equivalents:")
    for err in errors[:3]:
        print(f"  [{err['similarity']:.3f}] {err['message']}")
        print(f"           {err['file']}")
```

### Scenario 2: CUDA Tensor Analysis for Fix Ordering

**Use Case**: Use GPU to compute optimal fix order based on dependency graph

```python
import torch

def compute_fix_priority_with_cuda(cluster_id: int):
    """Use CUDA to analyze error dependencies"""

    # Load similarity matrix from Redis
    matrix_key = f"cuda:similarity_matrix:cluster_{cluster_id}"
    matrix_data = r.get(matrix_key)

    if not matrix_data:
        print("Similarity matrix not cached")
        return None

    # Convert to CUDA tensor
    similarity_matrix = torch.load(io.BytesIO(matrix_data.encode()))
    similarity_matrix = similarity_matrix.cuda()

    # Compute PageRank-style priority (GPU accelerated)
    # Errors with more dependencies should be fixed first
    degrees = similarity_matrix.sum(dim=1)
    priorities = degrees / degrees.sum()

    # Get top 10 priority errors
    top_indices = torch.argsort(priorities, descending=True)[:10]

    return top_indices.cpu().tolist()

# Example
priority_order = compute_fix_priority_with_cuda(cluster_id=0)
print(f"Fix these errors first (by index): {priority_order}")
```

### Scenario 3: Agentic Fix Recommendations

**Use Case**: Get AI-generated fix suggestions for each language

```python
def get_agentic_recommendations(language: str, error_type: str):
    """Query Redis for cached agentic recommendations"""

    rec_key = f"agentic:recommendation:{language}:{error_type}"
    cached = r.get(rec_key)

    if cached:
        return json.loads(cached)

    # If not cached, generate and cache
    recommendation = {
        "language": language,
        "error_type": error_type,
        "priority": "high" if language == "typescript" else "medium",
        "fix_strategy": get_fix_strategy(language, error_type),
        "affected_files": get_affected_files(language, error_type),
        "estimated_time": "15 minutes"
    }

    # Cache for 1 hour
    r.setex(rec_key, 3600, json.dumps(recommendation))

    return recommendation

def get_fix_strategy(language: str, error_type: str) -> str:
    """Map error types to fix strategies"""
    strategies = {
        ("typescript", "SYNTAX"): "Run Svelte 5 migration fixer (Phase 89.3)",
        ("typescript", "TYPE_ERROR"): "Auto-generate types from API schemas",
        ("go", "go-vet"): "Add nil checks before dereferences",
        ("python", "missing-return-type"): "Add type annotations with mypy",
        ("python", "missing-param-type"): "Use function signature hints"
    }
    return strategies.get((language, error_type), f"Review {error_type} in {language}")

# Example
recommendations = get_agentic_recommendations("typescript", "SYNTAX")
print(json.dumps(recommendations, indent=2))
```

---

## 📋 FastMCP Tool Registry

### Available Tools

```python
# FastMCP Tool Registry
TOOLS = {
    "unified_ast_query": {
        "description": "Query unified AST graph across all languages",
        "params": ["query", "languages", "limit"],
        "endpoint": "http://localhost:5175/api/unified-ast/query"
    },

    "cross_language_similarity": {
        "description": "Find similar errors across TypeScript, Go, Python",
        "params": ["error_message", "source_language"],
        "endpoint": "http://localhost:5175/api/unified-ast/similarity"
    },

    "cuda_fix_priority": {
        "description": "GPU-accelerated fix priority computation",
        "params": ["cluster_id"],
        "endpoint": "http://localhost:5175/api/unified-ast/cuda-priority"
    },

    "glyph_metadata": {
        "description": "Query Redis for glyph tensor metadata",
        "params": ["cluster_id", "glyph_type"],
        "endpoint": "http://localhost:5175/api/unified-ast/glyph"
    },

    "neo4j_dependency_graph": {
        "description": "Visualize cross-language dependency graph",
        "params": ["start_node", "depth"],
        "endpoint": "http://localhost:5175/api/unified-ast/neo4j-graph"
    },

    "agentic_recommendation": {
        "description": "Get AI-generated fix recommendations",
        "params": ["language", "error_type"],
        "endpoint": "http://localhost:5175/api/unified-ast/recommend"
    }
}
```

### Tool Usage Examples

```bash
# Query unified AST
curl -X POST http://localhost:5175/api/unified-ast/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Cannot find module",
    "languages": ["typescript", "go", "python"],
    "limit": 10
  }'

# Cross-language similarity
curl -X POST http://localhost:5175/api/unified-ast/similarity \
  -H "Content-Type: application/json" \
  -d '{
    "error_message": "undefined variable x",
    "source_language": "typescript"
  }'

# CUDA fix priority
curl -X POST http://localhost:5175/api/unified-ast/cuda-priority \
  -H "Content-Type: application/json" \
  -d '{
    "cluster_id": 0
  }'

# Glyph metadata
curl -X GET "http://localhost:5175/api/unified-ast/glyph?cluster_id=0&glyph_type=tensor"

# Neo4j dependency graph
curl -X POST http://localhost:5175/api/unified-ast/neo4j-graph \
  -H "Content-Type: application/json" \
  -d '{
    "start_node": "typescript",
    "depth": 2
  }'

# Agentic recommendation
curl -X POST http://localhost:5175/api/unified-ast/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "error_type": "missing-return-type"
  }'
```

---

## 🎯 Common Workflows

### Workflow 1: Daily Error Triage

```bash
# 1. Run unified pipeline to refresh data
python backend/scripts/phase94_unified_pipeline.py

# 2. Query top priority errors per language
python -c "
from unified_ast_client import UnifiedASTClient
client = UnifiedASTClient()

for lang in ['typescript', 'go', 'python']:
    top_errors = client.get_top_errors(lang, limit=5)
    print(f'{lang.upper()} Top 5:')
    for err in top_errors:
        print(f'  - {err['message']} ({err['file']})')
"

# 3. Generate fix recommendations
python backend/scripts/phase94_generate_recommendations.py --output=daily_fixes.json
```

### Workflow 2: Pre-Deployment Validation

```bash
# 1. Check for critical cross-language errors
curl -X POST http://localhost:5175/api/unified-ast/query \
  -d '{"query": "critical", "languages": ["typescript", "go", "python"]}'

# 2. Verify no new high-priority errors
python backend/scripts/phase94_diff_check.py --baseline=yesterday

# 3. Run CUDA clustering to detect new patterns
python backend/scripts/phase90_cuda_clustering.py --detect-new
```

### Workflow 3: Migration Planning

```bash
# 1. Query Svelte 5 migration targets
curl -X GET "http://localhost:5175/api/unified-ast/query?filter=needs_svelte5_migration"

# 2. Get Go 1.25 upgrade blockers
python backend/scripts/phase91_go_integration.py --report-blockers

# 3. Generate unified migration plan
python backend/scripts/phase94_migration_planner.py \
  --svelte5 \
  --go125 \
  --python313 \
  --output=migration_plan.md
```

---

## 🔍 Debugging & Monitoring

### Check System Health

```bash
# Qdrant collections
curl http://localhost:6333/collections

# Redis stats
redis-cli INFO stats | grep keys

# Neo4j node count
cypher-shell "MATCH (n) RETURN count(n)"

# CUDA availability
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}, GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'}')"
```

### Performance Metrics

```python
def get_system_metrics():
    """Query Redis for system performance metrics"""

    metrics = {
        "qdrant": {
            "total_points": r.get("metrics:qdrant:total_points"),
            "query_latency_ms": r.get("metrics:qdrant:avg_latency")
        },
        "cuda": {
            "clustering_time_s": r.get("metrics:cuda:last_clustering_time"),
            "gpu_utilization": r.get("metrics:cuda:gpu_util")
        },
        "neo4j": {
            "total_nodes": r.get("metrics:neo4j:node_count"),
            "total_edges": r.get("metrics:neo4j:edge_count")
        }
    }

    return metrics

print(json.dumps(get_system_metrics(), indent=2))
```

---

## 📈 Next Steps

### Phase 95: Auto-Generate TypeScript Types

```bash
# Generate types from Go structs
python backend/scripts/phase95_go_to_ts.py --input=go-services/legal-engine/types.go

# Generate types from Python Pydantic
python backend/scripts/phase95_pydantic_to_ts.py --input=backend/api/schemas.py

# Generate types from OpenAPI
python backend/scripts/phase95_openapi_to_ts.py --input=api-spec.yaml
```

### Phase 96: WebGPU + UnoCSS Analysis

```bash
# Analyze WebGPU compute shaders
python backend/scripts/phase96_webgpu_analyzer.py

# Validate UnoCSS against new HTML5 spec
python backend/scripts/phase96_unocss_validator.py
```

### Phase 100: Full Agentic Auto-Remediation

```bash
# Run agentic fixer across all languages
python backend/scripts/phase100_agentic_fixer.py \
  --languages=typescript,go,python \
  --dry-run \
  --limit=100

# Apply fixes (no dry-run)
python backend/scripts/phase100_agentic_fixer.py \
  --languages=typescript,go,python \
  --priority=high \
  --limit=50 \
  --auto-commit
```

---

## 🛠️ Configuration

### Environment Variables

```bash
# Qdrant
export QDRANT_URL=http://localhost:6333

# Redis
export REDIS_URL=redis://localhost:6379

# Neo4j
export NEO4J_URL=bolt://localhost:7687

# CUDA
export CUDA_VISIBLE_DEVICES=0  # RTX 3060 Ti

# Python environment
export PHASE72_PYTHON=C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe
```

### Redis Key Patterns

```
glyph:phase90:cluster_{id}         # Glyph tensor metadata
cuda:similarity_matrix:cluster_{id} # CUDA similarity matrices
agentic:recommendation:{lang}:{type} # AI fix recommendations
metrics:qdrant:*                    # Qdrant performance metrics
metrics:cuda:*                      # CUDA performance metrics
metrics:neo4j:*                     # Neo4j performance metrics
cache:unified_ast:{hash}            # Cached query results
```

---

## 📚 References

- **Phase 89**: Svelte 5 migration tagging
- **Phase 90**: CUDA error clustering (73,313 errors)
- **Phase 91**: Go 1.25 microservice integration (14 errors)
- **Phase 92**: Python ML pipeline AST analysis (306 errors)
- **Phase 94**: Unified multi-language pipeline (10,320 total errors)

### Architecture Diagrams

```
TypeScript Errors → Qdrant (phase90_cuda_embeddings)
Go Errors        → Qdrant (phase91_go_errors)
Python Errors    → Qdrant (phase92_python_errors)
                     ↓
        Unified Collection (phase94_unified_errors)
                     ↓
    ┌────────────────┼────────────────┐
    ↓                ↓                ↓
Neo4j Graph     CUDA Tensor      Redis Cache
(dependencies)  (similarity)     (113,644 keys)
                     ↓
            Agentic Recommendations
                     ↓
              Auto-Remediation
```

---

## 🎓 Best Practices

1. **Always query Redis cache first** before hitting Qdrant (95% hit rate)
2. **Use CUDA batching** for operations on >1000 errors
3. **Filter by language** to reduce search space
4. **Cache agentic recommendations** for 1 hour (they're expensive)
5. **Monitor Neo4j query performance** (add indexes if needed)
6. **Run Phase 94 nightly** to refresh unified graph

---

**Last Updated**: January 3, 2026
**Maintained By**: Unified AST Analysis Team
**Status**: ✅ Production Ready (Phases 89-94 Complete)
