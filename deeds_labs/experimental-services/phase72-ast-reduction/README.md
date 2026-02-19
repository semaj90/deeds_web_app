# Phase 72: AST Error Reduction Pipeline

**Self-healing codebase agent that reduces 80k+ TypeScript errors to <1k**

This system implements a graph-based AI pipeline that automatically identifies, clusters, and fixes TypeScript/Svelte errors using Neo4j relationships, GPU-accelerated embeddings, and gemma3-legal AI patch generation.

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Error Source  │───▶│  Embedding Gen  │───▶│  Qdrant Vector │
│  (svelte-check) │    │  (Ollama)       │    │  DB Storage     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Neo4j Graph DB  │◀───│ GPU Clustering  │───▶│  Error Clusters │
│ Relationships   │    │  (CUDA/Python) │    │  + Patterns      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ AI Patch Gen    │───▶│  AST Repair     │───▶│  Validation     │
│ (gemma3-legal)  │    │  (ts-morph)     │    │  (svelte-check)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker Desktop with NVIDIA GPU support
- Node.js 18+
- Python 3.8+
- Ollama with `gemma3-legal:latest`
- 8GB+ GPU memory recommended

### One-Command Deployment
```bash
# Deploy entire Phase 72 stack
./deploy-phase72.ps1 -Action deploy

# Or using npm
npm run deploy
```

### Manual Setup
```bash
# 1. Start services
docker-compose -f docker-compose-phase72.yml up -d

# 2. Initialize Neo4j schema
docker exec ai-patch-service-phase72 npm run init

# 3. Run the pipeline
docker exec ai-patch-service-phase72 npm start

# 4. Monitor progress
docker exec ai-patch-service-phase72 npm run progress
```

## 📊 Dashboard

Access the error analysis dashboard at: **http://localhost:5174**

Features:
- Real-time error clustering visualization
- AI patch confidence scores
- Success rate tracking
- Neo4j graph exploration
- GPU utilization metrics

## 🔧 Components

### Core Services

#### 1. Neo4j Error Graph Service
- **Purpose**: Store error relationships and enable graph-based analysis
- **Features**:
  - Error node storage with metadata
  - Relationship creation (depends_on, similar_to, caused_by)
  - Graph pattern detection
  - Cluster management

#### 2. GPU Clustering Service
- **Purpose**: CUDA-accelerated error clustering
- **Features**:
  - K-means clustering on embeddings
  - Hierarchical clustering
  - Similarity matrix computation
  - Automatic optimal K detection

#### 3. AI Patch Generation Service
- **Purpose**: Generate TypeScript/Svelte fixes using gemma3-legal
- **Features**:
  - Context-aware patch generation
  - Confidence scoring
  - Multi-file patch support
  - Patch validation and refinement

#### 4. AST Error Reduction Pipeline
- **Purpose**: Orchestrate the complete self-healing workflow
- **Features**:
  - 6-phase pipeline execution
  - Progress tracking and reporting
  - Error threshold monitoring
  - Automatic stabilization detection

### Supporting Services

#### Error Analysis Dashboard
- Real-time monitoring interface
- Cluster visualization
- Patch success tracking
- System health metrics

#### Progress Monitor
- Continuous pipeline monitoring
- Performance metrics collection
- Automated reporting

## 🎯 Pipeline Phases

### Phase 1: Error Extraction & Embedding
- Run `svelte-check` to extract current errors
- Generate embeddings using Ollama
- Store in Qdrant for fast similarity search

### Phase 2: Error Relationship Graph
- Create error nodes in Neo4j
- Establish relationships based on file dependencies
- Build dependency graphs

### Phase 3: GPU Clustering
- Cluster similar errors using CUDA acceleration
- Generate cluster centroids and metadata
- Calculate silhouette scores

### Phase 4: AI Patch Generation
- Generate patches for each cluster using gemma3-legal
- Include context from related code
- Score patch confidence

### Phase 5: Patch Application & Validation
- Apply patches using ts-morph AST manipulation
- Validate with svelte-check
- Rollback failed patches

### Phase 6: Self-Healing Loop
- Repeat until error count stabilizes
- Track improvement metrics
- Generate progress reports

## 📈 Expected Results

- **Error Reduction**: 80k+ → <1k errors (95%+ reduction)
- **Processing Time**: 15-30 minutes per full cycle
- **GPU Utilization**: 70-90% during clustering phases
- **Success Rate**: 75-85% patch acceptance rate

## 🔍 Monitoring & Debugging

### Logs
```bash
# View all service logs
docker-compose -f docker-compose-phase72.yml logs -f

# View specific service logs
docker logs ai-patch-service-phase72
docker logs neo4j-phase72
```

### Health Checks
```bash
# Check all services
./deploy-phase72.ps1 -Action status

# Test individual components
./deploy-phase72.ps1 -Action test
```

### Progress Tracking
```bash
# View progress report
npm run progress

# Monitor in real-time
tail -f phase72-progress.json
```

## 🛠️ Configuration

### Environment Variables
```bash
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Ollama
OLLAMA_URL=http://localhost:11434

# Qdrant
QDRANT_URL=http://localhost:6333

# Redis
REDIS_URL=redis://localhost:6379

# Pipeline
PHASE72_MAX_ITERATIONS=10
PHASE72_MIN_IMPROVEMENT=0.05
```

### Advanced Configuration
- Adjust clustering parameters in `gpu-clustering.py`
- Modify AI prompts in `ai-patch-generation-service.ts`
- Customize Neo4j schema in `neo4j-error-graph-service.ts`

## 🚨 Troubleshooting

### Common Issues

#### CUDA Not Available
```
Error: CUDA not available, falling back to CPU
```
**Solution**: Install NVIDIA drivers and CUDA toolkit, or run without GPU clustering.

#### Neo4j Connection Failed
```
Error: Neo4j connection failed
```
**Solution**: Check Neo4j container is running and credentials are correct.

#### Ollama Model Not Found
```
Error: gemma3-legal model not found
```
**Solution**: Run `ollama pull gemma3-legal:latest`

#### Out of Memory
```
Error: CUDA out of memory
```
**Solution**: Reduce batch sizes in clustering configuration or use CPU fallback.

### Performance Tuning

#### GPU Memory Optimization
- Reduce embedding dimensions
- Use smaller batch sizes
- Enable gradient checkpointing

#### Neo4j Performance
- Add appropriate indexes
- Use query profiling
- Optimize relationship traversals

#### AI Generation Speed
- Use smaller models for testing
- Implement caching for similar prompts
- Batch patch generation requests

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all health checks pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Neo4j for graph database technology
- Ollama for local LLM inference
- NVIDIA for CUDA acceleration
- TypeScript/Svelte communities for AST tooling