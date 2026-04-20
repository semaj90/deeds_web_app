#!/usr/bin/env node
/**
 * test-langgraph-wiring.mjs
 *
 * Validates the LangGraph synthesis service wiring end-to-end:
 *   1. Direct health check against Docker service (port 8091)
 *   2. HMM stats endpoint
 *   3. Direct synthesis (JSON) against Docker service
 *   4. Direct synthesis (SSE stream) against Docker service
 *   5. Proxied synthesis via SvelteKit /api/synthesis/generate (JSON)
 *   6. Proxied synthesis via SvelteKit /api/synthesis/generate?stream=true (SSE)
 *
 * Usage:
 *   node scripts/tests/test-langgraph-wiring.mjs
 *   node scripts/tests/test-langgraph-wiring.mjs --sveltekit-only   (skip direct Docker tests)
 *   node scripts/tests/test-langgraph-wiring.mjs --docker-only      (skip SvelteKit proxy tests)
 *   node scripts/tests/test-langgraph-wiring.mjs --base http://localhost:3000
 *   node scripts/tests/test-langgraph-wiring.mjs --langgraph http://localhost:8091
 */

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const lgIdx = args.indexOf('--langgraph');
const SVELTEKIT_BASE = baseIdx !== -1 ? args[baseIdx + 1] : 'http://localhost:5173';
const LANGGRAPH_BASE = lgIdx !== -1 ? args[lgIdx + 1] : 'http://localhost:8091';
const SVELTEKIT_ONLY = args.includes('--sveltekit-only');
const DOCKER_ONLY = args.includes('--docker-only');

const pad = (s, w = 55) => s.slice(0, w).padEnd(w);
let pass = 0;
let fail = 0;
let skip = 0;

function log(status, label, detail = '') {
  const icon = status === 'ok' ? '\u2705' : status === 'skip' ? '\u23ED\uFE0F ' : '\u274C';
  console.log(`${icon}  ${pad(label)} ${detail}`);
  if (status === 'ok') pass++;
  else if (status === 'skip') skip++;
  else fail++;
}

