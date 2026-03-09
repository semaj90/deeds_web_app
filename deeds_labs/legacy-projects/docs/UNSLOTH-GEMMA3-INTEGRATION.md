# Unsloth Gemma3 Sharded Model Integration

## Your Model Setup

✅ **You have**: Pre-trained Gemma3 model with shards from Unsloth
✅ **Model format**: Likely `model-00001-of-00004.safetensors` (sharded checkpoints)
✅ **Training**: Unsloth fine-tuned for legal AI tasks

## Model Structure

Typical Unsloth sharded model directory:
```
gemma3-unsloth/
├── config.json
├── tokenizer.json
├── tokenizer_config.json
├── special_tokens_map.json
├── model-00001-of-00004.safetensors
├── model-00002-of-00004.safetensors
├── model-00003-of-00004.safetensors
├── model-00004-of-00004.safetensors
└── model.safetensors.index.json  # Shard mapping
```

## Integration Options

### Option 1: Direct Ollama Import ⭐ FASTEST

Ollama can load sharded safetensors models directly.

**Steps:**

1. **Create Modelfile**
```bash
# Create Modelfile in your model directory
cat > Modelfile << 'EOF'
FROM ./gemma3-unsloth

# Temperature (legal AI: lower = more precise)
PARAMETER temperature 0.3

# Top-p sampling
PARAMETER top_p 0.9

# Context window
PARAMETER num_ctx 8192

# System prompt for legal AI
SYSTEM """
You are a legal AI assistant specialized in:
- Contract analysis and interpretation
- Legal document drafting
- Case law research and citation
- Regulatory compliance analysis

Provide accurate, well-reasoned legal analysis with proper citations.
"""
EOF
```

2. **Import to Ollama**
```bash
# Navigate to model directory
cd /path/to/gemma3-unsloth

# Create Ollama model
ollama create gemma3-legal -f Modelfile

# Verify
ollama list | grep gemma3-legal

# Test
ollama run gemma3-legal "Analyze this contract clause: 'Party A shall indemnify Party B...'"
```

### Option 2: Merge Shards for TensorRT-LLM

If you need TensorRT-LLM, merge shards first.

**Script:** `scripts/merge-unsloth-shards.py`

```python
#!/usr/bin/env python3
"""
Merge Unsloth sharded safetensors into single checkpoint
Prepares for TensorRT-LLM conversion
"""

import json
import torch
from pathlib import Path
from safetensors.torch import load_file, save_file
from tqdm import tqdm

def merge_sharded_model(model_dir: Path, output_path: Path):
    """Merge sharded safetensors into single file"""

    model_dir = Path(model_dir)
    output_path = Path(output_path)
    output_path.mkdir(parents=True, exist_ok=True)

    # Load shard index
    index_file = model_dir / "model.safetensors.index.json"
    if not index_file.exists():
        raise FileNotFoundError(f"Shard index not found: {index_file}")

    with open(index_file) as f:
        index = json.load(f)

    print(f"📦 Found {len(index['weight_map'])} tensors across shards")

    # Get unique shard files
    shard_files = sorted(set(index['weight_map'].values()))
    print(f"📂 Loading {len(shard_files)} shard files...")

    # Merge all shards
    merged_state_dict = {}

    for shard_file in tqdm(shard_files, desc="Merging shards"):
        shard_path = model_dir / shard_file
        shard_data = load_file(shard_path)
        merged_state_dict.update(shard_data)
        print(f"  ✅ Loaded {shard_file}: {len(shard_data)} tensors")

    print(f"\n💾 Saving merged checkpoint ({len(merged_state_dict)} tensors)...")

    # Save merged checkpoint
    save_file(merged_state_dict, output_path / "model.safetensors")

    # Copy config files
    import shutil
    for config_file in ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"]:
        src = model_dir / config_file
        if src.exists():
            shutil.copy(src, output_path / config_file)

    print(f"✅ Merged model saved to {output_path}/")
    print(f"\nModel ready for:")
    print(f"  - Ollama: ollama create gemma3-legal -f Modelfile")
    print(f"  - TensorRT-LLM: trtllm-build --checkpoint_dir {output_path}")

    return output_path

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Merge Unsloth sharded model")
    parser.add_argument("--model-dir", type=Path, required=True, help="Unsloth model directory")
    parser.add_argument("--output", type=Path, default=Path("./gemma3-merged"), help="Output directory")

    args = parser.parse_args()
    merge_sharded_model(args.model_dir, args.output)
```

