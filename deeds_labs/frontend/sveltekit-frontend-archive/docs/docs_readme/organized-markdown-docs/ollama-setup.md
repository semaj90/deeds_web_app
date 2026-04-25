# Local LLM Setup - gemma-legal.gguf & deeds-web.gguf

## Custom Local Models Configuration

Your local models are in:

- `./gemma3Q4_K_M/mo16.gguf`
- `./gemma3Q4_K_M/mohf16-Q4_K_M.gguf`
- `./local-models/gemma3Q4_K_M/mo16.gguf`

## Ollama Model Import

```bash
# Create custom models from your GGUF files
ollama create gemma-legal -f Modelfile-legal
ollama create deeds-web -f Modelfile-deeds

# Verify models
ollama list
```

## Modelfile-legal
FROM ./gemma3Q4_K_M/mohf16-Q4_K_M.gguf

TEMPLATE """{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

{{ .Response }}<|eot_id|>"""

PARAMETER stop "<|start_header_id|>"
PARAMETER stop "<|end_header_id|>"
PARAMETER stop "<|eot_id|>"
PARAMETER temperature 0.7
PARAMETER num_ctx 8192

SYSTEM """You are a specialized legal AI assistant for prosecutors and legal professionals. You provide accurate, evidence-based legal analysis focusing on case law, legal procedures, and document analysis."""
```

## Modelfile-deeds

FROM ./local-models/gemma3Q4_K_M/mo16.gguf

TEMPLATE """{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

{{ .Response }}<|eot_id|>"""

PARAMETER stop "<|start_header_id|>"
PARAMETER stop "<|end_header_id|>"
PARAMETER stop "<|eot_id|>"
PARAMETER temperature 0.6
PARAMETER num_ctx 4096

SYSTEM """You are an expert in property law, real estate transactions, and deed analysis. You help with document review, legal compliance, and real estate law questions."""

````

## Updated batch_embed.go Configuration

```go
// Update model references in batch_embed.go
func getOllamaEmbedding(text string, model string) ([]float32, error) {
    ollamaURL := "http://localhost:11434/api/embeddings"

    // Use custom models
    if model == "" {
        model = "gemma-legal" // Default to your custom legal model
    }

    reqBody := OllamaEmbedRequest{
        Model:  model,
        Prompt: text,
    }
    // ... rest of function
}
````
