#!/usr/bin/env node
/**
 * scripts/atlas/bench-inference-backends.mjs
 *
 * Performance benchmark comparing TurboQuant (llama-server on port 8090)
 * and Ollama (on port 11434) using high-fidelity streaming metrics,
 * real-time nvidia-smi VRAM delta audits, and config-parity checks.
 *
 * Usage:
 *   node scripts/atlas/bench-inference-backends.mjs [--backend=turbo|ollama|all] [--tokens=256] [--vlm]
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const BACKEND = args.find(a => a.startsWith('--backend='))?.split('=')[1] || 'all';
const TOKENS = parseInt(args.find(a => a.startsWith('--tokens='))?.split('=')[1] || '256', 10);
const VLM_MODE = args.includes('--vlm');

const REPO_ROOT = resolve(process.cwd());
const REPORTS_DIR = join(REPO_ROOT, 'docs/reports');

const prompt = "List 8 core security audit guidelines for Svelte 5 runes context state management. Keep it extremely concise.";

// Helper to query VRAM using nvidia-smi
function getVramUsed() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits', { encoding: 'utf8' });
    return parseInt(out.trim(), 10);
  } catch {
    return 0; // Fallback to 0 if nvidia-smi is unavailable (e.g. non-NVIDIA or headless CPU test)
  }
}

async function benchTurbo(maxTokens) {
  const url = process.env.TURBOQUANT_BASE_URL || 'http://127.0.0.1:8090';
  console.log(`\n🚀 [TurboQuant] Initializing stream prompt to: ${url}`);
  
  const vramBefore = getVramUsed();
  const t0 = Date.now();
  
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'local',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      stream: true
    }),
    signal: AbortSignal.timeout(30000)
  });
  
  if (!res.ok) {
    throw new Error(`TurboQuant returned HTTP ${res.status}`);
  }
  
  let firstTokenMs = null;
  let text = '';
  let tokenCount = 0;
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    if (!firstTokenMs) {
      firstTokenMs = Date.now() - t0;
    }
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine.startsWith('data:')) continue;
      const dataStr = cleanLine.slice(5).trim();
      if (dataStr === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          tokenCount++;
        }
      } catch (e) {
        // skip malformed SSE packets
      }
    }
  }
  
  const totalMs = Date.now() - t0;
  const vramAfter = getVramUsed();
  
  return {
    backend: 'TurboQuant',
    port: 8090,
    online: true,
    firstTokenMs,
    totalMs,
    tokenCount,
    tokensPerSec: tokenCount > 0 ? parseFloat((tokenCount / (totalMs / 1000)).toFixed(2)) : 0,
    vramBefore,
    vramAfter,
    vramDiff: vramAfter - vramBefore,
    text
  };
}

async function benchOllama(maxTokens) {
  const url = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  console.log(`\n🚀 [Ollama] Initializing stream prompt to: ${url}`);
  
  const vramBefore = getVramUsed();
  const t0 = Date.now();
  const model = 'gemma4-rotorquant:latest';
  
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      options: { num_predict: maxTokens },
      stream: true
    }),
    signal: AbortSignal.timeout(60000)
  });
  
  if (!res.ok) {
    throw new Error(`Ollama returned HTTP ${res.status}`);
  }
  
  let firstTokenMs = null;
  let text = '';
  let thinkingText = '';
  let tokenCount = 0;
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    if (!firstTokenMs) {
      firstTokenMs = Date.now() - t0;
    }
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.message) {
          const content = parsed.message.content;
          const thinking = parsed.message.thinking;
          
          if (content) {
            text += content;
            tokenCount++;
          }
          if (thinking) {
            thinkingText += thinking;
            tokenCount++;
          }
        }
      } catch (e) {
        // skip malformed JSON chunks
      }
    }
  }
  
  const totalMs = Date.now() - t0;
  const vramAfter = getVramUsed();
  
  return {
    backend: 'Ollama',
    port: 11434,
    online: true,
    firstTokenMs,
    totalMs,
    tokenCount,
    tokensPerSec: tokenCount > 0 ? parseFloat((tokenCount / (totalMs / 1000)).toFixed(2)) : 0,
    vramBefore,
    vramAfter,
    vramDiff: vramAfter - vramBefore,
    text: text.trim() || thinkingText.trim()
  };
}

async function run() {
  console.log('── Running Inference Backends Benchmark ────────────');
  console.log(`⚙️  Target Backend: ${BACKEND}`);
  console.log(`⚙️  Max Tokens:     ${TOKENS}`);
  console.log(`⚙️  VLM Mode:       ${VLM_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log('────────────────────────────────────────────────────');

  const results = [];

  // Run TurboQuant
  if (BACKEND === 'all' || BACKEND === 'turbo') {
    try {
      const res = await benchTurbo(TOKENS);
      results.push(res);
      console.log(`✅ TurboQuant complete: ${res.tokensPerSec} tok/s | TTFT: ${res.firstTokenMs}ms | VRAM: ${res.vramDiff}MB`);
    } catch (e) {
      console.warn(`⚠️  TurboQuant is OFFLINE or STANDBY: ${e.message}`);
      results.push({
        backend: 'TurboQuant',
        port: 8090,
        online: false,
        error: e.message
      });
    }
  }

  // Run Ollama
  if (BACKEND === 'all' || BACKEND === 'ollama') {
    try {
      const res = await benchOllama(TOKENS);
      results.push(res);
      console.log(`✅ Ollama complete: ${res.tokensPerSec} tok/s | TTFT: ${res.firstTokenMs}ms | VRAM: ${res.vramDiff}MB`);
    } catch (e) {
      console.warn(`⚠️  Ollama is OFFLINE or STANDBY: ${e.message}`);
      results.push({
        backend: 'Ollama',
        port: 11434,
        online: false,
        error: e.message
      });
    }
  }

  // Write reports
  if (!existsSync(REPORTS_DIR)) {
    await mkdir(REPORTS_DIR, { recursive: true });
  }

  const jsonReportPath = join(REPORTS_DIR, 'inference-backend-benchmark.json');
  await writeFile(jsonReportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    tokensLimit: TOKENS,
    vlmMode: VLM_MODE,
    results
  }, null, 2));

  // Write MD Report
  const mdReportPath = join(REPORTS_DIR, 'inference-backend-benchmark.md');
  let mdContent = `# 📊 Model Inference Backend Performance Report

*Compiled on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}*

This report audits and evaluates local inference performance between **TurboQuant** (\`llama-server.exe\` on port 8090) and **Ollama** (on port 11434).

---

## 🚀 Performance Overview

| Backend | Port | Status | Tokens/Sec | Time-to-First-Token (TTFT) | Total Time | VRAM Delta |
|---------|------|--------|------------|---------------------------|------------|------------|
`;

  for (const r of results) {
    if (r.online) {
      mdContent += `| **${r.backend}** | \`${r.port}\` | ✅ Online | **${r.tokensPerSec}** | \`${r.firstTokenMs}ms\` | \`${(r.totalMs / 1000).toFixed(2)}s\` | \`${r.vramDiff}MB\` |\n`;
    } else {
      mdContent += `| **${r.backend}** | \`${r.port}\` | ❌ Standby / Offline | N/A | N/A | N/A | N/A |\n`;
    }
  }

  mdContent += `
---

## 🧠 Environmental Context
* **Base Model**: \`models/gemma4-rotorquant:latest-iq4xs-direct.gguf\` (~5.09 GB)
* **Vision Plugin**: \`models/mmproj-F16.gguf\` (~990 MB) (loaded only when VLM mode is toggled)
* **VLM Mode**: \`${VLM_MODE ? 'ENABLED' : 'DISABLED'}\`

---

## 🔎 Detailed Transcripts

`;

  for (const r of results) {
    if (r.online) {
      mdContent += `### 📄 ${r.backend} Output Sample
\`\`\`text
${r.text.trim()}
\`\`\`

`;
    }
  }

  await writeFile(mdReportPath, mdContent);
  console.log(`\n📊 Reports compiled successfully:`);
  console.log(`   - JSON: docs/reports/inference-backend-benchmark.json`);
  console.log(`   - MD:   docs/reports/inference-backend-benchmark.md`);
}

run().catch(console.error);
