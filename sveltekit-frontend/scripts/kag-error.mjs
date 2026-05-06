#!/usr/bin/env node
/**
 * kag-error.mjs — KAG error-analysis memory CLI
 *
 * Fingerprints the last error (or explicit text), queries each store with
 * graceful degradation, and writes a structured artifact directory:
 *
 *   memory/runs/YYYY-MM-DD/kag_error_{hash}_{ts}/
 *     task.md
 *     error.summary.json
 *     graph_hits.json
 *     vector_hits.json
 *     ace_hits.json
 *     context_packet.json
 *     next_actions.md
 *     ingest.jsonl
 *
 *   memory/ingest/pending/kag_error_{hash}_{ts}.jsonl  (mirror)
 *
 * Usage (from sveltekit-frontend/):
 *   node scripts/kag-error.mjs --from last
 *   node scripts/kag-error.mjs --from <hash-8>
 *   node scripts/kag-error.mjs --text "Redis memberIds shape mismatch"
 *   node scripts/kag-error.mjs --from last --dry-run --verbose
 *
 * Exits 0 on success (including degraded), 1 only on unrecoverable error.
 */

import { createHash }    from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');              // sveltekit-frontend/

// ── Config (all override-able via env) ────────────────────────────────────────
const REDIS_URL   = process.env.REDIS_URL     ?? 'redis://127.0.0.1:6379';
const PG_URL      = process.env.DATABASE_URL  ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const NEO4J_URL   = process.env.NEO4J_HTTP_URL ?? 'http://localhost:7474';
const NEO4J_USER  = process.env.NEO4J_USER    ?? 'neo4j';
const NEO4J_PASS  = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const QDRANT_URL  = process.env.QDRANT_URL    ?? 'http://localhost:6333';

const DRY_RUN  = process.argv.includes('--dry-run');
const VERBOSE  = process.argv.includes('--verbose');
const LIMIT    = parseInt(getArg('--limit') ?? '8', 10);

// ── Argument parsing ──────────────────────────────────────────────────────────
function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

const fromArg = getArg('--from');   // 'last' | '<hash>'
const textArg = getArg('--text');   // literal error text

// ── Helpers ───────────────────────────────────────────────────────────────────
function fingerprint(text) {
  return createHash('sha1').update(text.slice(0, 2000)).digest('hex').slice(0, 8);
}

function tsLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function log(msg)  { console.log(`  ${msg}`); }
function warn(msg) { console.warn(`  ⚠ ${msg}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }
function degraded(label, reason) {
  warn(`${label} unavailable — ${reason} (writing degraded:true)`);
}

// ── Entity extraction ─────────────────────────────────────────────────────────
function extractEntities(text) {
  const files   = [...new Set([...(text.match(/[\w/-]+\.(ts|js|svelte|go|py|sql|mjs)\b/g) ?? [])])].slice(0, 10);
  const symbols = [...new Set([...(text.match(/\b[A-Z][a-zA-Z0-9]{2,}|[a-z][a-zA-Z0-9]{2,}[A-Z][a-zA-Z0-9]*/g) ?? [])])].slice(0, 20);
  const routeRx = /(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s]+)|(?:fetch|POST|GET)\(['"]([^'"]+)['"]/g;
  const routes  = [];
  let m;
  while ((m = routeRx.exec(text)) !== null) routes.push(m[1] ?? m[2]);
  return { files, symbols, routes: [...new Set(routes)].slice(0, 5) };
}

// ── Data sources (each returns { data, degraded, reason? }) ──────────────────

async function loadFromRedis() {
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 4_000, commandTimeout: 4_000 });
    await redis.connect();

    let errorText = null;
    let source    = 'redis';

    if (fromArg && fromArg !== 'last') {
      const rec = await redis.get(`agent:error-fix:${fromArg}`);
      if (rec) {
        const p = JSON.parse(rec);
        errorText = p.errorText ?? p.diagnosis ?? '';
        source    = `redis:agent:error-fix:${fromArg}`;
      }
    } else {
      // trace:last_run is the primary source (written by trace-collector.ts)
      const raw = await redis.get('trace:last_run');
      if (raw) {
        const p = JSON.parse(raw);
        errorText = p.errorText ?? p.summary ?? raw;
        source    = 'redis:trace:last_run';
      }
      // fall back to most-recent agent:error-fix:* key
      if (!errorText) {
        const keys = (await redis.keys('agent:error-fix:[a-f0-9]*')).sort();
        if (keys.length > 0) {
          const rec = await redis.get(keys[keys.length - 1]);
          if (rec) {
            const p = JSON.parse(rec);
            errorText = p.errorText ?? p.diagnosis ?? '';
            source    = `redis:${keys[keys.length - 1]}`;
          }
        }
      }
    }

    await redis.quit();
    if (errorText) return { errorText, source };
    return null;
  } catch (e) {
    return null;
  }
}

async function queryPostgresFts(queryText, limit) {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: PG_URL, max: 2, connectionTimeoutMillis: 5_000 });
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT * FROM search_code_lexical($1, $2, $3)',
        [queryText, limit, null]
      );
      return {
        data: rows.map(r => ({
          stable_key:  r.stable_key,
          file_path:   r.rel_path,
          score:       r.lexical_score,
          content:     (r.chunk_text ?? '').slice(0, 400),
          topo_class:  r.topo_class ?? '',
        })),
        degraded: false,
      };
    } finally {
      client.release();
      await pool.end();
    }
  } catch (e) {
    degraded('Postgres FTS', e.message);
    return { data: [], degraded: true, reason: e.message };
  }
}

async function queryNeo4jGraph(symbols, files, limit) {
  if (!symbols.length && !files.length) {
    return { data: [], degraded: false };
  }
  try {
    const searchKeys = [
      ...files.slice(0, 3).map(f => `file:${f}`),
      ...symbols.slice(0, 3),
    ];
    const cypher = `
      UNWIND $keys AS k
      MATCH (n) WHERE n.stableKey = k OR n.label CONTAINS k OR n.filePath CONTAINS k
      WITH n LIMIT ${Math.ceil(limit / 2)}
      OPTIONAL MATCH (n)-[r]-(neighbor)
      RETURN n.stableKey AS stableKey, n.label AS label,
             collect({ key: neighbor.stableKey, rel: type(r), label: neighbor.label })[..5] AS neighbors
      LIMIT ${limit}
    `;
    const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
      },
      body: JSON.stringify({ statements: [{ statement: cypher, parameters: { keys: searchKeys } }] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors[0].message);
    const rows = body.results?.[0]?.data ?? [];
    return {
      data: rows.map(d => ({
        stableKey:  d.row?.[0],
        label:      d.row?.[1],
        neighbors:  d.row?.[2] ?? [],
      })),
      degraded: false,
    };
  } catch (e) {
    degraded('Neo4j', e.message);
    return { data: [], degraded: true, reason: e.message };
  }
}

async function queryQdrant(queryText, entities, limit) {
  // Build a keyword-based payload filter — no embedding needed for the CLI pass.
  // A full semantic search would require calling the embedding service.
  // For now we do a Qdrant scroll filtered by file-path overlap.
  if (!entities.files.length) return { data: [], degraded: false };
  try {
    const filter = {
      should: entities.files.slice(0, 5).map(f => ({
        key: 'file_path', match: { value: f },
      })),
    };
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter, limit, with_payload: true, with_vector: false }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Qdrant HTTP ${res.status}`);
    const body = await res.json();
    const points = body.result?.points ?? [];
    return {
      data: points.map(p => ({
        id:        p.id,
        file_path: p.payload?.file_path ?? p.payload?.filePath ?? '',
        score:     p.payload?.pageRankScore ?? 0.5,
        content:   (p.payload?.chunk_text ?? p.payload?.content ?? '').slice(0, 400),
        topo_class: p.payload?.topo_class ?? '',
        cluster:   p.payload?.gpuCluster ?? null,
      })),
      degraded: false,
    };
  } catch (e) {
    degraded('Qdrant', e.message);
    return { data: [], degraded: true, reason: e.message };
  }
}

async function readRedisAceCache(hash) {
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3_000, commandTimeout: 3_000 });
    await redis.connect();
    const raw = await redis.get(`ace:error:${hash}`);
    await redis.quit();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeRedisAceCache(hash, payload) {
  if (DRY_RUN) return;
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3_000, commandTimeout: 3_000 });
    await redis.connect();
    await redis.setex(`ace:error:${hash}`, 86_400, JSON.stringify(payload));
    await redis.quit();
  } catch (e) {
    warn(`Redis ACE write failed — ${e.message}`);
  }
}

// ── Artifact writer ───────────────────────────────────────────────────────────

