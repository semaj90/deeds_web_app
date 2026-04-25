# Gemma3 GGUF Model Integration Guide

## Complete Setup & Documentation for Legal AI Assistant

This guide provides comprehensive documentation for integrating a custom Unsloth-trained Gemma3 GGUF model into your SvelteKit 5 Legal AI system with Bits UI components.

## 🎯 Overview

Your system architecture:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   SvelteKit 5   │────▶│   Ollama API    │────▶│  Gemma3 GGUF    │
│   + Bits UI     │     │  (Port 11434)   │     │  mo16.gguf      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐     ┌─────────────────┐
│  Alternative:   │     │   vLLM Server   │
│  Direct vLLM    │────▶│  (Port 8001)    │
│  Integration    │     │  API Compatible │
└─────────────────┘     └─────────────────┘
```

## 📁 Current File Structure

```
c:/Users/james/Desktop/deeds-web/deeds-web-app/
├── gemma3Q4_K_M/
│   └── mo16.gguf                           # Your trained model
├── sveltekit-frontend/
│   ├── src/lib/
│   │   ├── components/ai/
│   │   │   ├── AIChatInterface.svelte      # Main chat UI
│   │   │   ├── AIButton.svelte             # Chat trigger
│   │   │   └── AIChatMessage.svelte        # Message display
│   │   ├── services/
│   │   │   ├── ollama-service.ts           # Ollama integration
│   │   │   └── tauri-llm.ts               # Local LLM service
│   │   └── config/
│   │       ├── gemma3-config.ts           # Model configurations
│   │       └── local-llm.ts               # LLM paths & settings
│   └── src/routes/api/
│       ├── ai/
│       │   ├── chat/+server.ts            # Chat API endpoint
│       │   ├── ask/+server.ts             # RAG endpoint
│       │   └── ollama-gemma3/+server.ts   # Direct Ollama
│       └── ...
├── setup-gemma3-legal.ps1                # Ollama setup script
├── Modelfile-Ultra-Light                 # Ollama model config
├── direct-gemma3llama.cpp server
├── test-gemma3-direct.py                 # Model testing
└── ...
```

## 🚀 Quick Start

### Method 1: Ollama Integration (Recommended)

1. **Ensure Ollama is running:**

```powershell
# Start Ollama service
ollama serve
```

2. **Run the setup script:**

```powershell
cd "c:/Users/james/Desktop/deeds-web/deeds-web-app"
./setup-gemma3-legal.ps1
```

3. **Verify installation:**

```powershell
ollama list
ollama run gemma3-legal "What are the key elements of contract law?"
```

### Method 2: Direct vLLM Integration

1. **Install dependencies:**

```bash
pip install vllm fastapi uvicorn
# or fallback: pip install llama-cpp-python
```

2. **Start the vLLM server:**

```bash
python direct-gemma3-vllm-server.py
```

3. **Test the server:**

```bash
python test-gemma3-direct.py
```

## 🔧 GGUF Model Conversion

If you need to convert your model to GGUF format:

```python
# convert.py - Unsloth to GGUF conversion
from unsloth import FastLanguageModel
import torch

# Load your trained model
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="path/to/your/unsloth-model",
    max_seq_length=8192,
    dtype=None,
    load_in_4bit=True,
)

# Export to GGUF with Q4_K_M quantization
model.save_pretrained_gguf(
    "gemma3-legal",
    tokenizer,
    quantization_method="q4_k_m",
    # For legal AI, use higher precision
    use_fast_tokenizer=True,
)
```

### Quantization Options:

- **Q4_K_M**: Best balance (recommended) - ~4GB RAM
- **Q8_0**: Higher precision - ~6GB RAM
- **Q4_0**: Faster inference - ~3GB RAM

## 🏗️ SvelteKit Frontend Integration

### 1. Chat Interface Component

Your `AIChatInterface.svelte` is well-structured. Key features:

```typescript
// Current configuration in the component
let settings: ChatSettings = {
  model: "gemma3-legal:latest", // ✅ Points to custom model
  temperature: 0.1, // ✅ Good for legal precision
  maxTokens: 512, // ✅ Reasonable for responses
  topP: 0.9, // ✅ Balanced creativity
  systemPrompt: "You are a specialized Legal AI...", // ✅ Legal context
};
```

### 2. API Endpoints Status

Current endpoints need completion:

```typescript
// ✅ EXISTS: src/routes/api/ai/ollama-gemma3/+server.ts
// ⚠️  MOCK: src/routes/api/ai/chat/+server.ts (needs real integration)
// ✅ PARTIAL: src/routes/api/ai/ask/+server.ts (has Ollama integration)
```

### 3. Service Layer Integration

Your `ollama-service.ts` includes:

```typescript
class OllamaService {
  // ✅ Model detection with fallbacks
  private async detectGemma3Model(): Promise<void> {
    const customLegalModel = this.availableModels.find(
      (model) => model.name === "gemma3-legal"
    );

    if (customLegalModel) {
      this.gemma3Model = "gemma3-legal";
      console.log(`🏛️ Using custom legal AI model: ${this.gemma3Model}`);
      return;
    }
    // ... fallback logic
  }

