#!/usr/bin/env node
/**
 * scripts/probe-models.mjs
 *
 * Inventory the three model lanes:
 *   Lane A — Ollama (Hermes / Gemma3 / embeddings)
 *   Lane B — TurboQuant GGUF via llama-server :8090
 *   Lane C — candidate GGUF files on disk (RotorQuant / merged)
 *
 * Also probes llama-server binary flags and live chat/tool-call capability.
 *
 * Usage:
 *   npm run models:probe
 */

import { spawnSync }                         from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, basename, resolve }           from 'node:path';
import { homedir }                           from 'node:os';
import { fileURLToPath }                     from 'node:url';

// ── path setup ─────────────────────────────────────────────────────────────
const __dir   = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dir, '..');

// ── minimal .env reader (no interpolation, comments stripped) ──────────────
function loadDotenv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.replace(/\s*#.*$/, '').trim();
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadDotenv(join(rootDir, '.env')), ...process.env };

// ── colour helpers ─────────────────────────────────────────────────────────
const C = {
  green:  '\x1b[32m', cyan:   '\x1b[36m', yellow: '\x1b[33m',
  red:    '\x1b[31m', grey:   '\x1b[90m', bold:   '\x1b[1m',
  reset:  '\x1b[0m',
};
const ok  = (s) => `${C.green}✓${C.reset} ${s}`;
const bad = (s) => `${C.red}✗${C.reset} ${s}`;
const dim = (s) => `${C.grey}${s}${C.reset}`;
const hdr = (s) => `\n${C.bold}${C.cyan}── ${s} ──${C.reset}`;

// ── 1. Lane A — Ollama models ──────────────────────────────────────────────
async function probeOllama() {
  console.log(hdr('Lane A — Ollama models'));
  const base = env.OLLAMA_URL ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) { console.log(bad(`Ollama API HTTP ${res.status}`)); return; }
    const { models } = await res.json();
    if (!models?.length) { console.log(dim('  (no models found)')); return; }
    // sort: largest first
    models.sort((a, b) => b.size - a.size);
    for (const m of models) {
      const gb  = (m.size / 1e9).toFixed(1).padStart(5);
      const q   = m.details?.quantization_level ?? '';
      const fam = m.details?.family ?? '';
      console.log(`  ${ok(m.name.padEnd(40))}  ${dim(gb + 'GB')}  ${dim(q)}  ${dim(fam)}`);
    }
    console.log();
    console.log(dim(`  → update opencode.json ollama.models with the Hermes model ID above`));
    console.log(dim(`    e.g. "hermes-agent": {} → rename key to match exact ollama list name`));
  } catch (e) {
    console.log(bad(`Ollama unreachable at ${base}: ${e.message}`));
    console.log(dim('  Run: ollama serve'));
  }
}

// ── 2. Lane C — GGUF / blob files on disk ─────────────────────────────────
function walkGguf(dir, results = [], depth = 0) {
  if (depth > 4 || !existsSync(dir)) return results;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && depth < 4) {
        walkGguf(full, results, depth + 1);
      } else if (entry.isFile() && (entry.name.endsWith('.gguf') || entry.name.match(/^sha256-[0-9a-f]{20}/))) {
        try { results.push({ path: full, size: statSync(full).size }); } catch {}
      }
    }
  } catch {}
  return results;
}

