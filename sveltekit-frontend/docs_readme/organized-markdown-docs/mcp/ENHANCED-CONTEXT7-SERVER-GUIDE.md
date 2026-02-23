# Enhanced Context7 MCP Server with AI Features

## 🚀 Overview

The Enhanced Context7 MCP Server is a comprehensive meta-data embedder and auto-encoder neural network system that provides:

- **Local Nomic Embeddings**: Uses `nomic-embed-text` via Ollama for 768-dimensional embeddings
- **Meta-Data Extraction**: Analyzes file structure, complexity, dependencies, and patterns
- **Auto-Encoder Neural Network**: Compresses embeddings from 768 to 256 dimensions for efficiency
- **Real-Time File Monitoring**: Automatically updates embeddings when files change
- **Intelligent Summarization**: Uses embedding similarity for context-aware content summarization
- **Enhanced Semantic Search**: Metadata-filtered search with compression and auto-updating

## 🏗️ Architecture Components

### 1. MetaDataEmbedder
Extracts comprehensive metadata from code files:

```javascript
const metadata = {
  filePath: "/path/to/file.ts",
  extension: ".ts",
  size: 5420,
  language: "typescript",
  complexity: 23,
  imports: ["svelte/store", "@types/node"],
  exports: [{ type: "function", name: "fetchData" }],
  functions: ["fetchData", "processResult"],
  classes: ["DataService"],
  hash: "a1b2c3d4e5f6"
}
```

**Supported Languages**: JavaScript, TypeScript, Svelte, Python, Go, Rust, Java, C#, SQL, Markdown, HTML, CSS, YAML

### 2. Auto-Encoder Neural Network
- **Input**: 768-dimensional nomic-embed-text embeddings
- **Compressed**: 256-dimensional representation (3x smaller)
- **Architecture**: Simple feed-forward network with ReLU activation
- **Training**: Placeholder for future backpropagation implementation

```javascript
const compressedEmbedding = await autoEncoder.encode(originalEmbedding);
// Original: [768 numbers] → Compressed: [256 numbers]
```

### 3. File Monitor System
Real-time monitoring with automatic embedding updates:

```javascript
// Watches for file changes
fileMonitor.watchDirectory("./src", ["**/*.ts", "**/*.svelte"]);

// Auto-processes: add, change, delete events
// Updates vector store automatically
```

### 4. Summarization Service
Intelligent content summarization using embedding centrality:

```javascript
const summary = await summarizationService.generateSummary(content, {
  maxSentences: 3,
  context: { domain: "legal", priority: "high" }
});
```

## 🛠️ Installation & Setup

### Prerequisites
1. **Ollama** with `nomic-embed-text` model:
   ```bash
   ollama pull nomic-embed-text
   ```

2. **PostgreSQL** with pgvector extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. **Node.js Dependencies**:
   ```bash
   npm install chokidar @modelcontextprotocol/sdk express body-parser
   ```

### Environment Variables
```bash
# Ollama Configuration
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3-legal                    # For chat/generation
OLLAMA_EMBED_MODEL=nomic-embed-text         # For embeddings

# Database Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/legal_ai_db
PGVECTOR_TABLE=documents

# File Monitoring
WATCH_FILES=true
CONTENT_DIR=./docs

# Optional: GPU-accelerated Go services
GO_SIMD_PARSER_URL=http://localhost:8080
GOLLAMA_URL=http://localhost:11435
```

## 📡 MCP Tools Available

### 1. `analyze-file-metadata`
Extract comprehensive metadata from any file:
```json
{
  "filePath": "/path/to/component.svelte",
  "content": "optional - will read file if not provided"
}
```

**Returns**: Detailed metadata including complexity, dependencies, structure

### 2. `semantic-search-enhanced`
Advanced semantic search with metadata filtering:
```json
{
  "query": "user authentication logic",
  "k": 5,
  "fileTypes": [".ts", ".js"],
  "minComplexity": 10,
  "maxComplexity": 50
}
```

**Returns**: Filtered results based on metadata + semantic similarity

### 3. `summarize-content`
Intelligent summarization using embedding centrality:
```json
{
  "content": "Long text to summarize...",
  "context": { "domain": "legal" },
  "maxSentences": 3
}
```

**Returns**: Context-aware summary preserving key information

### 4. `watch-directory`
Start real-time file monitoring:
```json
{
  "dirPath": "./src",
  "patterns": ["**/*.js", "**/*.ts", "**/*.svelte"]
}
```

**Effect**: Automatically updates embeddings when files change

### 5. `stop-watching`
Stop monitoring a directory:
```json
{
  "dirPath": "./src"
}
```

### 6. `compress-embedding`
Compress embeddings using auto-encoder:
```json
{
  "embedding": [/* 768 numbers */]
}
```

**Returns**: Compressed 256-dimensional representation

## 🔌 API Endpoints

### HTTP Server (Port 3000)

#### `POST /api/semantic-search`
Basic semantic search:
```json
{
  "query": "authentication middleware",
  "k": 4
}
```

#### `POST /api/index`
Index documents with metadata:
```json
{
  "documents": [
    {
      "title": "User Auth Service",
      "content": "Implementation details...",
      "metadata": {
        "caseId": "case-123",
        "tags": ["auth", "security"],
        "complexity": 25
      }
    }
  ]
}
```

#### `POST /api/summarize`
AI-powered summarization:
```json
{
  "text": "Long legal document...",
  "maxTokens": 256,
  "model": "gemma3-legal"
}
```

## 🎯 Usage Examples

