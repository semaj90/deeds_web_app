#!/usr/bin/env node
/**
 * packetize-proto-rpc-tools.mjs
 *
 * Converts gRPC proto RPC methods into atlas_packets, enabling Gemma4 to receive
 * narrowed tool lists (top-K RPC methods by relevance) instead of flat 300+ methods.
 *
 * This script:
 *   1. Reads proto-registry-audit.json (output of audit-proto-registry.mjs)
 *   2. Converts each RPC method to an atlas_packets entry
 *   3. Embeds each RPC packet into Qdrant codebase_chunks_768
 *   4. Writes to Postgres atlas_packets + Qdrant + Redis cache
 *
 * Canonical lineage contract:
 *   packet_key   = sha256(`rpc:${service}.${method}`).slice(0,16)
 *   source_ref   = `proto:${service}.${method}`
 *   feature_id   = `grpc_service`
 *   feature_label = `gRPC Proto Services`
 *   domain_class = `mcp_agents`
 *   packet_kind  = `rpc_method`
 *
 * Gates:
 *   PASS  >= 5 unique services
 *   PASS  >= 20 total RPC methods
 *   PASS  100% packets have lineage fields
 *   PASS  >=30% packets successfully embedded (when --apply with Qdrant)
 *
 * Output:
 *   docs/reports/proto-packetization-dry-run.json — discovery report
 *   docs/reports/proto-packetization-dry-run.md — human-readable report
 *   docs/reports/proto-packetization-apply.json — apply result (when --apply)
 *
 * Usage:
 *   node scripts/atlas/packetize-proto-rpc-tools.mjs               # dry-run (default)
 *   node scripts/atlas/packetize-proto-rpc-tools.mjs --dry-run     # explicit
 *   node scripts/atlas/packetize-proto-rpc-tools.mjs --apply       # write to DB
 *   node scripts/atlas/packetize-proto-rpc-tools.mjs --apply --no-qdrant --no-redis
 *   node scripts/atlas/packetize-proto-rpc-tools.mjs --apply --verbose
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const APPLY     = process.argv.includes('--apply');
const DRY_RUN   = !APPLY;
const VERBOSE   = process.argv.includes('--verbose');
const NO_QDRANT = process.argv.includes('--no-qdrant');
const NO_REDIS  = process.argv.includes('--no-redis');

// ── Service config ────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://127.0.0.1:6333';
const EMBED_URL    = process.env.EMBED_URL    || 'http://127.0.0.1:5173/api/embed';
const _ollamaRaw   = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL   = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;
const COLLECTION   = 'codebase_chunks_768';

const FEATURE_ID    = 'grpc_service';
const FEATURE_LABEL = 'gRPC Proto Services';
const DOMAIN_CLASS  = 'mcp_agents';
const PACKET_KIND   = 'rpc_method';

const REPORT_DIR = join(ROOT, 'docs', 'reports');

// ── Gates ─────────────────────────────────────────────────────────────────────
const GATE_MIN_SERVICES = 5;
const GATE_MIN_METHODS  = 20;
const GATE_EMBED_PASS_RATE = 0.30; // 30% of packets must embed successfully

// ── Helpers ───────────────────────────────────────────────────────────────────

function packetKeyFor(service, method) {
  return createHash('sha256')
    .update(`rpc:${service}.${method}`)
    .digest('hex')
    .slice(0, 16);
}

function toQdrantNumericId(packetKey) {
  return parseInt(packetKey.slice(0, 8), 16);
}

/**
 * Load proto-registry-audit.json (pre-computed service/method inventory).
 * If not found, generate it by running audit-proto-registry.mjs --apply first.
 */
function loadProtoRegistry() {
  const auditPath = join(REPORT_DIR, 'proto-registry-audit.json');
  if (!existsSync(auditPath)) {
    throw new Error(`Proto registry audit not found. Run:\n  node scripts/atlas/audit-proto-registry.mjs --apply\nThen retry packetization.`);
  }
  const data = JSON.parse(readFileSync(auditPath, 'utf8'));
  return data.packets || [];
}

/**
 * Build a canonical atlas packet for an RPC method packet from the audit.
 * Input structure matches audit-proto-registry.mjs output.
 */
