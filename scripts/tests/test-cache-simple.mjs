#!/usr/bin/env node

// Direct llama-server smoke test — hits :8090 with gemma4-legal-iq4xs-direct.gguf
// Usage: node scripts/tests/test-cache-simple.mjs
//
// Requirements: llama-server running at :8090 with the canonical Gemma4 GGUF.
// Do NOT route through Ollama or the SvelteKit dev server.

const LLAMA_URL = process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';

// SSE streaming helper — assembles content deltas per CLAUDE.md Gemma4 rules.
async function streamChat(messages, { maxTokens = 512, temperature = 0.3 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    }),
  });

  if (!res.ok) {
    clearTimeout(timer);
    const body = await res.text().catch(() => '');
    throw new Error(`llama-server ${res.status}: ${body.slice(0, 200)}`);
  }

  let assembled = '';
  const decoder = new TextDecoder();
  let buf = '';

  try {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;
        try {
          const parsed = JSON.parse(payload);
          assembled += parsed.choices?.[0]?.delta?.content ?? '';
        } catch {
          // skip malformed SSE line
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return assembled.trim();
}

function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, detail) { console.error(`  ❌ ${label}${detail ? `: ${detail}` : ''}`); }

let passed = 0;
let failed = 0;

async function step(label, fn) {
  try {
    await fn();
    pass(label);
    passed++;
  } catch (err) {
    fail(label, err?.message ?? String(err));
    failed++;
  }
}

console.log(`\n=== llama-server Gemma4 Smoke Test ===`);
console.log(`Target: ${LLAMA_URL}  Model: ${MODEL}\n`);

// Step 0 — server health + system role support
await step('GET /props — server alive + supports_system_role', async () => {
  const res = await fetch(`${LLAMA_URL}/props`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const props = await res.json();
  if (!props.supports_system_role) {
    throw new Error(
      'supports_system_role=false — restart with --chat-template-file configs/templates/gemma4-opencode.jinja'
    );
  }
});

// Step 1 — model list confirms the GGUF is loaded
await step('GET /v1/models — canonical GGUF loaded', async () => {
  const res = await fetch(`${LLAMA_URL}/v1/models`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { data } = await res.json();
  const ids = (data ?? []).map((m) => m.id);
  if (!ids.includes(MODEL)) {
    throw new Error(`Model not found. Available: ${ids.join(', ')}`);
  }
});

// Step 2 — simple factual completion
await step('Simple completion — capital of France', async () => {
  const start = Date.now();
  const text = await streamChat([{ role: 'user', content: 'What is the capital of France? Answer in one word.' }]);
  const ms = Date.now() - start;
  if (!text.toLowerCase().includes('paris')) {
    throw new Error(`Expected "Paris" in response, got: ${text.slice(0, 120)}`);
  }
  console.log(`     → "${text.slice(0, 60)}" (${ms}ms)`);
});

// Step 3 — system prompt isolation
await step('System prompt — SYSTEM_OK isolation', async () => {
  const text = await streamChat([
    { role: 'system', content: 'Reply with exactly the word: SYSTEM_OK' },
    { role: 'user', content: 'hello' },
  ], { maxTokens: 16, temperature: 0 });
  if (!text.includes('SYSTEM_OK')) {
    throw new Error(`System prompt not honored. Got: "${text.slice(0, 80)}"`);
  }
});

// Step 4 — legal domain prompt
await step('Legal domain — hearsay definition', async () => {
  const start = Date.now();
  const text = await streamChat([
    { role: 'system', content: 'You are a legal assistant specializing in evidence law.' },
    { role: 'user', content: 'Define hearsay evidence in two sentences.' },
  ], { maxTokens: 200 });
  const ms = Date.now() - start;
  const lower = text.toLowerCase();
  const hasLegalTerm = lower.includes('out-of-court') || lower.includes('statement') || lower.includes('declarant') || lower.includes('hearsay');
  if (!hasLegalTerm) {
    throw new Error(`Response lacks legal terminology: "${text.slice(0, 120)}"`);
  }
  console.log(`     → "${text.slice(0, 80)}..." (${ms}ms)`);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
