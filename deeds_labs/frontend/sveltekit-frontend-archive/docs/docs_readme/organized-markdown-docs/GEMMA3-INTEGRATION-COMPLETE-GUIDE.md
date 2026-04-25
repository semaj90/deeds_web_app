# Gemma3 Legal AI Model Integration Guide

## Overview

This guide provides complete instructions for using your custom Unsloth-trained Gemma3 GGUF model with multiple deployment options:

1. **vLLM Server** (Recommended - Best Performance)
2. **Direct llama-cpp-python Server** (Fallback option)
3. **SvelteKit Integration** (Frontend integration)

## Quick Start

### 1. Run the Ultimate Setup Script

```bash
ULTIMATE-GEMMA3-SETUP.bat
```

This script will:

- Install all dependencies
- Check for your model file
- Let you choose your preferred approach
- Test the setup

### 2. Available Scripts

| Script                     | Purpose                         | Port |
| -------------------------- | ------------------------------- | ---- |
| `START-GEMMA3-VLLM.bat`    | Start vLLM server (recommended) | 8001 |
| `GEMMA3-DIRECT-LOADER.bat` | Start direct llama-cpp server   | 8000 |
| `TEST-GEMMA3-VLLM.bat`     | Test vLLM server                | -    |
| `test-gemma3-direct.py`    | Test direct server              | -    |

## Server Options

### Option 1: vLLM Server (Recommended)

**Best for:** Production use, high performance, GPU acceleration

```bash
START-GEMMA3-VLLM.bat
```

**Features:**

- Optimized GPU acceleration
- Better throughput and latency
- Advanced memory management
- Production-ready

**Requirements:**

- CUDA-compatible GPU (recommended)
- 8GB+ VRAM
- Python 3.8+

### Option 2: Direct llama-cpp-python Server

**Best for:** CPU-only systems, development, testing

```bash
GEMMA3-DIRECT-LOADER.bat
```

**Features:**

- CPU and GPU support
- Lower memory requirements
- Simpler setup
- Cross-platform compatibility

## API Endpoints

Both servers provide OpenAI-compatible endpoints:

### Chat Completions

```http
POST http://localhost:8001/v1/chat/completions
Content-Type: application/json

{
  "model": "gemma3-legal",
  "messages": [
    {
      "role": "system",
      "content": "You are a legal AI assistant."
    },
    {
      "role": "user",
      "content": "What are the key elements of a contract?"
    }
  ],
  "temperature": 0.1,
  "max_tokens": 1024
}
```

### Text Completions

```http
POST http://localhost:8001/v1/completions
Content-Type: application/json

{
  "model": "gemma3-legal",
  "prompt": "In legal terms, a contract is defined as",
  "temperature": 0.1,
  "max_tokens": 512
}
```

### Health Check

```http
GET http://localhost:8001/health
```

### Models List

```http
GET http://localhost:8001/v1/models
```

## SvelteKit Integration

### Import the Client

```typescript
import { gemma3Client, detectAvailableServer } from "$lib/gemma3Client";
```

### Basic Usage

```typescript
// Check server availability
const server = await detectAvailableServer();
if (server) {
  console.log(`Using ${server.backend} at ${server.url}`);
}

// Ask a legal question
const answer = await gemma3Client.askLegalQuestion(
  "What is the statute of limitations for breach of contract?",
  "California jurisdiction"
);

// Analyze a document
const analysis = await gemma3Client.analyzeDocument(documentText, "contract");

// Review a contract
const review = await gemma3Client.reviewContract(
  contractText,
  "liability clauses"
);
```

### Using the AI Service

```typescript
import { aiService } from "$lib/services/aiService";

// Check server health
const isHealthy = await aiService.checkServerHealth();

// Ask a legal question
const answer = await aiService.askLegalQuestion(
  "Explain the doctrine of consideration in contract law"
);

// Analyze a document
const analysis = await aiService.analyzeDocument(documentText, "general");

// Review a contract
const review = await aiService.reviewContract(
  contractText,
  "termination clauses"
);
```

## Configuration

