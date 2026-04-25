# Gemma3 Model Integration Documentation

# Complete guide for loading Unsloth-trained GGUF model into Ollama

## Model Information

- **Model Name**: gemma3-legal
- **File**: mo16.gguf (3GB)
- **Parameters**: 11.8B
- **Format**: GGUF (Unsloth-trained)
- **Use Case**: Legal document analysis and contract review

## Current Status

✅ Model file exists at: C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mo16.gguf
✅ Docker containers running
✅ Ollama service active on port 11434
❌ Model not appearing in `ollama list`

## Issue Analysis

The Modelfile syntax needs correction for proper Gemma3 loading:

### Incorrect Modelfile:

```
FROM ./gemma3Q4_K_M/mo16.gguf
```

### Correct Modelfile for Gemma3:

```
FROM /tmp/gemma3.gguf

TEMPLATE """<start_of_turn>user
{{ .Prompt }}<end_of_turn>
<start_of_turn>model
{{ .Response }}"""

SYSTEM """You are a specialized Legal AI Assistant powered by Gemma 3."""

PARAMETER temperature 0.1
PARAMETER top_k 40
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
PARAMETER num_predict 1024
PARAMETER repeat_penalty 1.1
PARAMETER stop "<start_of_turn>"
PARAMETER stop "<end_of_turn>"
```

## Solution Steps

### 1. Copy Model to Container

```bash
docker cp "C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mo16.gguf" legal-ai-ollama:/tmp/gemma3.gguf
```

### 2. Create Correct Modelfile

```bash
 cp "Modelfile-gemma3-corrected" legal-ai-ollama:/tmp/Modelfile
```

### 3. Create Model in Ollama

```bash
 exec legal-ai-ollama ollama create gemma3-legal -f /tmp/Modelfile
```

### 4. Verify Model Loading

```bash
 exec legal-ai-ollama ollama list
 exec legal-ai-ollama ollama run gemma3-legal "Hello, I am a legal AI assistant."
```

## Expected Output

After successful loading, `ollama list` should show:

```
NAME                    ID              SIZE      MODIFIED
gemma3-legal:latest     abc123...       3.0 GB    X minutes ago
llama3.2:1b            def456...       1.3 GB    X hours ago
```

## API Testing

Test the loaded model:

```bash
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma3-legal:latest",
    "prompt": "What are key clauses in software licenses?",
    "stream": false
  }'
```

## Integration Points

- **Frontend**: SvelteKit components will use this model
- **Backend**: Phase 3 RAG system connects to Ollama API
- **Demo**: YoRHa assistant widget calls the model
- **API**: Both direct Ollama and enhanced endpoints available

## Troubleshooting

If model still doesn't appear:

1. Check container logs: `logs legal-ai-ollama`
2. Verify file permissions: exec legal-ai-ollama ls -la /tmp/`
3. Test simple model first: `ollama serve gemma*`
4. Restart Ollama service: restart legal-ai-ollama`

## Performance Notes

- First load may take 30-60 seconds
- Subsequent requests will be faster
- Model uses ~3GB RAM when loaded
- Recommended for legal document analysis tasks