**Usage:**
```bash
python scripts/merge-unsloth-shards.py \
  --model-dir ./gemma3-unsloth \
  --output ./gemma3-merged
```

### Option 3: SvelteKit Direct Integration

Load sharded model directly in your app using Transformers.js or ONNX Runtime.

**Installation:**
```bash
cd sveltekit-frontend
npm install @huggingface/transformers
```

**Service:** `src/lib/services/unsloth-gemma3.ts`

```typescript
// filepath: c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\services\unsloth-gemma3.ts
import { pipeline, AutoTokenizer, AutoModelForCausalLM } from '@huggingface/transformers';

export class UnslothGemma3Service {
  private model: any = null;
  private tokenizer: any = null;
  private modelPath: string;

  constructor(modelPath: string = './models/gemma3-unsloth') {
    this.modelPath = modelPath;
  }

  async initialize() {
    console.log('🔄 Loading Unsloth Gemma3 model...');

    // Load tokenizer
    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelPath);

    // Load sharded model (Transformers.js handles shards automatically)
    this.model = await AutoModelForCausalLM.from_pretrained(this.modelPath, {
      device: 'auto', // Use GPU if available
      dtype: 'float16'
    });

    console.log('✅ Unsloth Gemma3 loaded successfully');
  }

  async generateCompletion(
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    } = {}
  ): Promise<string> {
    if (!this.model || !this.tokenizer) {
      await this.initialize();
    }

    const {
      maxTokens = 512,
      temperature = 0.3,
      topP = 0.9
    } = options;

    // Format prompt for legal AI
    const formattedPrompt = `<|system|>
You are a legal AI assistant trained on contract analysis and legal document review.
<|user|>
${prompt}
<|assistant|>`;

    // Tokenize
    const inputs = await this.tokenizer(formattedPrompt, {
      return_tensors: 'pt',
      padding: true
    });

    // Generate
    const outputs = await this.model.generate({
      ...inputs,
      max_new_tokens: maxTokens,
      temperature,
      top_p: topP,
      do_sample: true,
      pad_token_id: this.tokenizer.eos_token_id
    });

    // Decode
    const generated = await this.tokenizer.decode(outputs[0], {
      skip_special_tokens: true
    });

    // Extract assistant response
    return generated.split('<|assistant|>').pop()?.trim() || generated;
  }

  async *streamCompletion(prompt: string): AsyncGenerator<string> {
    // Implement streaming using TextStreamer
    yield* this.generateCompletion(prompt);
  }
}

// Singleton instance
export const unslothGemma3 = new UnslothGemma3Service();
```

## Recommended Architecture: Hybrid Unsloth + Ollama

Best of both worlds: Ollama for API, Unsloth model for inference.

````typescript
// filepath: c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\services\legal-ai-router.ts
import { unslothGemma3 } from './unsloth-gemma3';
import { ollamaLegalAI } from './ollama-legal-ai';

export type InferenceBackend = 'ollama' | 'unsloth' | 'auto';

export class LegalAIRouter {
  private backend: InferenceBackend = 'auto';