### Basic File Analysis
```javascript
// Analyze a TypeScript file
const metadata = await analyzeFileMetadata({
  filePath: "./src/lib/auth.ts"
});

console.log(`Complexity: ${metadata.complexity}`);
console.log(`Functions: ${metadata.functions.join(', ')}`);
```

### Enhanced Search
```javascript
// Search for complex authentication code
const results = await semanticSearchEnhanced({
  query: "password hashing implementation",
  fileTypes: [".ts", ".js"],
  minComplexity: 15
});
```

### Auto-Monitoring Setup
```javascript
// Watch project files
await watchDirectory({
  dirPath: "./src",
  patterns: ["**/*.ts", "**/*.svelte", "**/*.js"]
});

// Files are automatically re-indexed on changes
```

### Intelligent Summarization
```javascript
// Summarize legal documents
const summary = await summarizeContent({
  content: legalDocument,
  context: { domain: "contract_law", priority: "clauses" },
  maxSentences: 5
});
```

## 🔧 Integration with Existing Stack

### SvelteKit Integration
```typescript
// src/lib/services/enhancedContext7.ts
import { dev } from '$app/environment';

class EnhancedContext7Service {
  private baseUrl = dev ? 'http://localhost:3000' : '/api';
  
  async analyzeComponent(componentPath: string) {
    const response = await fetch(`${this.baseUrl}/mcp-tools/analyze-file-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: componentPath })
    });
    return response.json();
  }
}
```

### Legal AI Integration
```typescript
// Analyze case files automatically
const caseFiles = await glob('./cases/**/*.md');
for (const file of caseFiles) {
  await indexDocument({
    title: path.basename(file),
    content: await fs.readFile(file, 'utf-8'),
    metadata: {
      caseId: extractCaseId(file),
      fileType: 'case_document',
      lastAnalyzed: new Date()
    }
  });
}
```

## 🎛️ Configuration Options

### Auto-Encoder Tuning
```javascript
// Adjust compression ratio
const autoEncoder = new AutoEncoderNN({
  inputSize: 768,        // nomic-embed-text dimensions
  hiddenSize: 128,       // More aggressive compression
  learningRate: 0.001,   // Training parameter
  epochs: 100           // Training iterations
});
```

### File Monitoring Patterns
```javascript
// Custom watch patterns
const patterns = [
  "**/*.{ts,js,svelte}",     // Code files
  "**/*.{md,txt}",           // Documentation
  "src/**/*.sql",            // Database schemas
  "!node_modules/**",        // Exclude dependencies
  "!.svelte-kit/**"         // Exclude build artifacts
];
```

### Complexity Calculation
```javascript
// Customize complexity keywords
const complexityKeywords = [
  'if', 'else', 'while', 'for', 'switch', 'case',
  'try', 'catch', '?', '&&', '||', 'async', 'await',
  'function', 'class', 'interface', 'type'
];
```

## 📊 Performance & Monitoring

### Embedding Compression Benefits
- **Storage**: 3x reduction (768 → 256 dimensions)
- **Transfer**: Faster API responses
- **Memory**: Lower RAM usage
- **Search**: Maintained semantic accuracy

### File Monitoring Performance
- **Debounced Updates**: Batched processing prevents spam
- **Selective Indexing**: Only processes relevant file types
- **Error Recovery**: Graceful handling of file system errors
- **Memory Efficient**: Uses streaming for large files

### Cache Management
```javascript
// Metadata cache for performance
fileMetaCache.set(fileHash, {
  metadata,
  contentEmbedding,
  compressedEmbedding,
  lastUpdated: Date.now()
});

// Summary cache for repeated requests
summaryCache.set(contentHash, summary);
```

## 🚨 Troubleshooting

### Common Issues

1. **Ollama Connection Failed**
   ```bash
   # Check Ollama status
   ollama list
   ollama serve
   ```

2. **PostgreSQL Vector Extension Missing**
   ```sql
   -- Install pgvector
   CREATE EXTENSION IF NOT EXISTS vector;
   
   -- Verify installation
   SELECT * FROM pg_extension WHERE extname = 'vector';
   ```

3. **File Watching Not Working**
   ```bash
   # Install chokidar
   npm install chokidar
   
   # Check environment variable
   export WATCH_FILES=true
   ```

4. **Embedding Dimensions Mismatch**
   ```javascript
   // Verify nomic-embed-text dimensions
   const testEmbedding = await embeddings.embedQuery("test");
   console.log(`Dimensions: ${testEmbedding.length}`); // Should be 768
   ```

### Debug Mode
```bash
# Enable debug logging
export DEBUG=custom-context7:*
export MCP_DEBUG=true

# Run server
node custom-context7-server.js
```

## 🔮 Future Enhancements

1. **Advanced Auto-Encoder**: Implement proper backpropagation training
2. **Semantic Clustering**: Group similar files automatically
3. **Code Graph Analysis**: Understand function call relationships
4. **Real-time Collaboration**: Multi-user embedding synchronization
5. **Plugin Architecture**: Custom metadata extractors
6. **Performance Analytics**: Detailed metrics dashboard

## 📚 References

- [Nomic Embed Documentation](https://docs.nomic.ai/atlas/models/embedding)
- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol/specification)
- [PGVector Extension](https://github.com/pgvector/pgvector)
- [Chokidar File Watching](https://github.com/paulmillr/chokidar)
- [LangChain Community](https://github.com/langchain-ai/langchainjs)

---

**Server Status**: Enhanced Context7 MCP Server v2.0.0 🚀
**Port**: 3000 (HTTP API) + stdio (MCP Protocol)
**Features**: Metadata embedding, auto-encoding, real-time monitoring, intelligent summarization