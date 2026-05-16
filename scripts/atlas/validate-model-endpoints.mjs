#!/usr/bin/env node
import 'dotenv/config';

const TURBO_BASE = process.env.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090';
const GEMMA_BASE = process.env.GEMMA4_BASE_URL    ?? 'http://127.0.0.1:8090';
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL    ?? 'http://localhost:11434';

async function validate() {
  console.log('── Validating Model Endpoints ──────────────────');
  
  // 1. TurboQuant / Gemma4
  const endpoints = [
    { name: 'TURBOQUANT_BASE_URL', url: TURBO_BASE },
    { name: 'GEMMA4_BASE_URL', url: GEMMA_BASE },
    { name: 'OLLAMA_BASE_URL', url: OLLAMA_BASE }
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep.url}/v1/models`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        console.log(`✅ ${ep.name} (${ep.url}): OK`);
      } else {
        // Fallback for Ollama which uses /api/tags
        if (ep.name === 'OLLAMA_BASE_URL') {
          const ollamaRes = await fetch(`${ep.url}/api/tags`, { signal: AbortSignal.timeout(3000) });
          if (ollamaRes.ok) {
            console.log(`✅ ${ep.name} (${ep.url}): OK (via /api/tags)`);
            continue;
          }
        }
        console.error(`❌ ${ep.name} (${ep.url}): Failed (${res.status})`);
      }
    } catch (e) {
      console.error(`❌ ${ep.name} (${ep.url}): Unreachable (${e.message})`);
    }
  }
  
  console.log('────────────────────────────────────────────────');
}

validate();