function writeDir(taskDir, taskId, hash, ts, errorText, entities, ftsResult, graphResult, qdrantResult, aceCache) {
  const date = new Date().toISOString().slice(0, 10);

  const allHits   = [...ftsResult.data, ...qdrantResult.data];
  const topFiles  = [...new Set(allHits.map(h => h.file_path).filter(Boolean))].slice(0, 8);
  const topSymbols = entities.symbols.slice(0, 10);

  const confidence = allHits.length >= 5 ? 0.80
    : allHits.length >= 3 ? 0.65
    : allHits.length >= 1 ? 0.45
    : 0.25;

  const deepResearchNeeded = confidence < 0.50;

  const tags = [...new Set([
    ...entities.symbols.slice(0, 5),
    ...entities.files.map(f => f.split('/').pop().replace(/\.\w+$/, '')),
    ...allHits.slice(0, 3).map(h => h.topo_class).filter(Boolean),
  ])].slice(0, 12);

  // ── error.summary.json ──────────────────────────────────────────────────────
  const errorSummary = {
    type:          'error_summary',
    error_hash:    hash,
    task_id:       taskId,
    source:        fromArg ?? 'cli-text',
    message:       errorText.slice(0, 800),
    tags,
    related_files: topFiles,
    entities: {
      files:    entities.files,
      symbols:  entities.symbols.slice(0, 10),
      routes:   entities.routes,
    },
    confidence,
    created_at: ts,
  };

  // ── graph_hits.json ─────────────────────────────────────────────────────────
  const graphHits = {
    type:       'graph_hits',
    task_id:    taskId,
    degraded:   graphResult.degraded,
    reason:     graphResult.reason ?? null,
    count:      graphResult.data.length,
    hits:       graphResult.data,
    generated_at: ts,
  };

  // ── vector_hits.json ────────────────────────────────────────────────────────
  const vectorHits = {
    type:       'vector_hits',
    task_id:    taskId,
    degraded:   qdrantResult.degraded,
    reason:     qdrantResult.reason ?? null,
    count:      qdrantResult.data.length,
    hits:       qdrantResult.data,
    generated_at: ts,
  };

  // ── ace_hits.json ───────────────────────────────────────────────────────────
  const ftsHits = ftsResult.data.map(h => ({
    kind:    'fts',
    id:      h.file_path,
    score:   h.score,
    content: h.content.slice(0, 200),
    why:     [h.topo_class ? `topo:${h.topo_class}` : 'fts'],
  }));
  const cachedHits = aceCache?.top_hits ?? [];
  const aceHits = {
    type:       'ace_hits',
    task_id:    taskId,
    degraded:   ftsResult.degraded,
    reason:     ftsResult.reason ?? null,
    cache_hit:  aceCache !== null,
    count:      ftsHits.length,
    hits:       ftsHits,
    cached:     cachedHits,
    recommended_next_command: aceCache?.recommended_next_command ?? 'npm run smoke:kag',
    generated_at: ts,
  };

  // ── context_packet.json ─────────────────────────────────────────────────────
  const contextPacket = {
    type:         'context_packet',
    task:         'Diagnose KAG/ACE failure',
    error_hash:   hash,
    task_id:      taskId,
    top_files:    topFiles,
    top_symbols:  topSymbols,
    graph_hits:   graphResult.data.slice(0, 5),
    vector_hits:  qdrantResult.data.slice(0, 5),
    ace_hits:     ftsHits.slice(0, 5),
    deep_research_needed: deepResearchNeeded,
    recommended_next_command: deepResearchNeeded
      ? 'POST /api/ai/agent { query, pipeline: "coding" } — then call kag.record_agent_run with needsDeepResearch:true'
      : 'npm run smoke:kag',
    generated_at: ts,
  };

  // ── task.md ─────────────────────────────────────────────────────────────────
  const taskMd = `# KAG Error Task: ${taskId}

**Date**: ${ts}
**Hash**: ${hash}
**Confidence**: ${confidence}
**Deep research needed**: ${deepResearchNeeded}

## Error
\`\`\`
${errorText.slice(0, 600)}
\`\`\`

## Entities extracted
- **Files**: ${entities.files.slice(0, 5).join(', ') || 'none'}
- **Symbols**: ${entities.symbols.slice(0, 8).join(', ') || 'none'}
- **Routes**: ${entities.routes.join(', ') || 'none'}

## Top ACE hits
${ftsHits.slice(0, 5).map((h, i) => `${i + 1}. \`${h.id}\` (score ${h.score?.toFixed(3) ?? '?'}) — ${h.content.slice(0, 100)}`).join('\n') || '_no hits_'}