### Model Path

Update the model path in the server files if needed:

**vLLM Server** (`direct-gemma3-vllm-server.py`):

```python
MODEL_PATH = r"C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mo16.gguf"
```

**Direct Server** (`direct-gemma3-loader.py`):

```python
MODEL_PATH = r"C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mo16.gguf"
```

### Server Settings

You can modify these settings in the server files:

```python
HOST = "0.0.0.0"          # Server host
PORT = 8001               # Server port (vLLM) or 8000 (direct)
MAX_TOKENS = 2048         # Maximum tokens per response
CONTEXT_LENGTH = 8192     # Context window size
```

### Frontend Configuration

Update the client configuration in `gemma3Client.ts`:

```typescript
const client = new Gemma3Client(
  "http://localhost:8001", // Server URL
  60000, // Timeout in ms
  "gemma3-legal" // Default model name
);
```

## Testing

### Automated Tests

Run comprehensive tests:

```bash
# Test vLLM server
TEST-GEMMA3-VLLM.bat

# Test direct server
python test-gemma3-direct.py
```

### Manual Testing

1. **Health Check:**

   ```bash
   curl http://localhost:8001/health
   ```

2. **Simple Question:**
   ```bash
   curl -X POST http://localhost:8001/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gemma3-legal",
       "messages": [{"role": "user", "content": "What is a contract?"}],
       "max_tokens": 256
     }'
   ```

## Troubleshooting

### Common Issues

1. **Model file not found:**

   - Verify the path: `C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mo16.gguf`
   - Update `MODEL_PATH` in server files if different

2. **Server won't start:**

   - Check if Python 3.8+ is installed
   - Install dependencies: `pip install vllm fastapi uvicorn`
   - Check port availability: `netstat -an | findstr :8001`

3. **Out of memory errors:**

   - Use direct server instead of vLLM
   - Reduce `CONTEXT_LENGTH` and `MAX_TOKENS`
   - Close other applications

4. **Slow responses:**

   - Use vLLM server for better performance
   - Check GPU availability
   - Reduce `max_tokens` in requests

5. **Connection refused:**
   - Ensure server is running
   - Check firewall settings
   - Verify correct port and host

### Performance Optimization

1. **GPU Acceleration:**

   - Use vLLM server
   - Install CUDA toolkit
   - Set `n_gpu_layers=-1` for full GPU usage

2. **Memory Management:**

   - Monitor system memory usage
   - Adjust `gpu_memory_utilization` in vLLM
   - Use model quantization if needed

3. **Response Quality:**
   - Use low temperature (0.05-0.1) for legal accuracy
   - Provide clear system prompts
   - Include relevant context

### Debug Mode

Enable debug logging in server files:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Legal AI Prompt Templates

### System Prompts

**General Legal Assistant:**

```
You are a specialized Legal AI Assistant with expertise in contract analysis, legal document review, case law research, and legal compliance. You provide accurate, professional legal information and analysis. Always maintain professional accuracy and cite relevant legal principles when applicable.
```

**Contract Review:**

```
You are a specialized Legal AI Assistant for contract review. Analyze the contract for key terms, potential risks, missing clauses, compliance issues, and provide recommendations for improvement.
```

**Document Analysis:**

```
You are a specialized Legal AI Assistant for document analysis. Analyze the provided legal document and provide insights on key terms, potential issues, recommendations, and legal compliance.
```

### Example Queries

1. **Contract Analysis:**

   - "Review this software licensing agreement for potential risks"
   - "What key clauses are missing from this employment contract?"
   - "Analyze the termination provisions in this service agreement"

2. **Legal Research:**

   - "What is the statute of limitations for breach of contract in New York?"
   - "Explain the doctrine of consideration in contract law"
   - "What are the requirements for a valid power of attorney?"

3. **Document Generation:**
   - "Generate a template for a non-disclosure agreement"
   - "Create a basic partnership agreement outline"
   - "Draft a client engagement letter for legal services"

## Integration with Existing Systems

### Docker Compose Integration

Add to your `docker-compose.yml`:

