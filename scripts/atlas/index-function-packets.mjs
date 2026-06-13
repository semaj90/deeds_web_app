#!/usr/bin/env node
/**
 * index-function-packets.mjs
 *
 * Emits one atlas_packet per top-level function in a source file, ingesting into
 * Postgres (atlas_packets), Qdrant (codebase_chunks_768), Neo4j (Function + CALLS
 * edges) and Redis (bifrost:packet:{packet_key}).
 *
 * First-pass scope: ONLY indexes
 *   sveltekit-frontend/src/routes/api/atlas/search/+server.ts
 * which is the cascade route — the single most important file in the codebase.
 * Future passes will batch the rest of the repo.
 *
 * Each function packet matches the canonical lineage contract:
 *
 *   directory_path → source_ref → file_path → function_symbol →
 *      feature_id → feature_label → packet_key → summary →
 *      embedding (qdrant_point_id) → cache (redis_key) → cold_storage (manifest_id)
 *
 * packet_key  = sha256(`function:${source_ref}`).slice(0,16)
 * source_ref  = `<file_path>#<function_symbol>`
 * feature_id  = `atlas.search`
 *
 * Concept taxonomy (closed set, do not extend in this pass):
 *   ann, retrieval, qdrant, neo4j, embedding, rrf, rerank, xgboost, gpu, cuda,
 *   simd, turbovec, cosine, graph, expansion, cross_encoder, gemma, llm, cache,
 *   redis, freshness, pagerank, concept_overlap, scoring
 *
 * Gates (after --apply):
 *   PASS  ≥ 10 functions discovered in the cascade route
 *   PASS  100% packets have directory_path / source_ref / file_path /
 *         function_symbol / feature_id / feature_label / packet_key / summary
 *   PASS  0 packets with empty summary
 *   PASS  Postgres insert count == discovered count
 *
 * Usage:
 *   node scripts/atlas/index-function-packets.mjs
 *   node scripts/atlas/index-function-packets.mjs --apply
 *   node scripts/atlas/index-function-packets.mjs --apply --verbose
 *   node scripts/atlas/index-function-packets.mjs --limit-file=<absolute path>
 *   node scripts/atlas/index-function-packets.mjs --apply --no-qdrant --no-neo4j
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const APPLY     = process.argv.includes('--apply');
const VERBOSE   = process.argv.includes('--verbose');
const NO_QDRANT = process.argv.includes('--no-qdrant');
const NO_NEO4J  = process.argv.includes('--no-neo4j');
const NO_REDIS  = process.argv.includes('--no-redis');
const DRY_RUN   = !APPLY;

const limitFileArg = process.argv.find(a => a.startsWith('--limit-file='));
const CASCADE_REL  = 'sveltekit-frontend/src/routes/api/atlas/search/+server.ts';
const TARGET_FILE  = limitFileArg
  ? limitFileArg.slice('--limit-file='.length)
  : join(ROOT, CASCADE_REL);

// ── Service config ────────────────────────────────────────────────────────────
const DATABASE_URL  = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL    = process.env.QDRANT_URL   || 'http://localhost:6333';
const NEO4J_URL     = process.env.NEO4J_URL    || 'http://localhost:7474';
const NEO4J_USER    = process.env.NEO4J_USER   || 'neo4j';
const NEO4J_PASS    = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j123';
const EMBED_URL     = process.env.EMBED_URL    || 'http://127.0.0.1:5173/api/embed';
const _ollamaRaw    = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL    = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;
const COLLECTION    = 'codebase_chunks_768';

// ── Concept taxonomy (closed) ─────────────────────────────────────────────────
const CONCEPT_VOCAB = new Set([
  'ann', 'retrieval', 'qdrant', 'neo4j', 'embedding', 'rrf', 'rerank',
  'xgboost', 'gpu', 'cuda', 'simd', 'turbovec', 'cosine', 'graph',
  'expansion', 'cross_encoder', 'gemma', 'llm', 'cache', 'redis',
  'freshness', 'pagerank', 'concept_overlap', 'scoring',
]);

// Hand-curated per-function concept hints for the cascade route.
// Anything not listed falls back to body-scan keyword matching.
const FUNCTION_CONCEPT_HINTS = {
  freshnessScore:     ['freshness', 'scoring'],
  jaccard:            ['concept_overlap', 'scoring'],
  rrfScore:           ['rrf', 'scoring'],
  embedQuery:         ['embedding', 'gemma', 'llm'],
  qdrantSearch:       ['ann', 'retrieval', 'qdrant'],
  turbovecRerank:     ['rerank', 'turbovec', 'simd', 'cosine'],
  neo4jExpand:        ['neo4j', 'graph', 'expansion'],
  buildCascadeScore:  ['rrf', 'scoring', 'pagerank', 'concept_overlap', 'freshness'],
  xgboostRerank:      ['rerank', 'xgboost', 'scoring'],
  crossEncoderRerank: ['rerank', 'cross_encoder', 'gemma', 'llm'],
  POST:               ['retrieval', 'ann', 'qdrant', 'neo4j', 'rerank', 'rrf'],
};

// Per-function calls map (deterministic, derived from a manual read of the file).
// Avoids hallucinating from regex-only scans. Format follows the spec:
//   internal-same-file: bare symbol name
//   gRPC service:       'TurboVecService.Search'
//   HTTP sidecar:       'xgboost-sidecar:/score' / 'gemma4:/v1/chat/completions'
//                       'ollama:/api/embeddings'
//   store:              'qdrant:<collection>' / 'neo4j:<edge>' / 'redis:<key>'
const FUNCTION_CALLS = {
  freshnessScore:     [],
  jaccard:            [],
  rrfScore:           [],
  embedQuery:         ['ollama:/api/embeddings'],
  qdrantSearch:       ['qdrant:codebase_chunks_768'],
  turbovecRerank:     ['TurboVecService.Search'],
  neo4jExpand:        ['neo4j:USED_CONCEPT'],
  buildCascadeScore:  ['jaccard', 'freshnessScore'],
  xgboostRerank:      ['xgboost-sidecar:/health', 'xgboost-sidecar:/score'],
  crossEncoderRerank: ['gemma4:/v1/chat/completions'],
  POST:               [
    'embedQuery',
    'qdrantSearch',
    'turbovecRerank',
    'neo4jExpand',
    'buildCascadeScore',
    'jaccard',
    'xgboostRerank',
    'crossEncoderRerank',
    'redis:gpu:karpathy:scores',
  ],
};

const FEATURE_ID    = 'atlas.search';
const FEATURE_LABEL = 'Atlas Search Cascade';
const DOMAIN_CLASS  = 'rag_retrieval';

// ── Path helpers (POSIX-form for the canonical contract) ─────────────────────
function toRepoRel(absPath) {
  // Normalise to forward-slash POSIX-style relative path (matches Qdrant payload conv.)
  return absPath
    .replace(/\\/g, '/')
    .replace(ROOT.replace(/\\/g, '/') + '/', '');
}

function packetKeyFor(sourceRef) {
  return createHash('sha256').update(`function:${sourceRef}`).digest('hex').slice(0, 16);
}

// ── Function extraction (regex + JSDoc reader, no TS compiler dep) ──────────
/**
 * Returns array of: { symbol, declStart (line idx), declEnd (line idx), bodyStart, bodyEnd }
 *
 * Recognises:
 *   - `function NAME(`               (optionally `async`/`export`)
 *   - `export const NAME: RequestHandler = async (...) => {`
 * Top-level only (column 0 declarations).
 */