  // ✅ GGUF import functionality
  async importGGUF(
    modelPath: string,
    modelName = "gemma3-legal"
  ): Promise<boolean>;

  // ✅ Generation with legal-optimized settings
  async generate(prompt: string, options = {}): Promise<string>;
}
```

## 🎨 Bits UI Integration

Your components use modern Bits UI patterns:

```svelte
<!-- AIChatInterface.svelte - Using Bits UI patterns -->
<script lang="ts">
  import { createDialog, melt } from '@melt-ui/svelte';
  import { fade, fly, scale } from 'svelte/transition';

  // ✅ Proper Bits UI dialog setup
  const {
    elements: { trigger, overlay, content, title, close },
    states: { open }
  } = createDialog();
</script>

<!-- ✅ Accessible, draggable chat window -->
<div class="yorha-chat-window" bind:this={windowElement}>
  <!-- Chat content with legal AI branding -->
</div>
```

## 🔗 Complete Integration Steps

### Step 1: Fix API Endpoints

Update `src/routes/api/ai/chat/+server.ts`:

```typescript
import { json } from "@sveltejs/kit";
import { ollamaService } from "$lib/services/ollama-service";

export const POST = async ({ request }) => {
  try {
    const { message, context, model = "gemma3-legal" } = await request.json();

    if (!message) {
      return json({ error: "Message is required" }, { status: 400 });
    }

    // Use actual Ollama service instead of mock
    const response = await ollamaService.generate(message, {
      system: "You are a specialized Legal AI Assistant...",
      temperature: 0.1,
      maxTokens: 512,
    });

    return json({
      response,
      model,
      metadata: {
        provider: "ollama",
        confidence: 0.9,
        executionTime: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return json({ error: "Failed to process chat" }, { status: 500 });
  }
};
```

### Step 2: Update Frontend Chat Component

Ensure your `AIChatInterface.svelte` calls the right endpoint:

```typescript
async function sendMessage(content: string) {
  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        model: settings.model, // "gemma3-legal"
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        systemPrompt: settings.systemPrompt,
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    addMessage("assistant", data.response);
  } catch (error) {
    addMessage(
      "assistant",
      "Sorry, I encountered an error processing your request.",
      true
    );
  }
}
```

### Step 3: Enhanced Model Configuration

Your `gemma3-config.ts` provides excellent legal-specific configurations:

```typescript
export const LEGAL_SYSTEM_PROMPTS = {
  general: `You are a specialized legal AI assistant with expertise in:
- Case law analysis and legal research
- Document review and evidence evaluation
- Legal reasoning and argumentation
- Citation and precedent identification
- Procedural guidance and compliance`,

  case_analysis: `You are analyzing legal case documents. Focus on:
- Key facts and legal issues
- Applicable laws and regulations
- Relevant precedents and citations
- Potential arguments and counterarguments
- Risk assessment and recommendations`,

  // ... more specialized prompts
};
```

## 🧪 Testing & Troubleshooting

### Test Scripts Available:

1. **Basic Integration Test:**

```bash
node sveltekit-frontend/scripts/test-ai-integration.js
```

2. **Direct Model Test:**

```bash
python test-gemma3-direct.py
```

3. **Frontend Test Pages:**

- `/test-gemma3` - Model status and testing
- `/test-ai-ask` - RAG system testing
- `/ai-test` - Full integration testing

### Common Issues & Solutions:

#### 1. Model Not Loading

```powershell
# Check if model file exists
Test-Path ".\gemma3Q4_K_M\mo16.gguf"

# Verify Ollama service
ollama list
curl http://localhost:11434/api/tags
```

#### 2. GGUF Import Fails

```powershell
# Update Modelfile path (currently using /tmp/mo16.gguf)
# Should be: .\gemma3Q4_K_M\mo16.gguf
```

#### 3. Frontend Not Connecting

```typescript
// Check API endpoint URLs in components
apiEndpoint = "http://localhost:11434/api/generate"; // Ollama
// or
apiEndpoint = "http://localhost:8001/v1/chat/completions"; // vLLM
```

#### 4. Memory Issues

- Minimum 4GB RAM for Q4_K_M quantization
- Close other applications if needed
- Consider Q4_0 quantization for lower memory usage

## 📊 Performance Optimization

### Model Settings for Legal AI:

```typescript
// Precise legal analysis
const preciseSettings = {
  temperature: 0.1, // Low creativity, high consistency
  topP: 0.7, // Focused responses
  topK: 10, // Limited token selection
  repeatPenalty: 1.05, // Prevent repetition
};

// Balanced legal consultation
const balancedSettings = {
  temperature: 0.7, // More natural responses
  topP: 0.9, // Broader context
  topK: 40, // More varied vocabulary
  repeatPenalty: 1.1, // Standard repetition control
};
```

### Context Window Management:

```typescript
// Your current config supports:
contextLength: 8192,     // Good for document analysis
maxTokens: 4096,        // Reasonable response length
```

## 🎨 Advanced UI Features

Your system includes sophisticated UI components:

### 1. Draggable Chat Window

```svelte
<!-- Already implemented in AIChatInterface.svelte -->
<div class="yorha-chat-window" class:dragging={isDragging}>
  <!-- YoRHa-inspired design with legal AI branding -->
</div>
```

### 2. Model Selection Dropdown

```svelte
<select bind:value={settings.model}>
  <option value="gemma3-legal:latest">Gemma3 Legal (Q4_K_M)</option>
  <option value="llama3.2:1b">Llama3.2 Fallback</option>
</select>
```

### 3. Streaming Responses

```typescript
// Your AIChatInterface supports streaming
let isTyping = false;
// Implement actual streaming via Server-Sent Events or WebSocket
```

## 🚦 Status Dashboard

Current implementation status:

### ✅ Completed

- [x] GGUF model file ready (`mo16.gguf`)
- [x] Ollama service integration (`ollama-service.ts`)
- [x] Frontend chat components (`AIChatInterface.svelte`)
- [x] Legal-specific configurations (`gemma3-config.ts`)
- [x] Setup scripts (`setup-gemma3-legal.ps1`)
- [x] Testing utilities
- [x] Bits UI integration
- [x] YoRHa design theme

### ⚠️ Needs Completion

- [ ] API endpoint mock removal (`/api/ai/chat/+server.ts`)
- [ ] Streaming response implementation
- [ ] Model health monitoring
- [ ] Error handling improvements
- [ ] RAG integration completion

### 🔧 Modelfile Fixes Needed

```plaintext
# Current Modelfile-Ultra-Light has wrong path:
FROM /tmp/mo16.gguf  # ❌ Wrong path

# Should be:
FROM .\gemma3Q4_K_M\mo16.gguf  # ✅ Correct path
```

## 🎯 Next Steps

1. **Fix Modelfile path** and re-run setup script
2. **Update chat API** to use real Ollama integration
3. **Test model responses** with legal queries
4. **Implement streaming** for better UX
5. **Add model health monitoring** to UI

## 📚 Documentation Links

- **Local Setup Guide:** `markdowns/LOCAL_LLM_SETUP.md`
- **Component Documentation:** Bits UI components in `src/lib/components/ui/`
- **API Documentation:** Endpoints in `src/routes/api/`
- **Configuration Files:** `src/lib/config/`

Your system has excellent foundation architecture. The main missing piece is connecting the mock API endpoints to the actual Ollama service, which is already well-implemented in your service layer.