function packetFromAudit(auditPacket) {
  const { service_name, function_symbol, summary, concept_ids, directory_path, file_path, source_ref, qdrant_point_id } = auditPacket;

  const packetKey = packetKeyFor(service_name, function_symbol);
  const numericId = toQdrantNumericId(packetKey);
  const redisKey = `bifrost:packet:${packetKey}`;

  return {
    // Canonical lineage contract
    directory_path,
    source_ref,
    file_path,
    function_symbol,
    function_id: `${FEATURE_ID}.${service_name}.${function_symbol}`,
    feature_id: FEATURE_ID,
    feature_label: FEATURE_LABEL,
    packet_key: packetKey,
    summary: summary || `gRPC ${service_name}.${function_symbol}`,
    qdrant_point_id: numericId,
    redis_key: redisKey,
    manifest_id: null,

    // Packet metadata
    packet_kind: PACKET_KIND,
    domain_class: DOMAIN_CLASS,
    community_id: null,
    concept_ids: concept_ids || [],
    calls: [],

    // Proto-specific (from audit packet)
    service_name,
    proto_package: auditPacket.proto_package || '',
    input_type: auditPacket.input_type || '',
    output_type: auditPacket.output_type || '',
    rpc_kind: auditPacket.rpc_kind || 'unary',
    proto_file: auditPacket.proto_file || file_path,
  };
}

// ── Embedding ─────────────────────────────────────────────────────────────────

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
  for (const model of ['embeddinggemma:latest', 'nomic-embed-text:latest']) {
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
    } catch { /* try next model */ }
  }
  return null;
}

async function embed(text) {
  return (await embedViaDevServer(text)) ?? (await embedViaOllama(text));
}

// ── Qdrant ────────────────────────────────────────────────────────────────────