function extractFunctions(source) {
  const lines = source.split(/\r?\n/);
  const funcs = [];

  // Top-level named function declarations (column 0)
  const funcRe = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(/;
  // SvelteKit RequestHandler exports: `export const POST: RequestHandler = async (...)`
  const handlerRe = /^export\s+const\s+([A-Z][A-Z0-9_]*)\s*:\s*RequestHandler\s*=/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = line.match(funcRe) || line.match(handlerRe);
    if (!m) continue;
    const symbol = m[1];
    // Find the opening brace of the function body
    let openIdx = i;
    let openCol = -1;
    for (let j = i; j < Math.min(i + 8, lines.length); j++) {
      const k = lines[j].indexOf('{');
      if (k !== -1) { openIdx = j; openCol = k; break; }
    }
    if (openCol === -1) continue;

    // Brace-balance scan to find body end
    let depth = 0;
    let endIdx = openIdx;
    for (let j = openIdx; j < lines.length; j++) {
      const l = lines[j];
      for (let c = (j === openIdx ? openCol : 0); c < l.length; c++) {
        const ch = l[c];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { endIdx = j; j = lines.length; break; }
        }
      }
    }

    funcs.push({
      symbol,
      declStart: i,
      bodyStart: openIdx,
      bodyEnd:   endIdx,
    });

    // Skip ahead so nested closures don't get picked up as top-level
    i = endIdx;
  }
  return funcs;
}

