# VLM Integration Guide: Gemma3-Vision + Contextual Chat

## Overview

This guide shows how to integrate Gemma3-Vision (VLM) with your contextual chat system for intelligent document analysis and image-aware responses.

## Architecture

```
Document Upload
    ↓
SvelteKit Frontend
    ├─ Extract image/PDF
    ├─ Convert to base64
    └─ Send to API
    ↓
Enhanced RAG Endpoint (/api/ai/enhanced-rag-vlm)
    ├─ Retrieve RAG context (Qdrant)
    ├─ Analyze image with Gemma3-Vision
    ├─ Extract entities & concepts
    ├─ Enrich context
    └─ Generate response with Gemma3-Legal
    ↓
Contextual Chat
    ├─ Display answer
    ├─ Show vision insights
    └─ Link to evidence
```

## Components

### 1. Ollama Service (`ollama-service.ts`)

Centralized endpoint management for all Ollama models:

```typescript
import { getOllamaEndpoint, embedText, generateText, analyzeImageWithVision } from '$lib/server/ollama-service';

// Get endpoint configuration
const endpoint = getOllamaEndpoint('gemma3-vision');

// Embed text for RAG
const embedding = await embedText('legal document text');

// Generate text with Gemma3-Legal
const answer = await generateText(prompt, systemPrompt);

// Analyze image with Gemma3-Vision
const analysis = await analyzeImageWithVision(base64Image, 'What are the key terms?');
```

### 2. VLM Document Analyzer (`vlm-document-analyzer.ts`)

Analyzes documents using Gemma3-Vision:

```typescript
import { analyzeDocumentImage, enrichChatWithVLMAnalysis } from '$lib/server/vlm-document-analyzer';

// Analyze single document
const result = await analyzeDocumentImage({
  imageBase64: base64Data,
  documentType: 'contract',
  context: 'Analyze for liability clauses',
});

// Result includes:
// - summary: AI-generated summary
// - keyEntities: extracted entities
// - legalConcepts: identified legal concepts
// - visionAnalysis: full VLM response
// - embedding: vector for RAG
// - confidence: analysis confidence score

// Enrich chat with VLM
const enriched = await enrichChatWithVLMAnalysis({
  query: 'What are the obligations?',
  ragResults: [...],
  imageData: base64Image,
});
```

### 3. Enhanced RAG Endpoint (`enhanced-rag-vlm/+server.ts`)

Combines RAG + VLM for document-aware responses:

```typescript
// POST /api/ai/enhanced-rag-vlm
const response = await fetch('/api/ai/enhanced-rag-vlm', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    query: 'What are the key terms?',
    ragResults: [
      {
        text: 'contract text...',
        evidence_id: 'EV-001',
        chunk_id: 'ev-001-c1',
        score: 0.92,
      },
    ],
    imageData: base64EncodedImage,
    documentType: 'contract',
    caseId: 'case-123',
  }),
});

// Response includes:
// - answer: AI-generated response
// - sources: cited evidence
// - visionInsights: VLM analysis highlights
// - confidence: response confidence
// - latencyMs: processing time
```

## Integration with Contextual Chat

### Step 1: Update Chat Component

```svelte
<!-- src/lib/components/YoRHaChat.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let messages: Array<{ role: 'user' | 'assistant'; content: string; visionInsights?: string[] }> = [];
  let selectedImage: File | null = null;
  let imagePreview: string = '';

  async function sendMessage() {
    if (!input.trim() && !selectedImage) return;

    loading = true;
    const userMessage = input;
    input = '';

    try {
      // Convert image to base64 if provided
      let imageData: string | undefined;
      if (selectedImage) {
        imageData = await fileToBase64(selectedImage);
        selectedImage = null;
        imagePreview = '';
      }

      // Call enhanced RAG endpoint
      const response = await fetch('/api/ai/enhanced-rag-vlm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: userMessage,
          ragResults: [], // Get from your RAG service
          imageData,
          documentType: 'evidence',
          caseId: currentCaseId,
        }),
      });

      if (!response.ok) throw new Error('Chat failed');

      const data = await response.json();
      messages = [
        ...messages,
        {
          role: 'assistant',
          content: data.answer,
          visionInsights: data.visionInsights,
        },
      ];
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      loading = false;
    }
  }

  function handleImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      selectedImage = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
</script>

<div class="chat-container">
  <div class="messages">
    {#each messages as msg}
      <div class="message {msg.role}">
        {msg.content}
        {#if msg.visionInsights}
          <div class="vision-insights">
            <strong>📸 Vision Analysis:</strong>
            <ul>
              {#each msg.visionInsights as insight}
                <li>{insight}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if imagePreview}
    <div class="image-preview">
      <img src={imagePreview} alt="Selected document" />
      <button on:click={() => (imagePreview = '')}>✕</button>
    </div>
  {/if}

  <div class="input-area">
    <input
      type="file"
      accept="image/*,.pdf"
      on:change={handleImageSelect}
      disabled={loading}
    />
    <input
      bind:value={input}
      placeholder="Ask about the document..."
      on:keydown={(e) => e.key === 'Enter' && sendMessage()}
      disabled={loading}
    />
    <button on:click={sendMessage} disabled={loading}>
      {loading ? 'Analyzing...' : 'Send'}
    </button>
  </div>
</div>

<style>
  .vision-insights {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #f0f8ff;
    border-left: 3px solid #007bff;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }

  .vision-insights ul {
    margin: 0.25rem 0 0 1rem;
    padding: 0;
  }

  .vision-insights li {
    margin: 0.25rem 0;
  }

  .image-preview {
    position: relative;
    margin: 0.5rem 0;
    max-width: 200px;
  }

  .image-preview img {
    max-width: 100%;
    border-radius: 0.5rem;
  }

  .image-preview button {
    position: absolute;
    top: -10px;
    right: -10px;
    background: red;
    color: white;
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    cursor: pointer;
  }
</style>
```