```yaml
services:
  gemma3-server:
    build:
      context: .
      dockerfile: Dockerfile.gemma3
    ports:
      - "8001:8001"
    volumes:
      - ./gemma3Q4_K_M:/models
    environment:
      - MODEL_PATH=/models/mo16.gguf
    depends_on:
      - postgres
      - redis
```

### Environment Variables

Set these environment variables:

```bash
GEMMA3_MODEL_PATH=C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mo16.gguf
GEMMA3_SERVER_URL=http://localhost:8001
GEMMA3_TIMEOUT=60000
```

### Load Balancing

For production, consider using multiple instances:

```yaml
services:
  gemma3-server-1:
    # ... server config
    ports:
      - "8001:8001"

  gemma3-server-2:
    # ... server config
    ports:
      - "8002:8001"

  nginx:
    image: nginx
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

## Monitoring and Logging

### Health Monitoring

```typescript
// Check server health periodically
setInterval(async () => {
  const isHealthy = await gemma3Client.healthCheck();
  if (!isHealthy) {
    console.error("Gemma3 server is down!");
    // Handle server failure
  }
}, 30000); // Check every 30 seconds
```

### Usage Logging

```typescript
// Log API usage
const response = await gemma3Client.createChatCompletion({
  messages: [...],
  // ... other options
});

console.log('Token usage:', response.usage);
console.log('Response time:', Date.now() - startTime);
```

## Production Deployment

### Security Considerations

1. **API Key Authentication:**

   ```python
   # Add to server
   API_KEY = os.getenv('GEMMA3_API_KEY')

   @app.middleware("http")
   async def validate_api_key(request: Request, call_next):
       if request.url.path.startswith('/v1/'):
           auth_header = request.headers.get('Authorization')
           if not auth_header or auth_header != f'Bearer {API_KEY}':
               return Response('Unauthorized', status_code=401)
       return await call_next(request)
   ```

2. **Rate Limiting:**

   ```python
   from slowapi import Limiter, _rate_limit_exceeded_handler
   from slowapi.util import get_remote_address

   limiter = Limiter(key_func=get_remote_address)
   app.state.limiter = limiter

   @app.post("/v1/chat/completions")
   @limiter.limit("10/minute")
   async def chat_completions(request: Request, ...):
       # ... endpoint logic
   ```

3. **HTTPS/TLS:**
   ```python
   # Use with reverse proxy (nginx, traefik)
   # or configure uvicorn with SSL
   uvicorn.run(
       app,
       host="0.0.0.0",
       port=8001,
       ssl_keyfile="/path/to/key.pem",
       ssl_certfile="/path/to/cert.pem"
   )
   ```

### Scaling Considerations

1. **Horizontal Scaling:**

   - Run multiple server instances
   - Use load balancer (nginx, HAProxy)
   - Consider container orchestration (Kubernetes)

2. **Resource Management:**

   - Monitor GPU/CPU usage
   - Set memory limits
   - Use resource quotas

3. **Caching:**
   - Cache frequent queries
   - Use Redis for session storage
   - Implement response caching

## Support and Maintenance

### Regular Maintenance

1. **Model Updates:**

   - Replace GGUF file with new versions
   - Test thoroughly before production
   - Keep backups of working models

2. **Dependency Updates:**

   ```bash
   pip install --upgrade vllm fastapi uvicorn
   ```

3. **Performance Monitoring:**
   - Monitor response times
   - Track token usage
   - Monitor system resources

### Backup and Recovery

1. **Model Backup:**

   ```bash
   # Backup model file
   copy "C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mo16.gguf" "backup\mo16.gguf.backup"
   ```

2. **Configuration Backup:**
   ```bash
   # Backup server configurations
   git add direct-gemma3-vllm-server.py direct-gemma3-loader.py
   git commit -m "Backup server configurations"
   ```

This integration provides a complete solution for using your custom Gemma3 legal AI model with your existing SvelteKit application. The system is designed to be robust, scalable, and production-ready while maintaining the specialized legal AI capabilities of your custom-trained model.