/**
 * Pull the first JSDoc block immediately above `declLineIdx` (if any).
 * Returns the joined content with leading `*`s stripped, or null.
 */
function jsdocAbove(lines, declLineIdx) {
  let j = declLineIdx - 1;
  // Skip blank lines
  while (j >= 0 && lines[j].trim() === '') j--;
  if (j < 0 || !lines[j].trim().endsWith('*/')) return null;
  // Walk up to the matching /**
  let endLine = j;
  let startLine = j;
  while (startLine >= 0 && !lines[startLine].trim().startsWith('/**')) startLine--;
  if (startLine < 0) return null;
  const block = lines.slice(startLine, endLine + 1)
    .map(l => l.replace(/^\s*\/?\*+\/?/, '').replace(/\*\/$/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return block || null;
}

/**
 * First non-trivial comment line inside the body (`// ...` or `/* ... *​/`).
 */
function firstBodyComment(lines, bodyStart, bodyEnd) {
  for (let j = bodyStart + 1; j <= bodyEnd; j++) {
    const t = lines[j].trim();
    if (t.startsWith('//')) {
      const c = t.replace(/^\/\/+\s*/, '').replace(/[─━=]{2,}/g, '').trim();
      if (c.length > 6) return c;
    }
    if (t.startsWith('/*')) {
      const c = t.replace(/^\/\*+\s*/, '').replace(/\*+\/\s*$/, '').trim();
      if (c.length > 6) return c;
    }
  }
  return null;
}

function summarizeFunction(fnSymbol, lines, decl) {
  // 1. JSDoc immediately above declaration
  const jsd = jsdocAbove(lines, decl.declStart);
  if (jsd) {
    const sentence = jsd.split(/(?<=[.!?])\s+/)[0] ?? jsd;
    return sentence.slice(0, 200);
  }
  // 2. First comment inside the body
  const inner = firstBodyComment(lines, decl.bodyStart, decl.bodyEnd);
  if (inner) return inner.slice(0, 200);
  // 3. Deterministic fallback
  return `Function ${fnSymbol} in ${toRepoRel(TARGET_FILE)}.`;
}

function conceptsFor(fnSymbol, summary) {
  const hints = FUNCTION_CONCEPT_HINTS[fnSymbol] ?? [];
  const validated = hints.filter(h => CONCEPT_VOCAB.has(h));
  if (validated.length > 0) return validated;
  // Body-keyword fallback against the closed vocab
  const lowered = (summary || '').toLowerCase();
  const found = [];
  for (const c of CONCEPT_VOCAB) {
    if (lowered.includes(c.replace('_', ' ')) || lowered.includes(c)) {
      found.push(c);
    }
  }
  return found.slice(0, 6);
}

function callsFor(fnSymbol) {
  return FUNCTION_CALLS[fnSymbol] ?? [];
}

// ── Embedding ────────────────────────────────────────────────────────────────
async function embedViaDevServer(text) {
  try {
    const res = await fetch(EMBED_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text }),
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const v = Array.isArray(d.embedding) ? d.embedding
            : Array.isArray(d.vector)    ? d.vector
            : Array.isArray(d.data)      ? d.data
            : null;
    return Array.isArray(v) && v.length === 768 ? v : null;
  } catch {
    return null;
  }
}

async function embedViaOllama(text) {
  for (const model of ['nomic-embed-text:latest', 'embeddinggemma:latest']) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, prompt: text.slice(0, 1024) }),
        signal:  AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (Array.isArray(d.embedding) && d.embedding.length === 768) return d.embedding;
    } catch { /* try next */ }
  }
  return null;
}

