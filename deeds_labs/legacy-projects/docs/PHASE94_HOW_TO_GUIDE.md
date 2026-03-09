# Phase 94: Unified AST Graph - How-To Guide
**Multi-Modal Context Error Analysis & Fixing**

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [System Architecture](#system-architecture)
4. [Step-by-Step Workflow](#step-by-step-workflow)
5. [VS Code Tasks](#vs-code-tasks)
6. [FastMCP Tools Reference](#fastmcp-tools-reference)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Usage](#advanced-usage)
9. [Best Practices](#best-practices)

---

## Quick Start

### 1. Verify System Health

```bash
# Check all systems are operational
python backend\scripts\phase94_fastmcp_registry.py --tool system_health_check

# Expected output:
# ✅ Qdrant: Connected (5 collections)
# ✅ Redis: Connected (113,644 keys)
# ✅ Neo4j: Connected (phase66-neo4j)
# ✅ CUDA: Available (RTX 3060 Ti)
```

### 2. Query Error Clusters

```bash
# Get Redis statistics
python backend\scripts\phase94_redis_glyph_query.py --stats

# List all clusters
python backend\scripts\phase94_redis_glyph_query.py --list
```

### 3. Analyze a File

```bash
# Use VS Code Task: "Phase 94: Analyze Error File"
# Or manually:
# 1. Read cluster report (docs\PHASE90_COMPREHENSIVE_CLUSTER_REPORT.md)
# 2. Select highest priority file
# 3. Run multi-modal analysis (see Section 4)
```

### 4. Apply Fixes

```bash
# Use VS Code Task: "Phase 94: Apply Fix (Dry-Run)"
# Or use batch script:
.\scripts\phase94-cluster0-batch-fix.ps1 -DryRun
```

---

## Prerequisites

### Required Services

1. **Qdrant Vector Database** (localhost:6333)
   ```bash
   docker ps | grep qdrant
   # Should show: phase66-qdrant
   ```

2. **Redis Cache** (localhost:6379)
   ```bash
   docker ps | grep redis
   # Should show: phase66-redis
   ```

3. **Neo4j Graph Database** (localhost:7687)
   ```bash
   docker ps | grep neo4j
   # Should show: phase66-neo4j
   ```

4. **CUDA GPU** (Optional but recommended)
   ```bash
   nvidia-smi
   # Should show: NVIDIA GeForce RTX 3060 Ti
   ```

### Required Python Packages

```bash
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install qdrant-client redis neo4j sentence-transformers torch
```

### Required Node Packages

```bash
cd sveltekit-frontend
npm install
```

---

## System Architecture

### Data Flow Diagram

```
┌─────────────────┐
│  TypeScript     │
│  Error Sources  │──┐
└─────────────────┘  │
                     │    ┌──────────────────┐
┌─────────────────┐  │    │  Phase 90 CUDA   │
│  Go Errors      │──┼───>│  Clustering      │
└─────────────────┘  │    │  (RTX 3060 Ti)   │
                     │    └────────┬─────────┘
┌─────────────────┐  │             │
│  Python Errors  │──┘             │
└─────────────────┘                │
                                   │ 768d embeddings
                                   ▼
                    ┌──────────────────────────┐
                    │  Qdrant Vector Search    │
                    │  - phase90_cuda_emb...   │
                    │  - phase91_go_errors     │
                    │  - phase92_python_err... │
                    │  - phase94_unified...    │
                    └────────┬─────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
        ┌───────────┐  ┌──────────┐  ┌─────────┐
        │  Redis    │  │  Neo4j   │  │ FastMCP │
        │  Cache    │  │  Graph   │  │  Tools  │
        │ (113K)    │  │  (DAG)   │  │  (9)    │
        └───────────┘  └──────────┘  └─────────┘
                │            │            │
                └────────────┼────────────┘
                             │
                             ▼
                ┌─────────────────────────┐
                │  Multi-Modal Context    │
                │  RAG + KAG + DAG + W3C  │
                └─────────────────────────┘
                             │
                             ▼
                ┌─────────────────────────┐
                │  AI Fix Recommendation  │
                │  (Agentic Tools)        │
                └─────────────────────────┘
```

### Collections Schema

#### Qdrant Collections:

1. **phase90_cuda_embeddings** (73,313 vectors)
   ```python
   {
     "file_path": "src/lib/webgpu/webgpu-init.ts",
     "error_message": "colon expected",
     "error_code": "TS0000",
     "line": 52,
     "cluster_id": 0,
     "embedding": [768-dim vector],
     "severity": "error"
   }
   ```

2. **phase91_go_errors** (14 vectors)
   ```python
   {
     "service": "legal-engine",
     "error_message": "undefined: fmt",
     "file_path": "go-services/legal-engine/main.go",
     "line": 25,
     "embedding": [768-dim vector]
   }
   ```

3. **phase92_python_errors** (306 vectors)
   ```python
   {
     "file_path": "backend/ml/tensor_ops.py",
     "error_type": "missing-return-type",
     "function_name": "compute_similarity",
     "line": 45,
     "embedding": [768-dim vector]
   }
   ```

---

## Step-by-Step Workflow

### Workflow 1: Analyze and Fix a Single File

#### Step 1: Identify Target File

```bash
# Read cluster report
code docs\PHASE90_COMPREHENSIVE_CLUSTER_REPORT.md

# Find highest priority cluster (Cluster 0)
# Select top file from cluster
```

#### Step 2: Multi-Modal Context Analysis

**2.1 Error Cluster Context (DAG)**
```bash
# Query cluster errors
python backend\scripts\phase94_fastmcp_registry.py \
  --tool unified_ast_query \
  --args '{"query": "colon expected", "languages": ["typescript"], "limit": 100}'
```

**2.2 W3C Specification Validation (RAG)**

Use VS Code Task: **"Phase 94: W3C Spec Validation"**

Or manually search:
```typescript
// For WebGPU errors, validate against:
// https://www.w3.org/TR/webgpu/

// For Web APIs, use Microsoft Docs search:
// python backend\scripts\phase94_fastmcp_registry.py --tool web_search
```

**2.3 Schema/Package Analysis (KAG)**
```bash
# Check package.json dependencies
cd sveltekit-frontend
npm ls gpu.js
npm ls @webgpu/types
npm ls lokijs

# Verify imports
npx tsc --noEmit --skipLibCheck
```

**2.4 Dependency Graph (Neo4j)**
```bash
# Query Neo4j for file dependencies
python backend\scripts\phase94_fastmcp_registry.py \
  --tool neo4j_dependency_graph \
  --args '{"start_node": "webgpu-init.ts", "depth": 2}'
```

**2.5 Agentic Recommendation**
```bash
# Get AI-generated fix strategy
python backend\scripts\phase94_fastmcp_registry.py \
  --tool agentic_recommendation \
  --args '{"language": "typescript", "error_type": "SYNTAX", "context": "webgpu-init.ts"}'
```

#### Step 3: Apply Fix (Dry-Run)

**Option A: Use VS Code Task**
- Open Command Palette (`Ctrl+Shift+P`)
- Run: **"Phase 94: Apply Fix (Dry-Run)"**

**Option B: Manual Fix**
```typescript
// Before (malformed object literal)
requiredLimits: {
  maxTextureDimension2D: 8192, maxStorageBufferBindingSize: 1 1 << 30,
  // ...
}

// After (proper syntax)
requiredLimits: {
  maxTextureDimension2D: 8192,
  maxStorageBufferBindingSize: 1 << 30,
  // ...
}
```

#### Step 4: Validate Fix

```bash
# TypeScript compilation check
cd sveltekit-frontend
npx svelte-check --threshold error

# Run tests
npx playwright test

# Verify no errors in VS Code LSP
# (Check Problems panel)
```

#### Step 5: Update Knowledge Graph

```bash
# Update Qdrant (remove fixed error vectors)
python backend\scripts\phase94_unified_pipeline.py --update-cluster 0

# Update Redis cache
python backend\scripts\phase94_redis_glyph_query.py \
  --cache-glyph 0 reports\cluster0-updated.json

# Update Neo4j
python backend\scripts\phase94_fastmcp_registry.py \
  --tool neo4j_dependency_graph \
  --args '{"mark_resolved": "webgpu-init.ts"}'
```

---

### Workflow 2: Batch Fix Multiple Files

#### Step 1: Run Batch Script

```bash
# Dry-run (preview only)
.\scripts\phase94-cluster0-batch-fix.ps1 -DryRun

# Verbose output
.\scripts\phase94-cluster0-batch-fix.ps1 -Verbose

# Filter specific files
.\scripts\phase94-cluster0-batch-fix.ps1 -FilePattern "*webgpu*"
```

#### Step 2: Review Recommendations

The batch script will display:
- File paths and error counts
- Multi-modal context analysis
- Fix recommendations
- Risk assessment

#### Step 3: Apply Fixes

```bash
# Option A: Use VS Code Task
# "Phase 94: Batch Fix Cluster 0"

# Option B: Manual application
# (Follow individual file workflow for each file)
```

---

### Workflow 3: Cross-Language Error Analysis

#### Step 1: Find Similar Errors Across Languages

```bash
# Find TypeScript errors that might exist in Go/Python
python backend\scripts\phase94_fastmcp_registry.py \
  --tool cross_language_similarity \
  --args '{
    "error_message": "missing return type",
    "source_language": "typescript",
    "target_languages": ["go", "python"]
  }'
```

#### Step 2: Analyze Results

```json
{
  "source": {
    "language": "typescript",
    "error": "missing return type",
    "count": 150
  },
  "matches": {
    "python": [
      {
        "file": "backend/ml/tensor_ops.py",
        "similarity": 0.95,
        "error_type": "missing-return-type"
      }
    ],
    "go": []
  }
}
```

#### Step 3: Apply Unified Fix Strategy

```bash
# Generate type definitions for all languages
# Use VS Code Task: "Phase 95: Generate Types"
```

---

## VS Code Tasks

### Available Tasks

Run tasks via:
1. Command Palette (`Ctrl+Shift+P`) → "Tasks: Run Task"
2. Or Terminal → "Run Task..."

#### 1. **Phase 94: System Health Check**
```json
{
  "label": "Phase 94: System Health Check",
  "type": "shell",
  "command": "python",
  "args": [
    "backend\\scripts\\phase94_fastmcp_registry.py",
    "--tool", "system_health_check"
  ],
  "group": "test"
}
```

#### 2. **Phase 94: Query Cluster Errors**
```json
{
  "label": "Phase 94: Query Cluster Errors",
  "type": "shell",
  "command": "python",
  "args": [
    "backend\\scripts\\phase94_redis_glyph_query.py",
    "--cluster", "${input:clusterId}"
  ],
  "group": "test"
}
```

#### 3. **Phase 94: Analyze Error File**
```json
{
  "label": "Phase 94: Analyze Error File",
  "type": "shell",
  "command": "python",
  "args": [
    "backend\\scripts\\phase94_fastmcp_registry.py",
    "--tool", "unified_ast_query",
    "--args", "{\"file_path\": \"${file}\"}"
  ],
  "group": "build"
}
```

#### 4. **Phase 94: Get AI Recommendation**
```json
{
  "label": "Phase 94: Get AI Recommendation",
  "type": "shell",
  "command": "python",
  "args": [
    "backend\\scripts\\phase94_fastmcp_registry.py",
    "--tool", "agentic_recommendation",
    "--args", "{\"language\": \"typescript\", \"error_type\": \"${input:errorType}\", \"context\": \"${fileBasename}\"}"
  ],
  "group": "build"
}
```

#### 5. **Phase 94: Apply Fix (Dry-Run)**
```json
{
  "label": "Phase 94: Apply Fix (Dry-Run)",
  "type": "shell",
  "command": "echo",
  "args": [
    "Use GitHub Copilot to apply recommended fixes",
    "Review changes in diff view before saving"
  ],
  "group": "build"
}
```

#### 6. **Phase 94: Validate Fix**
```json
{
  "label": "Phase 94: Validate Fix",
  "type": "shell",
  "command": "npx",
  "args": ["svelte-check", "--threshold", "error"],
  "options": {
    "cwd": "${workspaceFolder}/sveltekit-frontend"
  },
  "group": "test"
}
```

#### 7. **Phase 94: Batch Fix Cluster 0**
```json
{
  "label": "Phase 94: Batch Fix Cluster 0",
  "type": "shell",
  "command": ".\\scripts\\phase94-cluster0-batch-fix.ps1",
  "args": ["-DryRun", "-Verbose"],
  "group": "build"
}
```

#### 8. **Phase 94: Update Knowledge Graph**
```json
{
  "label": "Phase 94: Update Knowledge Graph",
  "type": "shell",
  "command": "python",
  "args": [
    "backend\\scripts\\phase94_unified_pipeline.py",
    "--update-cluster", "${input:clusterId}"
  ],
  "group": "build"
}
```

#### 9. **Phase 94: Redis Cache Stats**
```json
{
  "label": "Phase 94: Redis Cache Stats",
  "type": "shell",
  "command": "python",
  "args": [
    "backend\\scripts\\phase94_redis_glyph_query.py",
    "--stats"
  ],
  "group": "test"
}
```

#### 10. **Phase 94: Generate Analysis Report**
```json
{
  "label": "Phase 94: Generate Analysis Report",
  "type": "shell",
  "command": "powershell",
  "args": [
    "-Command",
    "echo 'Use GitHub Copilot to generate report based on analysis results'"
  ],
  "group": "build"
}
```

### Task Inputs

Add to `.vscode/tasks.json`:

```json
{
  "inputs": [
    {
      "id": "clusterId",
      "type": "promptString",
      "description": "Enter cluster ID (0-11)",
      "default": "0"
    },
    {
      "id": "errorType",
      "type": "pickString",
      "description": "Select error type",
      "options": [
        "SYNTAX",
        "TYPE",
        "NULL_CHECK",
        "IMPORT",
        "EXPORT"
      ],
      "default": "SYNTAX"
    }
  ]
}
```

---

## FastMCP Tools Reference

### Tool Categories

#### 1. Query Tools

**unified_ast_query**
```bash
# Search across all languages
python backend\scripts\phase94_fastmcp_registry.py \
  --tool unified_ast_query \
  --args '{
    "query": "colon expected",
    "languages": ["typescript", "go", "python"],
    "limit": 50
  }'
```

**Response:**
```json
{
  "results": [
    {
      "file_path": "src/lib/webgpu/webgpu-init.ts",
      "error_message": "colon expected",
      "cluster_id": 0,
      "similarity": 0.98,
      "language": "typescript"
    }
  ],
  "total": 2950
}
```

---

#### 2. Analysis Tools

**cross_language_similarity**
```bash
# Find equivalent errors in other languages
python backend\scripts\phase94_fastmcp_registry.py \
  --tool cross_language_similarity \
  --args '{
    "error_message": "Cannot find name",
    "source_language": "typescript",
    "target_languages": ["go", "python"]
  }'
```

---

#### 3. Optimization Tools (CUDA)

**cuda_fix_priority**
```bash
# GPU-accelerated fix ordering
python backend\scripts\phase94_fastmcp_registry.py \
  --tool cuda_fix_priority \
  --args '{
    "cluster_id": 0,
    "algorithm": "pagerank"
  }'
```

**Response:**
```json
{
  "ordered_indices": [42, 15, 8, 91, 33],
  "priorities": [0.95, 0.87, 0.82, 0.76, 0.71],
  "gpu_time_ms": 15.3
}
```

---

#### 4. Cache Tools

**glyph_metadata**
```bash
# Query cached tensor metadata
python backend\scripts\phase94_fastmcp_registry.py \
  --tool glyph_metadata \
  --args '{
    "cluster_id": 0,
    "glyph_type": "representative"
  }'
```

**redis_cache_stats**
```bash
# Performance monitoring
python backend\scripts\phase94_fastmcp_registry.py \
  --tool redis_cache_stats
```

---

#### 5. Visualization Tools

**neo4j_dependency_graph**
```bash
# Generate D3.js visualization
python backend\scripts\phase94_fastmcp_registry.py \
  --tool neo4j_dependency_graph \
  --args '{
    "start_node": "webgpu-init.ts",
    "depth": 3
  }'
```

---

#### 6. AI Tools

**agentic_recommendation**
```bash
# AI-generated fix strategy
python backend\scripts\phase94_fastmcp_registry.py \
  --tool agentic_recommendation \
  --args '{
    "language": "typescript",
    "error_type": "SYNTAX",
    "context": "webgpu-init.ts"
  }'
```

**Response:**
```json
{
  "strategy": "Pattern-based object literal repair",
  "confidence": 100,
  "breaking_changes": false,
  "fix_steps": [
    "Identify malformed object literals",
    "Split multi-property lines",
    "Remove duplicate values",
    "Validate against interface"
  ],
  "estimated_time": "< 1 minute",
  "risk_level": "low"
}
```

---

#### 7. Batch Tools

**batch_error_analysis**
```bash
# Process multiple errors efficiently
python backend\scripts\phase94_fastmcp_registry.py \
  --tool batch_error_analysis \
  --args '{
    "error_ids": [1, 5, 12, 18, 24],
    "analysis_type": "similarity_matrix"
  }'
```

---

#### 8. Monitoring Tools

**system_health_check**
```bash
# Check all components
python backend\scripts\phase94_fastmcp_registry.py \
  --tool system_health_check
```

**Response:**
```json
{
  "qdrant": {
    "status": "✅ Connected",
    "collections": 5,
    "total_vectors": 83693
  },
  "redis": {
    "status": "✅ Connected",
    "keys": 113644,
    "hit_rate": 100.0
  },
  "neo4j": {
    "status": "✅ Connected",
    "container": "phase66-neo4j"
  },
  "cuda": {
    "status": "✅ Available",
    "device": "NVIDIA GeForce RTX 3060 Ti"
  }
}
```

---

## Troubleshooting

### Issue 1: "Qdrant connection refused"

**Symptom:**
```
ConnectionError: Cannot connect to Qdrant at localhost:6333
```

**Solution:**
```bash
# Check if Qdrant is running
docker ps | grep qdrant

# If not running, start it
docker start phase66-qdrant

# Verify connection
curl http://localhost:6333/collections
```

---

### Issue 2: "Redis cache miss rate > 5%"

**Symptom:**
```
⚠️ Cache Hit Rate: 92.3% (below 95% threshold)
```

**Solution:**
```bash
# Warm up cache
python backend\scripts\phase94_redis_glyph_query.py --list

# Clear corrupted keys
docker exec phase66-redis redis-cli FLUSHDB
python backend\scripts\phase90_cuda_clustering.py --rebuild-cache
```

---

### Issue 3: "TypeScript LSP shows 'No errors' but cluster report has errors"

**Symptom:**
- LSP reports: "No errors found"
- Cluster report shows: 40 errors

**Root Cause:** LSP caching or incremental compilation

**Solution:**
```bash
# Clear LSP cache
rm -rf sveltekit-frontend/.svelte-kit
rm -rf sveltekit-frontend/node_modules/.cache

# Restart VS Code
# Or: Developer: Reload Window

# Use cluster-based detection as ground truth
python backend\scripts\phase94_fastmcp_registry.py \
  --tool unified_ast_query \
  --args '{"file_path": "src/lib/webgpu/webgpu-init.ts"}'
```

---

### Issue 4: "CUDA out of memory"

**Symptom:**
```
RuntimeError: CUDA out of memory. Tried to allocate 2.00 GiB
```

**Solution:**
```bash
# Reduce batch size
# Edit backend/scripts/phase90_cuda_clustering.py
# Change: batch_size = 1000
# To: batch_size = 100

# Or use CPU fallback
export CUDA_VISIBLE_DEVICES=""
python backend\scripts\phase90_cuda_clustering.py --cpu-only
```

---

### Issue 5: "Neo4j authentication failed"

**Symptom:**
```
AuthError: Invalid username or password
```

**Solution:**
```bash
# Check Neo4j credentials
docker exec phase66-neo4j cat /var/lib/neo4j/conf/neo4j.conf

# Reset password
docker exec phase66-neo4j cypher-shell -u neo4j -p password \
  "ALTER USER neo4j SET PASSWORD 'new_password'"

# Update .env file
# NEO4J_PASSWORD=new_password
```

---

## Advanced Usage

### Custom Error Clustering

```python
# backend/scripts/custom_clustering.py
from phase90_cuda_clustering import CUDAErrorClustering

# Initialize with custom parameters
clusterer = CUDAErrorClustering(
    n_clusters=20,  # Increase from default 12
    min_cluster_size=50,  # Filter small clusters
    use_gpu=True
)

# Run clustering
results = clusterer.fit_predict(error_embeddings)
```

---

### Custom FastMCP Tools

```python
# backend/scripts/custom_fastmcp_tool.py
from phase94_fastmcp_registry import FastMCPRegistry

registry = FastMCPRegistry()

# Register custom tool
@registry.register_tool(
    name="custom_analyzer",
    category="analysis",
    description="Custom error analysis logic"
)
def custom_analyzer(file_path: str, threshold: float = 0.8):
    # Your custom logic
    return {
        "file": file_path,
        "analysis": "...",
        "confidence": 0.95
    }
```

---

### Automated Fix Pipeline

```bash
# scripts/auto-fix-pipeline.ps1
param([int]$ClusterId = 0)

# 1. Analyze cluster
python backend\scripts\phase94_fastmcp_registry.py \
  --tool unified_ast_query \
  --args "{\"cluster_id\": $ClusterId}"

# 2. Get recommendations
python backend\scripts\phase94_fastmcp_registry.py \
  --tool agentic_recommendation \
  --args "{\"cluster_id\": $ClusterId}"

# 3. Apply fixes (requires manual review)
echo "Review recommendations and apply fixes manually"

# 4. Validate
npx svelte-check --threshold error

# 5. Update knowledge graph
python backend\scripts\phase94_unified_pipeline.py \
  --update-cluster $ClusterId
```

---

## Best Practices

### 1. Always Start with System Health Check

```bash
# Before any analysis
python backend\scripts\phase94_fastmcp_registry.py --tool system_health_check

# ✅ All systems must be operational
```

### 2. Use Dry-Run Before Applying Fixes

```bash
# Preview changes
.\scripts\phase94-cluster0-batch-fix.ps1 -DryRun

# Review output
# Validate against W3C specs
# Then apply manually with confidence
```

### 3. Validate Multi-Modal Context

For every fix, ensure:
- ✅ **RAG**: Validated against official documentation
- ✅ **KAG**: Package dependencies verified
- ✅ **DAG**: No circular dependencies introduced
- ✅ **W3C**: Standards compliance confirmed
- ✅ **Agentic**: AI recommendation reviewed

### 4. Keep Knowledge Graph in Sync

After each fix:
```bash
# Update Qdrant
python backend\scripts\phase94_unified_pipeline.py --update-cluster <id>

# Invalidate Redis cache
python backend\scripts\phase94_redis_glyph_query.py --cache-glyph <id> <file>

# Update Neo4j
# (handled automatically by unified pipeline)
```

### 5. Monitor Cache Performance

```bash
# Check Redis hit rate regularly
python backend\scripts\phase94_redis_glyph_query.py --stats

# Target: ≥ 95% hit rate
# If below, run cache warm-up
```

### 6. Document All Fixes

```bash
# Generate report after each cluster
# Use VS Code Task: "Phase 94: Generate Analysis Report"

# Commit reports to repository
git add reports/phase94-cluster*.md
git commit -m "Phase 94: Fixed Cluster X errors"
```

---

## Appendix

### Cluster Overview (Phase 90 Report)

| Cluster | Errors | Priority | Pattern |
|---------|--------|----------|---------|
| 0 | 2,950 | 1st | Syntax colon errors |
| 1 | 2,323 | 2nd | Possibly null |
| 2 | 5,266 | 4th | Identifier/property expected |
| 3 | 7,561 | 5th | Cannot find name |
| 4 | 9,896 | 12th | Type assignment errors |
| 5 | 8,593 | 6th | Module export errors |
| ... | ... | ... | ... |

### Useful Commands Cheat Sheet

```bash
# Quick health check
python backend\scripts\phase94_fastmcp_registry.py --tool system_health_check

# Redis stats
python backend\scripts\phase94_redis_glyph_query.py --stats

# List all tools
python backend\scripts\phase94_fastmcp_registry.py --list

# Validate TypeScript
npx svelte-check --threshold error

# Run tests
npx playwright test

# Check CUDA
nvidia-smi

# Docker services
docker ps | grep phase66
```

---

**Last Updated:** January 3, 2026
**Version:** 1.0
**Author:** Phase 94 Unified AST Graph Team