async function fetchJSON(url, opts = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      ...opts,
      signal: AbortSignal.timeout(120_000),
      headers: {
        'Content-Type': 'application/json',
        'x-dev-bypass': 'true',
        ...(opts.headers ?? {}),
      },
    });
    const ms = Math.round(performance.now() - t0);
    return { res, ms, ok: true };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    return { res: null, ms, ok: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1: Direct Docker Service Tests
// ═══════════════════════════════════════════════════════════════════════════════

async function testDockerHealth() {
  console.log('\n\u2500\u2500\u2500 Phase 1: Docker Service Direct Tests \u2500\u2500\u2500\n');

  // Test 1: Health
  const { res, ms, ok } = await fetchJSON(`${LANGGRAPH_BASE}/health`);
  if (!ok) {
    log('fail', 'Docker health check', `UNREACHABLE (${ms}ms) \u2014 is the service running?`);
    console.log(`  \u2514\u2500 Start with: docker compose --profile gpu up -d langgraph-synthesis`);
    return false;
  }
  if (!res.ok) {
    log('fail', 'Docker health check', `HTTP ${res.status} (${ms}ms)`);
    return false;
  }
  const health = await res.json();
  log('ok', 'Docker health check', `${health.status} (${ms}ms) GPU=${health.gpu} VRAM=${health.vram_free_mb ?? '?'}MB`);

  // Sub-checks — only test services present in health response
  for (const svc of ['ollama', 'qdrant', 'redis', 'bifrost']) {
    const status = health[svc] ?? 'unknown';
    log(status === 'ok' || status === 'healthy' ? 'ok' : 'fail', `  ${svc}`, status);
  }
  // Optional services — skip if not present (neo4j may not be running)
  if (health.neo4j) {
    log(health.neo4j === 'ok' ? 'ok' : 'fail', '  neo4j', health.neo4j);
  } else {
    log('skip', '  neo4j', 'not in health response (optional)');
  }
  if (health.rg_available != null) {
    log(health.rg_available ? 'ok' : 'skip', '  ripgrep (codebase search)', String(health.rg_available));
  }
  if (health.ollama_models) {
    log('ok', '  ollama models', `${health.ollama_models.length} loaded`);
  }

  return true;
}

async function testDockerHMMStats() {
  const { res, ms, ok } = await fetchJSON(`${LANGGRAPH_BASE}/hmm/stats`);
  if (!ok || !res.ok) {
    log('fail', 'HMM stats endpoint', ok ? `HTTP ${res.status}` : 'unreachable');
    return;
  }
  const stats = await res.json();
  log('ok', 'HMM stats endpoint', `${stats.states?.length ?? 0} states, redis=${stats.redis_persisted} (${ms}ms)`);
  if (stats.top_emission_words) {
    const first = Object.entries(stats.top_emission_words)[0];
    if (first) {
      console.log(`    \u2514\u2500 ${first[0]}: ${(first[1]).slice(0, 5).join(', ')}...`);
    }
  }
}

async function testDockerSynthesize() {
  console.log('');
  const query = 'What is hearsay evidence under the Federal Rules of Evidence?';
  const { res, ms, ok } = await fetchJSON(`${LANGGRAPH_BASE}/synthesize`, {
    method: 'POST',
    body: JSON.stringify({ query, temperature: 0.3, max_tokens: 512 }),
  });
  if (!ok || !res.ok) {
    log('fail', 'Docker synthesize (JSON)', ok ? `HTTP ${res.status}` : 'unreachable');
    return;
  }
  const data = await res.json();
  log('ok', 'Docker synthesize (JSON)', [
    `${ms}ms`,
    `cache=${data.cache}`,
    `conf=${data.confidence?.toFixed(2)}`,
    `rag=${data.rag_hits}`,
    `kag=${data.kag_neighbors}`,
    `web=${data.web_results}`,
    data.grpo_reward_score != null ? `grpo=${data.grpo_reward_score.toFixed(3)}` : '',
  ].filter(Boolean).join(' '));
  console.log(`    \u2514\u2500 Answer: ${data.answer?.slice(0, 120)}...`);
}

async function testDockerStream() {
  const query = 'Explain the exclusionary rule in criminal procedure.';
  try {
    const res = await fetch(`${LANGGRAPH_BASE}/synthesize/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, temperature: 0.3, max_tokens: 256 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok || !res.body) {
      log('fail', 'Docker synthesize (SSE stream)', `HTTP ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const stages = [];
    let tokenCount = 0;
    let doneEvent = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.stage === 'llm' && evt.token) tokenCount++;
          else if (evt.stage === 'done') doneEvent = evt;
          else if (evt.stage && evt.status) stages.push(`${evt.stage}:${evt.status}`);
        } catch {}
      }
    }
    reader.releaseLock();

    if (doneEvent) {
      log('ok', 'Docker synthesize (SSE stream)', [
        `stages=[${stages.join(',')}]`,
        `tokens=${tokenCount}`,
        `conf=${doneEvent.confidence?.toFixed(2)}`,
        `cache=${doneEvent.cache}`,
      ].join(' '));
    } else {
      log('fail', 'Docker synthesize (SSE stream)', `No 'done' event received (got ${stages.length} stages, ${tokenCount} tokens)`);
    }
  } catch (err) {
    log('fail', 'Docker synthesize (SSE stream)', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2: SvelteKit Proxy Tests
// ═══════════════════════════════════════════════════════════════════════════════

async function testSvelteKitProxy() {
  console.log('\n\u2500\u2500\u2500 Phase 2: SvelteKit Proxy Tests (/api/synthesis/generate) \u2500\u2500\u2500\n');

  // Check dev server is up
  const { ok: devUp } = await fetchJSON(`${SVELTEKIT_BASE}/api/health`);
  if (!devUp) {
    log('fail', 'SvelteKit dev server', `UNREACHABLE at ${SVELTEKIT_BASE}`);
    console.log(`  \u2514\u2500 Start with: cd sveltekit-frontend && npm run dev`);
    return;
  }
  log('ok', 'SvelteKit dev server', 'reachable');

  // JSON synthesis via proxy
  const query = 'What is the standard for summary judgment under FRCP Rule 56?';
  const { res, ms, ok } = await fetchJSON(`${SVELTEKIT_BASE}/api/synthesis/generate`, {
    method: 'POST',
    body: JSON.stringify({ query, temperature: 0.3, maxTokens: 512 }),
  });
  if (!ok || !res.ok) {
    const body = ok && res ? await res.text().catch(() => '') : '';
    log('fail', 'SvelteKit synthesis (JSON)', `${ok ? `HTTP ${res.status}` : 'unreachable'} ${body.slice(0, 100)}`);
    return;
  }
  const data = await res.json();

  // Detect which path was used
  const isLangGraph = data.aceSource === 'fresh' && data.contextSources?.hasWebSearch;
  const path = isLangGraph ? 'LangGraph' : data.status === 'pending' ? 'RabbitMQ' : 'in-process';
  log('ok', 'SvelteKit synthesis (JSON)', [
    `${ms}ms`,
    `path=${path}`,
    `conf=${data.confidence?.toFixed(2) ?? '?'}`,
    `rag=${data.contextSources?.ragChunks ?? '?'}`,
  ].join(' '));
  if (data.answer) {
    console.log(`    \u2514\u2500 Answer: ${data.answer.slice(0, 120)}...`);
  }

  // SSE stream via proxy
  console.log('');
  const streamQuery = 'Explain Miranda rights and their application.';
  try {
    const streamRes = await fetch(`${SVELTEKIT_BASE}/api/synthesis/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-bypass': 'true',
      },
      body: JSON.stringify({ query: streamQuery, stream: true, temperature: 0.3, maxTokens: 256 }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!streamRes.ok || !streamRes.body) {
      log('fail', 'SvelteKit synthesis (SSE stream)', `HTTP ${streamRes.status}`);
      return;
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const events = [];
    let chunkCount = 0;
    let gotComplete = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const evtName = line.slice(7).trim();
          if (evtName === 'synthesis_chunk') chunkCount++;
          else if (evtName === 'complete') gotComplete = true;
          else events.push(evtName);
        }
      }
    }
    reader.releaseLock();

    if (gotComplete) {
      log('ok', 'SvelteKit synthesis (SSE stream)', `events=[${events.join(',')}] chunks=${chunkCount}`);
    } else {
      log('fail', 'SvelteKit synthesis (SSE stream)', `No 'complete' event (got ${events.length} events, ${chunkCount} chunks)`);
    }
  } catch (err) {
    log('fail', 'SvelteKit synthesis (SSE stream)', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('=== LangGraph Synthesis Wiring Test ===');
  console.log(`Docker:    ${LANGGRAPH_BASE}`);
  console.log(`SvelteKit: ${SVELTEKIT_BASE}`);
  console.log(`Mode:      ${SVELTEKIT_ONLY ? 'SvelteKit only' : DOCKER_ONLY ? 'Docker only' : 'full'}`);

  if (!SVELTEKIT_ONLY) {
    const healthy = await testDockerHealth();
    if (healthy) {
      await testDockerHMMStats();
      await testDockerSynthesize();
      await testDockerStream();
    }
  }

  if (!DOCKER_ONLY) {
    await testSvelteKitProxy();
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed, ${skip} skipped ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});