async function embed(text) {
  return (await embedViaDevServer(text)) ?? (await embedViaOllama(text));
}

// ── Neo4j helper (HTTP tx endpoint) ──────────────────────────────────────────
async function neo4j(stmt, params = {}) {
  try {
    const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
      },
      body:    JSON.stringify({ statements: [{ statement: stmt, parameters: params }] }),
      signal:  AbortSignal.timeout(15_000),
    });
    const d = await res.json();
    if (d.errors?.length) throw new Error(d.errors[0].message);
    return d.results?.[0]?.data ?? [];
  } catch (err) {
    return { error: err.message };
  }
}

async function qdrantUpsert(points) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ points }),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Qdrant upsert HTTP ${res.status}`);
  return (await res.json()).result;
}

// ── Build packet from a function declaration ─────────────────────────────────
function buildPacket(fn, lines, filePathRel) {
  const summary       = summarizeFunction(fn.symbol, lines, fn);
  const sourceRef     = `${filePathRel}#${fn.symbol}`;
  const directoryPath = posix.dirname(filePathRel);
  const packetKey     = packetKeyFor(sourceRef);
  const functionId    = `${FEATURE_ID}.${fn.symbol}`;
  const conceptIds    = conceptsFor(fn.symbol, summary);
  const calls         = callsFor(fn.symbol);
  const redisKey      = `bifrost:packet:${packetKey}`;
  const numericId     = parseInt(packetKey.slice(0, 8), 16);

  return {
    // Canonical lineage contract — every field present, null when unknown
    directory_path:   directoryPath,
    source_ref:       sourceRef,
    file_path:        filePathRel,
    function_symbol:  fn.symbol,
    function_id:      functionId,
    feature_id:       FEATURE_ID,
    feature_label:    FEATURE_LABEL,
    packet_key:       packetKey,
    summary,
    qdrant_point_id:  numericId,         // filled by upsert; embedding may fail → still kept
    redis_key:        redisKey,
    manifest_id:      null,              // cold storage not in this pass

    // Packet kind
    packet_kind:  'function',
    domain_class: DOMAIN_CLASS,
    community_id: null,
    concept_ids:  conceptIds,
    calls,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n═══ Function Packets — ${DRY_RUN ? 'DRY RUN' : 'APPLY'} ═══\n`);

  if (!existsSync(TARGET_FILE)) {
    console.error(`✗ Target file does not exist: ${TARGET_FILE}`);
    process.exit(2);
  }

  const absPath  = TARGET_FILE.replace(/\\/g, '/');
  const filePathRel = toRepoRel(absPath);
  console.log(`Source file: ${filePathRel}`);

  const source = readFileSync(TARGET_FILE, 'utf8');
  const lines  = source.split(/\r?\n/);

  // ── 1. Extract functions ───────────────────────────────────────────────────
  const decls   = extractFunctions(source);
  const packets = decls.map(d => buildPacket(d, lines, filePathRel));

  console.log(`\nDiscovered ${packets.length} top-level function(s).\n`);
  if (VERBOSE) {
    for (const p of packets) {
      console.log(`  • ${p.function_symbol.padEnd(22)} key=${p.packet_key}  concepts=[${p.concept_ids.join(',')}]`);
      console.log(`    summary: ${p.summary.slice(0, 90)}`);
    }
    console.log();
  }

  // ── 2. Pre-gate (structural) ───────────────────────────────────────────────
  const required = [
    'directory_path', 'source_ref', 'file_path', 'function_symbol',
    'feature_id', 'feature_label', 'packet_key', 'summary',
  ];
  const structurallyOk = packets.every(p =>
    required.every(k => typeof p[k] === 'string' && p[k].length > 0)
  );
  const emptySummary = packets.filter(p => !p.summary || p.summary.length === 0).length;

  console.log(`Pre-gate:`);
  console.log(`  functions discovered  : ${packets.length}  (gate ≥10)`);
  console.log(`  contract fields filled: ${structurallyOk ? 'YES' : 'NO'}`);
  console.log(`  empty summaries       : ${emptySummary}  (gate =0)`);

  if (DRY_RUN) {
    writeReport(packets, { inserted: 0, qdrant: 0, neo4j: 0, redis: 0, callsEdges: 0 }, true);
    console.log(`\n(dry-run) Would write ${packets.length} function packets`);
    console.log(`             across Postgres / Qdrant / Neo4j / Redis.\n`);
    return;
  }

  // ── 3. Postgres insert ─────────────────────────────────────────────────────
  console.log(`\nInserting into atlas_packets…`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  const now = new Date().toISOString();
  let inserted = 0;
  for (const p of packets) {
    const payload = {
      packet_kind:     p.packet_kind,
      directory_path:  p.directory_path,
      file_path:       p.file_path,
      function_symbol: p.function_symbol,
      function_id:     p.function_id,
      feature_label:   p.feature_label,
      domain_class:    p.domain_class,
      concept_ids:     p.concept_ids,
      calls:           p.calls,
      qdrant_point_id: p.qdrant_point_id,
      redis_key:       p.redis_key,
      manifest_id:     p.manifest_id,
      created_at:      now,
    };
    try {
      await pool.query(
        `
        INSERT INTO atlas_packets
          (packet_id, artifact_id, packet_key, source_ref, feature_id, community_id,
           summary, payload, source_kind, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW(), NOW())
        ON CONFLICT (packet_id) DO UPDATE SET
          summary    = EXCLUDED.summary,
          payload    = EXCLUDED.payload,
          source_ref = EXCLUDED.source_ref,
          feature_id = EXCLUDED.feature_id,
          packet_key = EXCLUDED.packet_key,
          source_kind = EXCLUDED.source_kind,
          updated_at = NOW()
        `,
        [
          p.packet_key, p.source_ref, p.packet_key, p.source_ref,
          p.feature_id, p.community_id, p.summary,
          JSON.stringify(payload), p.packet_kind,
        ],
      );
      inserted++;
    } catch (err) {
      console.warn(`  skip ${p.packet_key} (${p.function_symbol}): ${err.message}`);
    }
  }
  console.log(`  inserted/updated: ${inserted}/${packets.length}`);

  // ── 4. Qdrant upsert ───────────────────────────────────────────────────────
  let qdrantOk = 0;
  if (!NO_QDRANT) {
    console.log(`\nUpserting into Qdrant ${COLLECTION}…`);
    let dim768 = true;
    try {
      const info = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5_000) });
      const d = await info.json();
      const sz = d.result?.config?.params?.vectors?.content?.size
              ?? d.result?.config?.params?.vectors?.size
              ?? 768;
      dim768 = sz === 768;
    } catch { dim768 = false; }

    if (!dim768) {
      console.log(`  Qdrant collection dimension mismatch — skipping vector upsert`);
    } else {
      const points = [];
      for (const p of packets) {
        const vec = await embed(`${p.function_symbol} ${p.summary} ${p.concept_ids.join(' ')}`);
        if (!vec) {
          if (VERBOSE) console.warn(`  no embedding for ${p.function_symbol} — Postgres row only`);
          continue;
        }
        points.push({
          id:     p.qdrant_point_id,
          vector: { content: vec },
          payload: {
            // Canonical lineage contract — every field present
            directory_path:  p.directory_path,
            source_ref:      p.source_ref,
            file_path:       p.file_path,
            function_symbol: p.function_symbol,
            function_id:     p.function_id,
            feature_id:      p.feature_id,
            feature_label:   p.feature_label,
            packet_key:      p.packet_key,
            summary:         p.summary,
            redis_key:       p.redis_key,
            manifest_id:     p.manifest_id,
            // Packet metadata
            packet_kind:     p.packet_kind,
            domain_class:    p.domain_class,
            community_id:    p.community_id,
            concept_ids:     p.concept_ids,
            calls:           p.calls,
            // Atlas indexing flags
            atlas_enriched:     true,
            canonicalSourceRef: p.source_ref,
          },
        });
      }
      if (points.length) {
        try {
          await qdrantUpsert(points);
          qdrantOk = points.length;
        } catch (err) {
          console.warn(`  Qdrant upsert error: ${err.message}`);
        }
      }
      console.log(`  qdrant upserted: ${qdrantOk}/${packets.length}`);
    }
  }

  // ── 5. Redis cache ─────────────────────────────────────────────────────────
  let redisOk = 0;
  if (!NO_REDIS) {
    console.log(`\nWriting Redis bifrost:packet:* (TTL 7d)…`);
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis({
        host:               process.env.REDIS_HOST ?? '127.0.0.1',
        port:               Number(process.env.REDIS_PORT ?? 6379),
        password:           process.env.REDIS_PASSWORD,
        lazyConnect:        true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      redis.on('error', () => {});
      await redis.connect();
      for (const p of packets) {
        try {
          await redis.set(p.redis_key, JSON.stringify(p), 'EX', 7 * 24 * 60 * 60);
          redisOk++;
        } catch (err) {
          if (VERBOSE) console.warn(`  redis skip ${p.packet_key}: ${err.message}`);
        }
      }
      await redis.quit();
    } catch (err) {
      console.warn(`  Redis offline — skipped (${err.message})`);
    }
    console.log(`  redis cached: ${redisOk}/${packets.length}`);
  }

  // ── 6. Neo4j Function nodes + CALLS edges ──────────────────────────────────
  let neoNodes = 0;
  let callsEdges = 0;
  if (!NO_NEO4J) {
    console.log(`\nWriting Neo4j (:Function) nodes…`);
    for (const p of packets) {
      const res = await neo4j(
        `
        MERGE (f:Function { packet_key: $pk })
          ON CREATE SET f.function_id = $fid, f.function_symbol = $sym,
                        f.source_ref = $sr,  f.file_path = $fp,
                        f.feature_id = $featId, f.feature_label = $featLabel,
                        f.domain_class = $dom, f.summary = $sum,
                        f.concept_ids = $concepts, f.calls = $calls,
                        f.created_at = $ts
          ON MATCH  SET f.summary = $sum, f.concept_ids = $concepts,
                        f.calls = $calls, f.updated_at = $ts
        MERGE (feat:Feature { feature_id: $featId })
          ON CREATE SET feat.label = $featLabel
        MERGE (f)-[:IN_FEATURE]->(feat)
        RETURN f.packet_key AS pk
        `,
        {
          pk:        p.packet_key,
          fid:       p.function_id,
          sym:       p.function_symbol,
          sr:        p.source_ref,
          fp:        p.file_path,
          featId:    p.feature_id,
          featLabel: p.feature_label,
          dom:       p.domain_class,
          sum:       p.summary,
          concepts:  p.concept_ids,
          calls:     p.calls,
          ts:        now,
        },
      );
      if (!res.error) neoNodes++;
    }
    console.log(`  function nodes: ${neoNodes}/${packets.length}`);

    // CALLS edges — only intra-file (target symbol matches another packet in this batch)
    const localSymbols = new Set(packets.map(p => p.function_symbol));
    console.log(`\nWriting Neo4j (:Function)-[:CALLS]->(:Function) edges…`);
    for (const p of packets) {
      for (const target of p.calls) {
        if (!localSymbols.has(target)) continue;   // first pass = intra-file only
        const targetPacket = packets.find(x => x.function_symbol === target);
        if (!targetPacket) continue;
        const res = await neo4j(
          `
          MATCH (a:Function { packet_key: $src }), (b:Function { packet_key: $dst })
          MERGE (a)-[:CALLS]->(b)
          RETURN a.packet_key AS src
          `,
          { src: p.packet_key, dst: targetPacket.packet_key },
        );
        if (!res.error && Array.isArray(res) && res.length) callsEdges++;
      }
    }
    console.log(`  CALLS edges (intra-file): ${callsEdges}`);
  }

  await pool.end();

  // ── 7. Gate results ────────────────────────────────────────────────────────
  const stats = { inserted, qdrant: qdrantOk, neo4j: neoNodes, redis: redisOk, callsEdges };
  writeReport(packets, stats, false);

  const gates = [
    { name: 'functions_discovered_ge10', pass: packets.length >= 10,
      detail: `${packets.length} functions` },
    { name: 'contract_fields_filled',    pass: structurallyOk,
      detail: structurallyOk ? 'all required fields non-empty' : 'missing fields' },
    { name: 'no_empty_summaries',        pass: emptySummary === 0,
      detail: `${emptySummary} empty` },
    { name: 'postgres_insert_count',     pass: inserted === packets.length,
      detail: `${inserted}/${packets.length}` },
  ];

  console.log('\n══ Gate Results ════════════════════════════════════');
  for (const g of gates) {
    console.log(`  ${g.pass ? '✅' : '❌'} ${g.name.padEnd(34)} ${g.detail}`);
  }
  const allPass = gates.every(g => g.pass);
  console.log(`\n  ${allPass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);
  console.log(`\nReport: docs/reports/function-packets.json\n`);

  if (!allPass) process.exitCode = 1;
}

