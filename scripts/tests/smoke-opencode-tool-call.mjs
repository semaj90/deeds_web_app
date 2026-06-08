#!/usr/bin/env node
/**
 * smoke-opencode-tool-call.mjs
 *
 * Validates llama-server is healthy and passes three checks:
 *   1. /props: supports_system_role + supports_tool_calls both true
 *   2. system prompt obedience: "Reply exactly: SYSTEM_OK" → content must be "SYSTEM_OK"
 *   3. streaming: stream:true yields at least one delta chunk
 *
 * Usage:
 *   node scripts/tests/smoke-opencode-tool-call.mjs
 *   node scripts/tests/smoke-opencode-tool-call.mjs --url http://127.0.0.1:8090
 */

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const BASE = urlIdx >= 0 ? args[urlIdx + 1] : 'http://127.0.0.1:8090';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';

let passed = 0;
let failed = 0;

function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) { console.log(`  ❌ ${label}: ${detail}`); failed++; }

async function checkProps() {
  const res = await fetch(`${BASE}/props`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) { fail('props', `HTTP ${res.status}`); return; }
  const d = await res.json();
  const caps = d.chat_template_caps ?? {};
  if (caps.supports_system_role) ok('supports_system_role');
  else fail('supports_system_role', 'false — embedded GGUF template lacks system role; restart with --chat-template-file configs/templates/gemma4-opencode.jinja');
  if (caps.supports_tool_calls) ok('supports_tool_calls');
  else fail('supports_tool_calls', 'false');
}

async function checkSystemPrompt() {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Reply exactly: SYSTEM_OK' },
        { role: 'user', content: 'hello' },
      ],
      temperature: 0,
      max_tokens: 16,
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) { fail('system-prompt', `HTTP ${res.status}`); return; }
  const d = await res.json();
  const content = d.choices?.[0]?.message?.content?.trim() ?? '';
  const promptTokens = d.usage?.prompt_tokens ?? 0;
  if (promptTokens <= 4) {
    fail('system-prompt', `prompt_tokens=${promptTokens} — system message dropped. Do not pass --chat-template to llama-server`);
    return;
  }
  if (content === 'SYSTEM_OK') ok(`system-prompt obeyed (content="${content}", prompt_tokens=${promptTokens})`);
  else fail('system-prompt', `content="${content}" — expected "SYSTEM_OK"`);
}

async function checkStreaming() {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: 'Say: ok' }],
      temperature: 0,
      max_tokens: 8,
      stream: true,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) { fail('streaming', `HTTP ${res.status}`); return; }
  let chunks = 0;
  let assembled = '';
  const decoder = new TextDecoder();
  let buf = '';
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
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) { chunks++; assembled += delta; }
      } catch { /* skip */ }
    }
  }
  if (chunks > 0) ok(`streaming (${chunks} chunks, content="${assembled.trim().slice(0, 40)}")`);
  else fail('streaming', 'no content deltas received');
}

async function main() {
  console.log(`\n── llama-server smoke: OpenCode tool-call readiness ────`);
  console.log(`  endpoint: ${BASE}`);
  console.log(`  model:    ${MODEL}\n`);

  try { await checkProps(); } catch (e) { fail('props', e.message); }
  try { await checkSystemPrompt(); } catch (e) { fail('system-prompt', e.message); }
  try { await checkStreaming(); } catch (e) { fail('streaming', e.message); }

  console.log(`\n── Result: ${passed} passed, ${failed} failed ─────────────`);
  if (failed > 0) {
    console.log('\n  Hard rules for llama-server.exe:');
    console.log('    ✓ DO pass  --chat-template-file configs/templates/gemma4-opencode.jinja');
    console.log('    ✗ DO NOT pass --chat-template gemma or --chat-template gemma3 (drops system role)');
    console.log('    ✗ DO NOT pass --reasoning auto or --reasoning-budget 0');
    console.log('    ✓ DO pass  --jinja --reasoning-format none');
    console.log('    ✓ DO pass  -fa on -ctk q8_0 -ctv q8_0');
    process.exit(1);
  }
  console.log('\n  Ready for OpenCode / Vercel AI SDK via llama-server provider.');
}

main().catch(e => { console.error('smoke error:', e.message); process.exit(1); });