function probeGgufFiles() {
  console.log(hdr('Lane C — candidate GGUF / model files on disk'));

  // de-dup directory list derived from env + known locations
  const dirs = [...new Set([
    env.TURBO_MODEL_PATH      ? resolve(env.TURBO_MODEL_PATH,      '..') : null,
    env.ROTORQUANT_MODEL_PATH ? resolve(env.ROTORQUANT_MODEL_PATH, '..') : null,
    env.TURBO_MMPROJ_PATH     ? resolve(env.TURBO_MMPROJ_PATH,     '..') : null,
    join(rootDir, 'vendor', 'models'),
    join(rootDir, 'turbovec'),
    join(homedir(), '.ollama', 'models', 'blobs'),
    join(homedir(), '.ollama', 'models', 'manifests'),
    'C:\\AI\\models',
    'C:\\models',
    'C:\\AI',
  ].filter(Boolean))];

  const all = [];
  for (const d of dirs) {
    for (const f of walkGguf(d)) {
      if (!all.find(x => x.path === f.path)) all.push(f);
    }
  }

  if (!all.length) {
    console.log(dim('  (none found)'));
    console.log(dim(`  Check: vendor/models, TURBO_MODEL_PATH=${env.TURBO_MODEL_PATH ?? '(unset)'}`));
    return;
  }

  all.sort((a, b) => b.size - a.size);
  for (const f of all) {
    const gb    = (f.size / 1e9).toFixed(2).padStart(6);
    const tag   = f.path === env.TURBO_MODEL_PATH        ? `${C.cyan}← TURBO_MODEL_PATH${C.reset}` :
                  f.path === env.ROTORQUANT_MODEL_PATH   ? `${C.cyan}← ROTORQUANT_MODEL_PATH${C.reset}` :
                  f.path === env.TURBO_MMPROJ_PATH       ? `${C.yellow}← TURBO_MMPROJ_PATH (mmproj)${C.reset}` : '';
    const warn  = f.path.includes('sha256-735af')        ? `${C.red}← Gemma3 270M blob — incompatible Gemma4 draft${C.reset}` : '';
    console.log(`  ${gb}GB  ${basename(f.path)}  ${tag}${warn}`);
    console.log(dim(`          ${f.path}`));
  }
}

// ── 3. Lane B — llama-server binary flag probe ─────────────────────────────
function probeLlamaFlags() {
  console.log(hdr('Lane B — llama-server binary flags'));
  const llama = env.LLAMA_SERVER_PATH;
  if (!llama || !existsSync(llama)) {
    console.log(bad(`LLAMA_SERVER_PATH not set or binary not found`));
    console.log(dim(`  Current value: ${llama ?? '(unset)'}`));
    return;
  }
  console.log(dim(`  binary: ${llama}`));

  const r1 = spawnSync(llama, ['--help'], { encoding: 'utf8', timeout: 8000 });
  const r2 = spawnSync(llama, ['-h'],     { encoding: 'utf8', timeout: 8000 });
  const help = (r1.stdout ?? '') + (r2.stdout ?? '') + (r1.stderr ?? '') + (r2.stderr ?? '');

  if (!help.trim()) {
    console.log(bad('binary returned no help output — may be wrong binary or missing DLLs'));
    return;
  }

  const flags = [
    ['--jinja',              'OpenAI function-call tool schema (required for TRACE MCP loop)'],
    ['--cache-prompt',       'slot KV prefix reuse across requests'],
    ['--cache-reuse',        'min overlapping tokens before prefix reuse fires'],
    ['-fa|--flash-attn',     'FlashAttention (required for turbo3/turbo4 V-cache)'],
    ['-kvo|--kv-offload',    'KV cache offload to CPU RAM (helps 8GB VRAM)'],
    ['-ctk|--cache-type-k',  'K-cache quantization type (q8_0 recommended)'],
    ['-ctv|--cache-type-v',  'V-cache quantization type (q8_0 / turbo3 / turbo4)'],
    ['turbo[234]|tbq[34]',   'TurboQuant V-cache compression levels'],
    ['-ngl|--gpu-layers',    'GPU offload layers'],
  ];

  for (const [pat, desc] of flags) {
    const hit = new RegExp(pat).test(help);
    console.log(`  ${hit ? ok(pat.padEnd(26)) : bad(pat.padEnd(26))}  ${dim(desc)}`);
  }
}