async function qdrantUpsert(points) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ points }),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('=== Proto Packetization -- ' + (DRY_RUN ? 'DRY RUN' : 'APPLY') + ' ===');
  console.log('');

  // Ensure report dir exists
  mkdirSync(REPORT_DIR, { recursive: true });

  // ── 1. Load proto registry audit ────────────────────────────────────────────
  console.log('--- Loading proto registry audit ---');
  let auditPackets = [];
  try {
    auditPackets = loadProtoRegistry();
  } catch (err) {
    console.error('ERROR: ' + err.message);
    process.exit(1);
  }

  if (auditPackets.length === 0) {
    console.error('ERROR: No RPC packets in audit. Run audit-proto-registry.mjs first.');
    process.exit(1);
  }

  console.log('Loaded: ' + auditPackets.length + ' RPC packets');
  console.log('');

  // ── 2. Build canonical packets from audit ──────────────────────────────────
  console.log('--- Building canonical packets ---');
  const packets = [];
  const serviceSet = new Set();
  const duplicates = [];

  for (const auditPkt of auditPackets) {
    const pkt = packetFromAudit(auditPkt);
    packets.push(pkt);
    serviceSet.add(pkt.service_name);

    // Duplicate detection (same packet_key)
    const dupKey = pkt.packet_key;
    if (packets.filter(p => p.packet_key === dupKey).length > 1) {
      duplicates.push(dupKey);
    }
  }

  const uniqueServices = [...serviceSet];
  const uniqueDuplicates = [...new Set(duplicates)];

  console.log('Services     : ' + uniqueServices.length + '  (gate >= ' + GATE_MIN_SERVICES + ')');
  console.log('RPC methods  : ' + packets.length + '  (gate >= ' + GATE_MIN_METHODS + ')');
  if (uniqueDuplicates.length > 0) {
    console.log('Duplicates   : ' + uniqueDuplicates.length);
  }
  console.log('');

  // ── 3. Gates ───────────────────────────────────────────────────────────────
  const gateServices = uniqueServices.length >= GATE_MIN_SERVICES;
  const gateMethods = packets.length >= GATE_MIN_METHODS;

  const REQUIRED = ['directory_path', 'source_ref', 'file_path', 'function_symbol', 'feature_id', 'feature_label', 'packet_key', 'summary'];
  const gateContract = packets.every(p => REQUIRED.every(k => typeof p[k] === 'string' && p[k].length > 0));

  console.log('--- Gates ---');
  console.log('  services >= ' + GATE_MIN_SERVICES + ' : ' + (gateServices ? 'PASS' : 'FAIL') + ' (' + uniqueServices.length + ')');
  console.log('  methods >= ' + GATE_MIN_METHODS + ' : ' + (gateMethods ? 'PASS' : 'FAIL') + ' (' + packets.length + ')');
  console.log('  contract fields    : ' + (gateContract ? 'PASS' : 'FAIL'));
  console.log('');

  if (!gateServices || !gateMethods || !gateContract) {
    console.error('ERROR: Pre-write gates FAILED.');
    process.exit(1);
  }

  // Write dry-run report
  const dryRunReport = {
    timestamp: new Date().toISOString(),
    mode: 'dry-run',
    services: uniqueServices.length,
    methods: packets.length,
    duplicates: uniqueDuplicates.length,
    gates: {
      services: gateServices,
      methods: gateMethods,
      contract: gateContract,
    },
    packets: packets.slice(0, 10), // First 10 for inspection
  };

  writeFileSync(join(REPORT_DIR, 'proto-packetization-dry-run.json'), JSON.stringify(dryRunReport, null, 2));

  const dryMd = `# Proto Packetization Report

- **Services**: ${uniqueServices.length} (gate >= ${GATE_MIN_SERVICES})
- **RPC Methods**: ${packets.length} (gate >= ${GATE_MIN_METHODS})
- **Duplicates**: ${uniqueDuplicates.length}
- **Gate Status**: ${gateServices && gateMethods && gateContract ? 'PASS' : 'FAIL'}

## Services
\`\`\`
${uniqueServices.join('\n')}
\`\`\`

## Sample Packets (first 10)
\`\`\`
${packets.slice(0, 10).map(p => `${p.service_name}.${p.function_symbol} [${p.packet_key}]`).join('\n')}
\`\`\`
`;

  writeFileSync(join(REPORT_DIR, 'proto-packetization-dry-run.md'), dryMd);
  console.log('Dry-run reports written:');
  console.log('  JSON: docs/reports/proto-packetization-dry-run.json');
  console.log('  MD  : docs/reports/proto-packetization-dry-run.md');
  console.log('');

  if (DRY_RUN) {
    console.log('(dry-run) Would write ' + packets.length + ' RPC packets to Postgres/Qdrant/Redis');
    console.log('');
    console.log('Run with --apply to persist.');
    return;
  }

  // ── 4. Postgres upsert ─────────────────────────────────────────────────────
  console.log('--- Postgres ---');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  let pgInserted = 0;
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
      service_name:    p.service_name,
      proto_package:   p.proto_package,
      input_type:      p.input_type,
      output_type:     p.output_type,
      rpc_kind:        p.rpc_kind,
      proto_file:      p.proto_file,
    };

    try {
      await pool.query(
        `INSERT INTO atlas_packets
          (packet_key, source_ref, directory_path, file_path, function_symbol, feature_id, feature_label,
           community_id, summary, payload, source_kind, domain_class, concept_ids, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, NOW(), NOW())
         ON CONFLICT (packet_key) DO UPDATE SET
          source_ref     = EXCLUDED.source_ref,
          directory_path = EXCLUDED.directory_path,
          file_path      = EXCLUDED.file_path,
          function_symbol= EXCLUDED.function_symbol,
          feature_id     = EXCLUDED.feature_id,
          feature_label  = EXCLUDED.feature_label,
          summary        = EXCLUDED.summary,
          payload        = EXCLUDED.payload,
          source_kind    = EXCLUDED.source_kind,
          domain_class   = EXCLUDED.domain_class,
          concept_ids    = EXCLUDED.concept_ids,
          updated_at     = NOW()`,
        [
          p.packet_key,           // packet_key
          p.source_ref,           // source_ref
          p.directory_path,       // directory_path
          p.file_path,            // file_path
          p.function_symbol,      // function_symbol
          p.feature_id,           // feature_id
          p.feature_label,        // feature_label
          p.community_id,         // community_id
          p.summary,              // summary
          JSON.stringify(payload),// payload jsonb
          p.packet_kind,          // source_kind
          p.domain_class,         // domain_class
          p.concept_ids,          // concept_ids
        ],
      );
      pgInserted++;
    } catch (err) {
      if (VERBOSE) console.warn('  skip ' + p.packet_key + ': ' + err.message);
    }
  }

  console.log('  inserted/updated: ' + pgInserted + '/' + packets.length);
  await pool.end();

  // ── 5. Qdrant upsert ───────────────────────────────────────────────────────
  let qdrantOk = 0;
  if (!NO_QDRANT) {
    console.log('');
    console.log('--- Qdrant (' + COLLECTION + ') ---');

    let collectionOk = false;
    try {
      const infoRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (infoRes.ok) {
        const d = await infoRes.json();
        const sz = d.result?.config?.params?.vectors?.content?.size
                ?? d.result?.config?.params?.vectors?.size
                ?? 0;
        collectionOk = sz === 768;
        if (!collectionOk) console.log('  WARN: vector dim is ' + sz + ', expected 768');
      }
    } catch (err) {
      console.log('  WARN: Qdrant unreachable (' + err.message + ')');
    }

    if (collectionOk) {
      const points = [];
      for (const p of packets) {
        const embedText = `${p.service_name} ${p.function_symbol} ${p.summary} ${p.concept_ids.join(' ')}`;
        const vec = await embed(embedText);
        if (!vec) {
          if (VERBOSE) console.warn('  no embedding for ' + p.source_ref);
          continue;
        }
        points.push({
          id: p.qdrant_point_id,
          vector: { content: vec },
          payload: {
            directory_path: p.directory_path,
            source_ref: p.source_ref,
            file_path: p.file_path,
            function_symbol: p.function_symbol,
            function_id: p.function_id,
            feature_id: p.feature_id,
            feature_label: p.feature_label,
            packet_key: p.packet_key,
            summary: p.summary,
            redis_key: p.redis_key,
            manifest_id: p.manifest_id,
            packet_kind: p.packet_kind,
            domain_class: p.domain_class,
            community_id: p.community_id,
            concept_ids: p.concept_ids,
            calls: p.calls,
            service_name: p.service_name,
            proto_package: p.proto_package,
            input_type: p.input_type,
            output_type: p.output_type,
            rpc_kind: p.rpc_kind,
            proto_file: p.proto_file,
            ann_turbovec_score: 0,
            gpu_cosine_score: 0,
            som_cache_hit: 0,
            atlas_enriched: true,
            canonicalSourceRef: p.source_ref,
          },
        });
      }

      if (points.length) {
        const BATCH = 50;
        for (let i = 0; i < points.length; i += BATCH) {
          const batch = points.slice(i, i + BATCH);
          try {
            await qdrantUpsert(batch);
            qdrantOk += batch.length;
          } catch (err) {
            console.warn('  Qdrant batch error at offset ' + i + ': ' + err.message);
          }
        }
      }
      console.log('  upserted: ' + qdrantOk + '/' + packets.length);

      // Embedding gate
      const embedPassRate = qdrantOk / packets.length;
      const embedGatePass = embedPassRate >= GATE_EMBED_PASS_RATE;
      console.log('  embedding rate: ' + (embedPassRate * 100).toFixed(1) + '% (gate >= ' + (GATE_EMBED_PASS_RATE * 100).toFixed(0) + '%)');
      if (!embedGatePass && qdrantOk > 0) {
        console.warn('  WARN: Low embedding rate — check Ollama/dev server');
      }
    }
  }

  // ── 6. Redis cache ─────────────────────────────────────────────────────────
  let redisOk = 0;
  if (!NO_REDIS) {
    console.log('');
    console.log('--- Redis (bifrost:packet:* TTL 7d) ---');
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis({
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis',
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      redis.on('error', () => {});

      try {
        await redis.connect();
        await redis.ping();
      } catch (connErr) {
        console.log('  Redis offline (' + connErr.message + ')');
        redis.quit().catch(() => {});
        return;
      }

      const TTL = 7 * 24 * 60 * 60;
      for (const p of packets) {
        try {
          await redis.set(p.redis_key, JSON.stringify(p), 'EX', TTL);
          redisOk++;
        } catch (err) {
          if (VERBOSE) console.warn('  skip ' + p.packet_key + ': ' + err.message);
        }
      }
      await redis.quit();
      console.log('  cached: ' + redisOk + '/' + packets.length);
    } catch (err) {
      console.warn('  Redis error: ' + err.message);
    }
  }

  // ── 7. Write apply report ──────────────────────────────────────────────────
  const applyReport = {
    timestamp: new Date().toISOString(),
    mode: 'apply',
    services: uniqueServices.length,
    methods: packets.length,
    postgres_inserted: pgInserted,
    qdrant_upserted: qdrantOk,
    redis_cached: redisOk,
    gates: {
      services: gateServices,
      methods: gateMethods,
      contract: gateContract,
      qdrant_embedding: qdrantOk >= packets.length * GATE_EMBED_PASS_RATE,
    },
  };

  writeFileSync(join(REPORT_DIR, 'proto-packetization-apply.json'), JSON.stringify(applyReport, null, 2));

  // ── 8. Summary ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('--- Summary ---');
  console.log('  services            : ' + uniqueServices.length);
  console.log('  rpc methods         : ' + packets.length);
  console.log('  postgres written    : ' + pgInserted);
  if (!NO_QDRANT) console.log('  qdrant written      : ' + qdrantOk);
  if (!NO_REDIS) console.log('  redis written       : ' + redisOk);
  console.log('  report              : docs/reports/proto-packetization-apply.json');
  console.log('');
  console.log('  DONE');
  console.log('');
}

main().catch(err => {
  console.error('FATAL: ' + err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