## Graph neighbors
${graphResult.degraded ? `_Unavailable: ${graphResult.reason}_` : graphResult.data.slice(0, 3).map(g => `- \`${g.stableKey}\` (${g.label})`).join('\n') || '_none found_'}

## Qdrant vector hits
${qdrantResult.degraded ? `_Unavailable: ${qdrantResult.reason}_` : qdrantResult.data.slice(0, 3).map(v => `- \`${v.file_path}\` (score ${v.score?.toFixed(2) ?? '?'})`).join('\n') || '_none found_'}

## Tags
${tags.join(' · ')}

---
_Generated by kag-error.mjs | memory/runs/${date}/${taskId}/_
`;

  // ── next_actions.md ─────────────────────────────────────────────────────────
  const nextActions = deepResearchNeeded
    ? [
        '1. POST /api/ai/agent with pipeline:"coding" to trigger full Gemma4 agent run',
        '2. Call MCP tool kag.record_agent_run with needsDeepResearch:true',
        '3. Review graph neighborhood: kag.ingest_memory_directory after run',
        '4. Check related patterns: npm run smoke:kag',
      ]
    : [
        `1. Review top file: ${topFiles[0] ?? '(check ace_hits.json)'}`,
        '2. Run related tests against changed files',
        '3. After fix: call kag.record_agent_run with patchResult:"passed"',
        '4. Ingest results: npm run kag:ingest',
      ];

  const nextActionsMd = `# Next Actions: ${taskId}

${deepResearchNeeded ? '> ⚠ **Low confidence — deep research required**\n' : ''}
${nextActions.join('\n')}

## Context for agent
Paste this into POST /api/ai/agent → body.query:

\`\`\`
${errorText.slice(0, 300)}
\`\`\`

Related files: ${topFiles.slice(0, 4).join(', ') || 'unknown'}

---
_Use kag.record_agent_run to close the loop after patching._
`;

  // ── ingest.jsonl (one record per line) ─────────────────────────────────────
  const ingestLines = [
    JSON.stringify({ type: 'error', id: taskId, summary: errorText.slice(0, 300), tags, files: topFiles.slice(0, 8), confidence, generated_at: ts }),
    ...ftsHits.slice(0, 5).map(h => JSON.stringify({ type: 'ace_hit', error_id: taskId, file: h.id, score: h.score, content: h.content })),
  ].join('\n');

  // ── Write files ─────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, 'task.md'),             taskMd);
    writeFileSync(join(taskDir, 'error.summary.json'),  JSON.stringify(errorSummary, null, 2));
    writeFileSync(join(taskDir, 'graph_hits.json'),     JSON.stringify(graphHits, null, 2));
    writeFileSync(join(taskDir, 'vector_hits.json'),    JSON.stringify(vectorHits, null, 2));
    writeFileSync(join(taskDir, 'ace_hits.json'),       JSON.stringify(aceHits, null, 2));
    writeFileSync(join(taskDir, 'context_packet.json'), JSON.stringify(contextPacket, null, 2));
    writeFileSync(join(taskDir, 'next_actions.md'),     nextActionsMd);
    writeFileSync(join(taskDir, 'ingest.jsonl'),        ingestLines);
  }

  return { errorSummary, contextPacket, tags, topFiles, confidence, deepResearchNeeded };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== KAG Error Analysis ===');

  // 1. Resolve error text
  let errorText;
  let loadedSource;

  if (textArg) {
    errorText    = textArg;
    loadedSource = 'cli-text';
  } else {
    const redisLoad = await loadFromRedis();
    if (redisLoad) {
      errorText    = redisLoad.errorText;
      loadedSource = redisLoad.source;
    } else {
      // No error found — write a clean no-op artifact
      errorText    = `No error found. Run with --text "<message>" or ensure trace:last_run is set in Redis.`;
      loadedSource = 'none';
      warn('No error source found — writing no-op artifact');
    }
  }

  const hash   = fingerprint(errorText);
  const ts     = new Date().toISOString();
  const tsShort = tsLabel();
  const taskId = `kag_error_${hash}_${tsShort}`;
  const date   = ts.slice(0, 10);

  const runDir  = join(ROOT, 'memory', 'runs', date, taskId);
  const pendDir = join(ROOT, 'memory', 'ingest', 'pending');
  const pendFile = join(pendDir, `${taskId}.jsonl`);

  log(`Source:  ${loadedSource}`);
  log(`Hash:    ${hash}`);
  log(`Task ID: ${taskId}`);
  if (VERBOSE) log(`Error:   ${errorText.slice(0, 200)}`);

  // 2. Extract entities
  const entities = extractEntities(errorText);
  log(`Entities: ${entities.files.length} files, ${entities.symbols.length} symbols, ${entities.routes.length} routes`);

  // 3. Build search query from entities + error prefix
  const searchQuery = [
    ...entities.symbols.slice(0, 4),
    ...entities.files.slice(0, 2).map(f => f.replace(/\.\w+$/, '')),
    errorText.slice(0, 100),
  ].join(' ');

  // 4. Query all sources (parallel, each degrades independently)
  log('Querying data sources...');
  const [ftsResult, graphResult, qdrantResult, aceCache] = await Promise.all([
    queryPostgresFts(searchQuery, LIMIT),
    queryNeo4jGraph(entities.symbols, entities.files, LIMIT),
    queryQdrant(searchQuery, entities, LIMIT),
    readRedisAceCache(hash),
  ]);

  ok(`FTS: ${ftsResult.data.length} hits${ftsResult.degraded ? ' (degraded)' : ''}`);
  ok(`Neo4j: ${graphResult.data.length} nodes${graphResult.degraded ? ' (degraded)' : ''}`);
  ok(`Qdrant: ${qdrantResult.data.length} points${qdrantResult.degraded ? ' (degraded)' : ''}`);
  ok(`ACE cache: ${aceCache ? 'HIT' : 'miss'}`);

  // 5. Write artifact directory
  if (DRY_RUN) {
    log(`[dry-run] Would write: memory/runs/${date}/${taskId}/ (8 files)`);
    log(`[dry-run] Would mirror: memory/ingest/pending/${taskId}.jsonl`);
  } else {
    mkdirSync(pendDir, { recursive: true });
  }

  const { errorSummary, contextPacket, tags, topFiles, confidence, deepResearchNeeded } =
    writeDir(runDir, taskId, hash, ts, errorText, entities, ftsResult, graphResult, qdrantResult, aceCache);

  // 6. Mirror ingest JSONL to pending dir
  const pendingLine = JSON.stringify({
    type: 'error', id: taskId, summary: errorText.slice(0, 300),
    tags, files: topFiles.slice(0, 8), confidence,
    needsDeepResearch: deepResearchNeeded, generated_at: ts,
  });
  if (!DRY_RUN) {
    writeFileSync(pendFile, pendingLine);
    ok(`Artifacts → memory/runs/${date}/${taskId}/ (8 files)`);
    ok(`Ingest   → memory/ingest/pending/${taskId}.jsonl`);
  }

  // 7. Update Redis ACE quick-hit cache
  const aceCachePayload = {
    error_hash:   hash,
    task_id:      taskId,
    top_hits: ftsResult.data.slice(0, 5).map(h => ({
      kind:  'file',
      id:    h.file_path,
      score: h.score,
      why:   [h.topo_class ? `topo:${h.topo_class}` : 'fts', 'kag-error-run'],
    })),
    tags,
    confidence,
    recommended_next_command: contextPacket.recommended_next_command,
    generated_at: ts,
  };
  await writeRedisAceCache(hash, aceCachePayload);
  if (!DRY_RUN) ok(`Redis   → ace:error:${hash} (TTL 24h)`);

  // 8. Summary
  console.log('');
  console.log(`=== KAG run complete — ${taskId} ===`);
  console.log(`  Confidence: ${confidence}`);
  console.log(`  FTS hits:   ${ftsResult.data.length}`);
  console.log(`  Graph nodes: ${graphResult.data.length}`);
  console.log(`  Qdrant pts: ${qdrantResult.data.length}`);
  if (deepResearchNeeded) {
    console.log('');
    console.log('  ⚠ Low confidence — escalation recommended:');
    console.log('    npm run kag:ingest');
    console.log('    POST /api/ai/agent { query, pipeline: "coding" }');
    console.log('    MCP: kag.record_agent_run { needsDeepResearch: true }');
  }
  console.log('');
  console.log(`  Artifacts:  memory/runs/${date}/${taskId}/`);
  console.log(`  Start here: memory/runs/${date}/${taskId}/next_actions.md`);
}

main().catch(e => { console.error('✗ FATAL:', e.message); process.exit(1); });