// ── 4. Lane B — live server chat + tool_calls ─────────────────────────────
async function probeLiveServer() {
  console.log(hdr('Lane B — live TurboQuant server (:8090)'));
  const base = (env.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');

  // health
  let alive = false;
  try {
    const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    alive = h.ok;
    console.log(alive ? ok(`/health → ${h.status}`) : bad(`/health → ${h.status}`));
  } catch {
    console.log(bad('no response on :8090 — start with: npm run turbo:start:detached'));
    return;
  }
  if (!alive) return;

  const post = async (body, timeoutMs = 30000) => {
    const r = await fetch(`${base}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(timeoutMs),
    });
    return r.json();
  };

  // MODEL_OK probe
  try {
    const j = await post({
      model:       'gemma4-tq',
      messages:    [{ role: 'user', content: 'Reply with exactly MODEL_OK' }],
      temperature: 0,
      max_tokens:  32,
    });
    const reply = j.choices?.[0]?.message?.content ?? '(empty)';
    const pass  = /MODEL_OK/i.test(reply);
    console.log(`  ${pass ? ok('chat completions') : bad('chat completions')}  ${dim(reply.slice(0, 80))}`);
  } catch (e) {
    console.log(bad(`chat completions: ${e.message}`));
  }

  // tool_calls probe
  try {
    const j = await post({
      model:    'gemma4-tq',
      messages: [{ role: 'user', content: 'Call the get_time tool now.' }],
      tools: [{
        type:     'function',
        function: {
          name:        'get_time',
          description: 'Returns the current UTC time.',
          parameters:  { type: 'object', properties: {}, required: [] },
        },
      }],
      tool_choice: 'auto',
      temperature: 0,
      max_tokens:  128,
    });
    const toolCalls = j.choices?.[0]?.message?.tool_calls;
    const has = Array.isArray(toolCalls) && toolCalls.length > 0;
    const preview = has
      ? toolCalls.map(t => t.function?.name ?? '?').join(', ')
      : (j.choices?.[0]?.message?.content ?? '').slice(0, 80);
    console.log(`  ${has ? ok('tool_calls returned') : bad('tool_calls not returned (model may need --jinja)')}  ${dim(preview)}`);
  } catch (e) {
    console.log(bad(`tool_calls probe: ${e.message}`));
  }

  // long output probe (tokens/s sanity check)
  console.log();
  console.log(dim('  Testing token throughput (max_tokens=256 audit prompt) …'));
  try {
    const t0 = Date.now();
    const j  = await post({
      model:       'gemma4-tq',
      messages:    [{ role: 'user', content: 'List 20 specific things to audit in a SvelteKit 2 + Svelte 5 runes codebase. Be concise.' }],
      temperature: 0.1,
      max_tokens:  256,
    }, 60000);
    const ms  = Date.now() - t0;
    const tok = j.usage?.completion_tokens ?? 0;
    const tps = tok > 0 ? (tok / (ms / 1000)).toFixed(1) : '?';
    console.log(`  ${ok(`throughput: ${tps} tok/s`)}  ${dim(`(${tok} tokens in ${ms}ms)`)}`);
  } catch (e) {
    console.log(bad(`throughput probe: ${e.message}`));
  }
}

// ── summary footer ─────────────────────────────────────────────────────────
function printSummary() {
  console.log(hdr('Next steps'));
  console.log(`  1. From Lane A output, find your Hermes model ID and update:`);
  console.log(dim(`     sveltekit-frontend/opencode.json → provider.ollama.models key`));
  console.log(`  2. From Lane C output, confirm which GGUF is set as TURBO_MODEL_PATH`);
  console.log(`  3. If --jinja is missing from Lane B, model uses generic tool-call path`);
  console.log(`  4. Compare lanes:`);
  console.log(dim(`     opencode run -m turboquant/gemma4-tq   --agent trace-audit "Audit Svelte 5 rune risks"`));
  console.log(dim(`     opencode run -m ollama/hermes-agent    --agent audit-hermes "Audit Svelte 5 rune risks"`));
  console.log();
}

// ── main ───────────────────────────────────────────────────────────────────
await probeOllama();
probeGgufFiles();
probeLlamaFlags();
await probeLiveServer();
printSummary();