  async route(
    prompt: string,
    complexity: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<string> {
    // Auto-select backend based on complexity
    const selectedBackend = this.backend === 'auto'
      ? (complexity === 'high' ? 'unsloth' : 'ollama')
      : this.backend;

    switch (selectedBackend) {
      case 'ollama':
        // Fast, API-based inference
        return await ollamaLegalAI.generateLegalCompletion(prompt);

      case 'unsloth':
        // High-quality, custom-trained model
        return await unslothGemma3.generateCompletion(prompt, {
          temperature: complexity === 'high' ? 0.2 : 0.5
        });

      default:
        throw new Error(`Unknown backend: ${selectedBackend}`);
    }
  }

  setBackend(backend: InferenceBackend) {
    this.backend = backend;
  }

  async benchmarkBoth(prompt: string) {
    console.log('🏁 Benchmarking Ollama vs Unsloth...');

    const ollamaStart = performance.now();
    const ollamaResult = await ollamaLegalAI.generateLegalCompletion(prompt);
    const ollamaTime = performance.now() - ollamaStart;

    const unslothStart = performance.now();
    const unslothResult = await unslothGemma3.generateCompletion(prompt);
    const unslothTime = performance.now() - unslothStart;

    return {
      ollama: { result: ollamaResult, time: ollamaTime },
      unsloth: { result: unslothResult, time: unslothTime },
      winner: ollamaTime < unslothTime ? 'ollama' : 'unsloth'
    };
  }
}

export const legalAI = new LegalAIRouter();
````

## Quick Start Guide

### Step 1: Import to Ollama (Easiest)
```bash
# 1. Navigate to your Unsloth model
cd /path/to/gemma3-unsloth

# 2. Create Modelfile
cat > Modelfile << 'EOF'
FROM .
PARAMETER temperature 0.3
PARAMETER num_ctx 8192
EOF

# 3. Import
ollama create gemma3-legal -f Modelfile

# 4. Test
ollama run gemma3-legal "Explain force majeure clause"
```

### Step 2: SvelteKit Integration
```typescript
// src/routes/api/legal-ai/+server.ts
import { json } from '@sveltejs/kit';
import { legalAI } from '$lib/services/legal-ai-router';

export async function POST({ request }) {
  const { prompt, complexity } = await request.json();

  const response = await legalAI.route(prompt, complexity);

  return json({ response });
}
```

### Step 3: Frontend Component
```svelte
<!-- src/routes/legal-ai/+page.svelte -->
<script lang="ts">
  let prompt = $state('');
  let response = $state('');
  let loading = $state(false);

  async function analyze() {
    loading = true;
    const res = await fetch('/api/legal-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, complexity: 'high' })
    });
    const data = await res.json();
    response = data.response;
    loading = false;
  }
</script>

<div class="legal-ai-interface">
  <textarea bind:value={prompt} placeholder="Enter legal query..." />
  <button onclick={analyze} disabled={loading}>
    {loading ? 'Analyzing...' : 'Analyze'}
  </button>
  {#if response}
    <div class="response">{response}</div>
  {/if}
</div>
```

## Performance Expectations

| Model Backend | Latency | Quality | Use Case |
|---------------|---------|---------|----------|
| **Ollama (API)** | 150-300ms | ⭐⭐⭐⭐ | General queries |
| **Unsloth (Direct)** | 500-1000ms | ⭐⭐⭐⭐⭐ | Complex analysis |
| **Hybrid Router** | 150-1000ms | ⭐⭐⭐⭐⭐ | Production |

## Next Steps

1. **Immediate**: Import your Unsloth model to Ollama
   ```bash
   ollama create gemma3-legal -f Modelfile
   ```

2. **Testing**: Benchmark against legal queries
   ```bash
   ollama run gemma3-legal "Analyze: Party A indemnifies Party B..."
   ```

3. **Integration**: Wire up SvelteKit API routes
4. **Optimization**: Profile performance, tune parameters
5. **Deployment**: Container
ize with Docker

## Model Management Commands

```bash
# List Ollama models
ollama list

# Remove model
ollama rm gemma3-legal

# Show model info
ollama show gemma3-legal

# Update model
ollama pull gemma3-legal

# Export model
ollama export gemma3-legal ./exported-model
```

## Troubleshooting

### Issue: "Model too large for memory"
```bash
# Use quantized version
ollama create gemma3-legal-q4 -f Modelfile --quantize q4_0
```

### Issue: "Shard files not loading"
```bash
# Merge shards first
python scripts/merge-unsloth-shards.py --model-dir ./gemma3-unsloth
```

### Issue: "Slow inference"
```bash
# Enable GPU acceleration
CUDA_VISIBLE_DEVICES=0 ollama serve
```

## Resources

- **Unsloth Docs**: https://github.com/unslothai/unsloth
- **Ollama Import Guide**: https://github.com/ollama/ollama/blob/main/docs/import.md
- **Safetensors Spec**: https://huggingface.co/docs/safetensors
