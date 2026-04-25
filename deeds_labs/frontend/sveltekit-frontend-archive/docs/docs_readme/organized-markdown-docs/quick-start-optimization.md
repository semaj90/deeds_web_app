# 🚀 Quick Start: SIMD JSON Optimization System

## Step 1: Install Required Services

### Option A: Easy Setup (Recommended)
```bash
# 1. Install Docker Desktop (if not already installed)
# Download from: https://www.docker.com/products/docker-desktop

# 2. Start Qdrant + Redis services
.\start-optimization-services.bat

# 3. Install Ollama for embeddings
.\install-ollama.ps1
```

### Option B: Manual Setup
```bash
# Install Ollama
# Download from: https://ollama.ai/download
ollama pull nomic-embed-text

# Install Docker and run:
docker-compose -f docker-compose-optimization.yml up -d
```

## Step 2: Verify Services

Check that all services are running:

```bash
# Check ports
netstat -an | findstr "6333 6379 11434"

# Test APIs
curl http://localhost:11434/api/tags        # Ollama
curl http://localhost:6333/health           # Qdrant  
curl http://localhost:6379                  # Redis (may timeout, that's OK)
```

Expected output:
```
✅ Ollama running on port 11434
✅ Qdrant running on port 6333  
✅ Redis running on port 6379
```

## Step 3: Test SIMD JSON Optimization

1. **Start your SvelteKit dev server:**
```bash
cd sveltekit-frontend
npm run dev
```

2. **Open the optimization interface:**
```
http://localhost:5173/dev/copilot-optimizer
```

3. **Test the optimization pipeline:**
   - Click "Load Copilot Content"
   - Click "Optimize Index" 
   - Verify you see performance metrics
   - Try semantic search with "Svelte 5 runes"

## Step 4: API Testing

Test the embedding API directly:

```bash
# Test embedding generation
curl -X POST http://localhost:5173/api/embeddings/hybrid \
  -H "Content-Type: application/json" \
  -d '{"content": "Test SIMD optimization", "model": "nomic-embed-text"}'

# Test copilot optimization
curl -X POST http://localhost:5173/api/copilot/optimize \
  -H "Content-Type: application/json" \
  -d '{"action": "optimize_index", "content": "# Test Content\n## Patterns\n$props() usage"}'
```

## Troubleshooting

### Service Not Starting

**Ollama (Port 11434):**
```bash
# Check if running
.\ollama-manager.ps1 status

# Start manually
ollama serve

# Test embedding
.\ollama-manager.ps1 test
```

**Qdrant (Port 6333):**
```bash
# Check Docker container
docker ps | findstr qdrant

# Restart if needed
docker restart qdrant-optimization

# Check logs
docker logs qdrant-optimization
```

**Redis (Port 6379):**
```bash
# Check Docker container  
docker ps | findstr redis

# Test connection
docker exec redis-optimization redis-cli ping
```

### Performance Issues

**Slow Embedding Generation:**
- Ensure Ollama has `nomic-embed-text` model pulled
- Check system resources (CPU/Memory)
- Verify no antivirus blocking

**High Memory Usage:**
- Adjust cache settings in optimization config
- Use smaller batch sizes for processing
- Monitor with Task Manager

### API Errors

**"Embedding generation failed":**
1. Check Ollama is running: `ollama list`
2. Verify model exists: `ollama pull nomic-embed-text`
3. Test API directly: `curl http://localhost:11434/api/tags`

**"Vector storage failed":**
1. Check Qdrant health: `curl http://localhost:6333/health`
2. Verify collections exist: `curl http://localhost:6333/collections`
3. Restart Qdrant: `docker restart qdrant-optimization`

## Performance Benchmarks

Expected performance on modern hardware:

| Operation | Time | Throughput |
|-----------|------|------------|
| JSON Parsing (SIMD) | <10ms | 100MB/s |
| Embedding Generation | <100ms | 10 docs/s |
| Vector Search | <50ms | 1000 queries/s |
| Cache Hit | <1ms | 10000 ops/s |

## Configuration

### Optimization Settings

Edit the configuration in the dev interface:

- **Context7 Boost**: Enable pattern recognition (+20% relevance)
- **Semantic Clustering**: Use SOM for organization
- **Performance Optimization**: Enable compression (80% savings)
- **Min Relevance**: Threshold for search results (0.7)

### Environment Variables

```bash
# Optional: Configure endpoints
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
OLLAMA_URL=http://localhost:11434
```

## Next Steps

1. **Integrate with GitHub Copilot**: Use the optimized index in your IDE
2. **Scale up**: Add more embedding models for different use cases  
3. **Monitor**: Use the metrics dashboard for performance tracking
4. **Extend**: Add custom Context7 patterns for your domain

## Support

- **Documentation**: See `copilot.md` for detailed usage
- **API Reference**: Visit `/dev/copilot-optimizer` for interactive testing
- **Performance**: Check metrics at `/api/copilot/optimize?action=metrics`

Ready to optimize your Copilot context with SIMD JSON processing! 🚀