function writeReport(packets, stats, dryRun) {
  const byDomain = {};
  for (const p of packets) byDomain[p.domain_class] = (byDomain[p.domain_class] ?? 0) + 1;

  const report = {
    generated_at:     new Date().toISOString(),
    dry_run:          dryRun,
    target_file:      toRepoRel(TARGET_FILE.replace(/\\/g, '/')),
    feature_id:       FEATURE_ID,
    feature_label:    FEATURE_LABEL,
    total_functions:  packets.length,
    by_domain:        byDomain,
    postgres_inserted: stats.inserted,
    qdrant_upserted:   stats.qdrant,
    neo4j_nodes:       stats.neo4j,
    neo4j_calls_edges: stats.callsEdges,
    redis_cached:      stats.redis,
    packets: packets.map(p => ({
      packet_key:      p.packet_key,
      function_id:     p.function_id,
      function_symbol: p.function_symbol,
      source_ref:      p.source_ref,
      concept_ids:     p.concept_ids,
      calls:           p.calls,
      summary:         p.summary,
    })),
    gates: {
      functions_discovered_ge10: packets.length >= 10,
      contract_fields_filled:    packets.every(p =>
        ['directory_path','source_ref','file_path','function_symbol',
         'feature_id','feature_label','packet_key','summary']
          .every(k => typeof p[k] === 'string' && p[k].length > 0)),
      no_empty_summaries:        packets.filter(p => !p.summary).length === 0,
      postgres_insert_count:     dryRun ? null : stats.inserted === packets.length,
    },
  };

  const dir = join(ROOT, 'docs', 'reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'function-packets.json'), JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
