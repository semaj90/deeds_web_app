#!/usr/bin/env node
import 'dotenv/config';

const TURBO_BASE = process.env.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090';
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL    ?? 'http://127.0.0.1:11434';

async function validate() {
  console.log('── Validating Model Endpoints ──────────────────');
  
  // 1. TurboQuant
  try {
    const res = await fetch(`${TURBO_BASE}/v1/models`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ TurboQuant (${TURBO_BASE}): OK. Models: ${data.data?.map(m => m.id).join(', ') ?? 'unknown'}`);
    } else {
      console.error(`❌ TurboQuant (${TURBO_BASE}): Failed with status ${res.status}`);
    }
  } catch (e) {
    console.error(`❌ TurboQuant (${TURBO_BASE}): Unreachable: ${e.message}`);
  }

  // 2. Ollama
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ Ollama (${OLLAMA_BASE}): OK. Models: ${data.models?.map(m => m.name).join(', ') ?? 'none'}`);
    } else {
      console.error(`❌ Ollama (${OLLAMA_BASE}): Failed with status ${res.status}`);
    }
  } catch (e) {
    console.error(`❌ Ollama (${OLLAMA_BASE}): Unreachable: ${e.message}`);
  }
  
  console.log('────────────────────────────────────────────────');
}

validate();