### Step 2: Update Contextual Chat Endpoint

```typescript
// src/routes/api/ai/yorha/context-chat/+server.ts
import { enrichChatWithVLMAnalysis } from '$lib/server/vlm-document-analyzer';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  const { message, imageData, caseId } = body;

  // ... existing code ...

  // If image provided, enrich with VLM
  if (imageData) {
    const enrichment = await enrichChatWithVLMAnalysis({
      query: message,
      ragResults: ragContext.results,
      imageData,
    });

    // Use enriched context for LLM
    answer = await generateText(enrichment.enrichedContext, systemPrompt);
  }

  // ... rest of code ...
};
```

## Environment Setup

### 1. Ensure Ollama Models

```bash
# Pull required models
ollama pull embeddinggemma:latest
ollama pull gemma3-legal:latest
ollama pull gemma3-vision:latest

# Verify
curl http://localhost:11434/api/tags | grep -E "embeddinggemma|gemma3"
```

### 2. Environment Variables

```bash
# .env.local
OLLAMA_ENDPOINT=http://localhost:11434
EMBEDDING_MODEL=embeddinggemma:latest
LLM_MODEL=gemma3-legal:latest
VISION_MODEL=gemma3-vision:latest
```

## Usage Examples

### Example 1: Analyze Contract

```typescript
const result = await analyzeDocumentImage({
  imageBase64: contractImage,
  documentType: 'contract',
  context: 'Analyze for liability and indemnification clauses',
});

console.log('Summary:', result.summary);
console.log('Key Entities:', result.keyEntities);
console.log('Legal Concepts:', result.legalConcepts);
```

### Example 2: Batch Process Evidence

```typescript
const documents = [
  { imageBase64: img1, documentType: 'evidence' },
  { imageBase64: img2, documentType: 'evidence' },
  { imageBase64: img3, documentType: 'evidence' },
];

const results = await analyzeDocumentBatch(documents);
results.forEach((r) => {
  console.log(`${r.documentId}: ${r.summary}`);
});
```

### Example 3: Enhanced Chat with Image

```typescript
const response = await fetch('/api/ai/enhanced-rag-vlm', {
  method: 'POST',
  body: JSON.stringify({
    query: 'What are the key obligations?',
    ragResults: [
      {
        text: 'Contract text from Qdrant...',
        evidence_id: 'EV-001',
        chunk_id: 'ev-001-c1',
        score: 0.95,
      },
    ],
    imageData: base64ContractImage,
    documentType: 'contract',
  }),
});

const { answer, visionInsights, confidence } = await response.json();
console.log('Answer:', answer);
console.log('Confidence:', confidence);
console.log('Vision Insights:', visionInsights);
```

## Performance Optimization

### 1. Image Compression

```typescript
async function compressImage(base64: string, quality: number = 0.8): Promise<string> {
  const img = new Image();
  img.src = base64;

  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
  });
}
```

### 2. Caching

```typescript
const analysisCache = new Map<string, DocumentAnalysisResult>();

async function analyzeWithCache(request: ImageAnalysisRequest) {
  const key = `${request.imageBase64.substring(0, 50)}-${request.documentType}`;

  if (analysisCache.has(key)) {
    return analysisCache.get(key)!;
  }

  const result = await analyzeDocumentImage(request);
  analysisCache.set(key, result);
  return result;
}
```

### 3. Streaming Responses

```typescript
export async function* streamEnhancedRAG(
  query: string,
  ragResults: any[],
  imageData?: string
) {
  const enrichment = imageData
    ? await enrichChatWithVLMAnalysis({ query, ragResults, imageData })
    : { enrichedContext: ragResults.map((r) => r.text).join('\n') };

  for await (const chunk of generateTextStream(enrichment.enrichedContext)) {
    yield chunk;
  }
}
```

## Troubleshooting

### Issue: "Ollama not responding"

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
ollama serve
```

### Issue: "Model not found"

```bash
# Pull missing model
ollama pull gemma3-vision:latest

# Verify
ollama list | grep gemma3-vision
```

### Issue: "Image analysis timeout"

- Reduce image size before sending
- Increase timeout in `ollama-service.ts`
- Use streaming for large documents

## Next Steps

1. **Fine-tune Gemma3-Vision** on legal documents
2. **Add OCR fallback** for scanned documents
3. **Implement document classification** for automatic routing
4. **Add multi-page document support** for PDFs
5. **Create analytics dashboard** for VLM performance

## References

- [Ollama Documentation](https://ollama.ai)
- [Gemma3 Model Card](https://huggingface.co/google/gemma-3)
- [Contextual Chat Setup](./PHASE72_CONTEXTUAL_CHAT_SETUP.md)
- [RAG/KAG Workflow](./phase-rag-kag-workflow.md)
