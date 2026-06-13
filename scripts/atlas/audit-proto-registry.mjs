#!/usr/bin/env node
/**
 * audit-proto-registry.mjs
 *
 * Inventories active .proto files in proto/active/, extracts service + RPC method
 * names via regex (no protobuf parser dependency), and packetizes each RPC method
 * as an atlas_packets entry.
 *
 * Canonical lineage contract:
 *   packet_key   = sha256(`rpc:${service}.${method}`).slice(0,16)
 *   source_ref   = `proto:${service}.${method}`
 *   feature_id   = `grpc_service`
 *   domain_class = `mcp_agents`
 *
 * Gates:
 *   PASS  >= 5 services discovered across active proto files
 *   PASS  >= 20 RPC methods total
 *   PASS  100% packets have all canonical lineage fields
 *
 * Usage:
 *   node scripts/atlas/audit-proto-registry.mjs               # dry-run (default)
 *   node scripts/atlas/audit-proto-registry.mjs --dry-run     # explicit dry-run
 *   node scripts/atlas/audit-proto-registry.mjs --apply       # write to Postgres/Qdrant/Redis
 *   node scripts/atlas/audit-proto-registry.mjs --apply --no-qdrant --no-redis
 *   node scripts/atlas/audit-proto-registry.mjs --apply --verbose
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
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
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://localhost:6333';
const EMBED_URL    = process.env.EMBED_URL    || 'http://127.0.0.1:5173/api/embed';
const _ollamaRaw   = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL   = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;
const COLLECTION   = 'codebase_chunks_768';

const FEATURE_ID    = 'grpc_service';
const FEATURE_LABEL = 'gRPC Proto Services';
const DOMAIN_CLASS  = 'mcp_agents';

// ── Gates ─────────────────────────────────────────────────────────────────────
const GATE_MIN_SERVICES = 5;
const GATE_MIN_METHODS  = 20;

// ── Proto directory ───────────────────────────────────────────────────────────
const PROTO_ACTIVE_DIR = join(ROOT, 'proto', 'active');

// ── Concept vocabulary (closed) for proto domain ─────────────────────────────
const CONCEPT_VOCAB = new Set([
  'grpc', 'rpc', 'embedding', 'retrieval', 'search', 'codeintel',
  'chat', 'tool_calling', 'turbovec', 'gpu', 'cuda', 'vector',
  'evidence', 'health', 'stream', 'batch', 'cluster', 'enrich',
  'library', 'cartridge', 'agent', 'inference', 'latent', 'som',
  'cosine', 'transform', 'upsert',
]);

// Per-service concept hints
const SERVICE_CONCEPT_MAP = {
  EmbeddingService:     ['embedding', 'vector', 'batch', 'grpc'],
  RetrievalService:     ['retrieval', 'search', 'vector', 'grpc'],
  ChatAssistantService: ['chat', 'inference', 'stream', 'grpc'],
  TurboVecService:      ['turbovec', 'vector', 'search', 'cosine', 'upsert'],
  TurboVecCudaService:  ['turbovec', 'cuda', 'gpu', 'cosine', 'vector'],
  GpuBridgeService:     ['gpu', 'cuda', 'cosine', 'latent', 'som'],
  CodeIntelService:     ['codeintel', 'cluster', 'search', 'enrich'],
  EnrichmentService:    ['codeintel', 'enrich', 'cluster', 'batch'],
  ToolCallingService:   ['tool_calling', 'agent', 'batch', 'stream'],
  LibrarySearchService: ['library', 'search', 'retrieval', 'grpc'],
  Chr97Agent:           ['cartridge', 'agent', 'search'],
  CyberElephantService: ['vector', 'search', 'cluster', 'batch'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function packetKeyFor(service, method) {
  return createHash('sha256')
    .update(`rpc:${service}.${method}`)
    .digest('hex')
    .slice(0, 16);
}

function toQdrantNumericId(packetKey) {
  // Use first 8 hex chars as unsigned 32-bit int for Qdrant numeric ID
  return parseInt(packetKey.slice(0, 8), 16);
}

function conceptsForService(serviceName, methodName, summary) {
  const hints = SERVICE_CONCEPT_MAP[serviceName] ?? [];
  const fromSummary = [];
  const combined = `${methodName} ${summary}`.toLowerCase();
  for (const c of CONCEPT_VOCAB) {
    if (combined.includes(c.replace('_', ' ')) || combined.includes(c)) {
      fromSummary.push(c);
    }
  }
  const merged = [...new Set([...hints, ...fromSummary])].slice(0, 6);
  return merged;
}

/**
 * Parse a single .proto file and return { file, package, services }.
 * Each service: { name, rpcs: [{ method, inputType, outputType, isClientStream, isServerStream, comment }] }
 */
function parseProtoFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  let packageName = '';
  const services = [];
  let currentService = null;
  let pendingComment = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Capture package
    const pkgMatch = trimmed.match(/^package\s+([\w.]+)\s*;/);
    if (pkgMatch) {
      packageName = pkgMatch[1];
      continue;
    }

    // Capture leading single-line comments
    if (trimmed.startsWith('//')) {
      const commentText = trimmed.replace(/^\/\/+\s*/, '').trim();
      if (commentText.length > 4) pendingComment = commentText;
      continue;
    }
    // Multi-line comment blocks — clear pending
    if (trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      pendingComment = null;
      continue;
    }

    // Service block start
    const svcMatch = trimmed.match(/^service\s+(\w+)\s*\{/);
    if (svcMatch) {
      currentService = { name: svcMatch[1], rpcs: [] };
      pendingComment = null;
      continue;
    }

    // Service block end
    if (trimmed === '}' && currentService) {
      services.push(currentService);
      currentService = null;
      pendingComment = null;
      continue;
    }

    // RPC method inside a service
    if (currentService) {
      // rpc MethodName(InputType) returns (OutputType);
      // rpc MethodName(stream InputType) returns (stream OutputType);
      const rpcMatch = trimmed.match(
        /^rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s+returns\s+\(\s*(stream\s+)?(\w+)\s*\)/
      );
      if (rpcMatch) {
        const [, methodName, isClientStream, inputType, isServerStream, outputType] = rpcMatch;
        currentService.rpcs.push({
          method:         methodName,
          inputType:      inputType,
          outputType:     outputType,
          isClientStream: !!isClientStream,
          isServerStream: !!isServerStream,
          comment:        pendingComment,
        });
        pendingComment = null;
      }
    }
  }

  // Guard: handle unclosed service block (malformed proto)
  if (currentService && currentService.rpcs.length > 0) {
    services.push(currentService);
  }

  return { file: filePath, package: packageName, services };
}

/**
 * Build a summary string for an RPC method.
 */
function buildRpcSummary(serviceName, rpc, fileName) {
  if (rpc.comment) return rpc.comment.slice(0, 200);

  const streamNote = rpc.isClientStream && rpc.isServerStream
    ? ' (bidi-stream)'
    : rpc.isServerStream ? ' (server-stream)'
    : rpc.isClientStream ? ' (client-stream)'
    : '';

  return `gRPC ${serviceName}.${rpc.method}${streamNote}: ${rpc.inputType} -> ${rpc.outputType} [${fileName}]`.slice(0, 200);
}

/**
 * Build a canonical atlas packet for an RPC method.
 */
function buildRpcPacket(serviceName, rpc, protoPackage, protoFilePath) {
  const fileName = posix.basename(protoFilePath.replace(/\\/g, '/'));
  const relPath  = protoFilePath.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
  const dirPath  = posix.dirname(relPath);

  const packetKey  = packetKeyFor(serviceName, rpc.method);
  const sourceRef  = `proto:${serviceName}.${rpc.method}`;
  const summary    = buildRpcSummary(serviceName, rpc, fileName);
  const conceptIds = conceptsForService(serviceName, rpc.method, summary);
  const redisKey   = `bifrost:packet:${packetKey}`;
  const numericId  = toQdrantNumericId(packetKey);

  let rpcKind = 'unary';
  if (rpc.isClientStream && rpc.isServerStream) rpcKind = 'bidi_stream';
  else if (rpc.isServerStream) rpcKind = 'server_stream';
  else if (rpc.isClientStream) rpcKind = 'client_stream';

  return {
    // Canonical lineage contract fields
    directory_path:  dirPath,
    source_ref:      sourceRef,
    file_path:       relPath,
    function_symbol: rpc.method,
    function_id:     `${FEATURE_ID}.${serviceName}.${rpc.method}`,
    feature_id:      FEATURE_ID,
    feature_label:   FEATURE_LABEL,
    packet_key:      packetKey,
    summary,
    qdrant_point_id: numericId,
    redis_key:       redisKey,
    manifest_id:     null,

    // Packet kind
    packet_kind:    'rpc_method',
    domain_class:   DOMAIN_CLASS,
    community_id:   null,
    concept_ids:    conceptIds,
    calls:          [],

    // Proto-specific metadata (stored in payload JSONB)
    service_name:   serviceName,
    proto_package:  protoPackage,
    input_type:     rpc.inputType,
    output_type:    rpc.outputType,
    rpc_kind:       rpcKind,
    proto_file:     relPath,
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

// ── Qdrant helper ─────────────────────────────────────────────────────────────

async function qdrantUpsert(points) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ points }),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant upsert HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()).result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('=== Proto Registry Audit -- ' + (DRY_RUN ? 'DRY RUN' : 'APPLY') + ' ===');
  console.log('');

  // ── 1. Discover proto files ────────────────────────────────────────────────
  if (!existsSync(PROTO_ACTIVE_DIR)) {
    console.error('ERROR: proto/active/ directory not found at: ' + PROTO_ACTIVE_DIR);
    process.exit(2);
  }

  const protoFiles = readdirSync(PROTO_ACTIVE_DIR)
    .filter(f => f.endsWith('.proto'))
    .map(f => join(PROTO_ACTIVE_DIR, f));

  console.log('Proto dir  : ' + PROTO_ACTIVE_DIR.replace(ROOT, '<repo>').replace(/\\/g, '/'));
  console.log('Files found: ' + protoFiles.length);
  console.log('');

  // ── 2. Parse all proto files ───────────────────────────────────────────────
  const parsed = [];
  for (const file of protoFiles) {
    try {
      const result = parseProtoFile(file);
      parsed.push(result);
      if (VERBOSE) {
        const rel = file.replace(ROOT, '<repo>').replace(/\\/g, '/');
        for (const svc of result.services) {
          console.log('  [' + rel + '] service ' + svc.name + ' (' + svc.rpcs.length + ' rpc)');
        }
      }
    } catch (err) {
      console.warn('  WARN: failed to parse ' + file + ': ' + err.message);
    }
  }

  // ── 3. Build packets ───────────────────────────────────────────────────────
  const packets = [];
  const serviceNames = [];

  for (const proto of parsed) {
    for (const svc of proto.services) {
      serviceNames.push(svc.name);
      for (const rpc of svc.rpcs) {
        packets.push(buildRpcPacket(svc.name, rpc, proto.package, proto.file));
      }
    }
  }

  const uniqueServices = [...new Set(serviceNames)];
  const totalMethods   = packets.length;

  // ── 4. Discovery report ────────────────────────────────────────────────────
  console.log('--- Discovery ---');
  console.log('Services : ' + uniqueServices.length + '  (gate >= ' + GATE_MIN_SERVICES + ')');
  console.log('Methods  : ' + totalMethods + '  (gate >= ' + GATE_MIN_METHODS + ')');
  console.log('');

  // Per-service breakdown
  const svcCount = {};
  for (const p of packets) {
    svcCount[p.service_name] = (svcCount[p.service_name] ?? 0) + 1;
  }
  for (const [svc, count] of Object.entries(svcCount)) {
    console.log('  ' + svc.padEnd(32) + count + ' rpc(s)');
  }
  console.log('');

  if (VERBOSE) {
    for (const p of packets) {
      console.log('  ' + p.service_name + '.' + p.function_symbol
        + ' -> key=' + p.packet_key
        + ' kind=' + p.rpc_kind
        + ' concepts=[' + p.concept_ids.join(',') + ']');
      console.log('    ' + p.summary.slice(0, 90));
    }
    console.log('');
  }

  // ── 5. Gates ───────────────────────────────────────────────────────────────
  const gateServicesPass = uniqueServices.length >= GATE_MIN_SERVICES;
  const gateMethodsPass  = totalMethods >= GATE_MIN_METHODS;

  const REQUIRED_FIELDS = [
    'directory_path', 'source_ref', 'file_path', 'function_symbol',
    'feature_id', 'feature_label', 'packet_key', 'summary',
  ];
  const contractOk = packets.every(p =>
    REQUIRED_FIELDS.every(k => typeof p[k] === 'string' && p[k].length > 0)
  );

  console.log('--- Gates ---');
  console.log('  services >= ' + GATE_MIN_SERVICES + ' : '
    + (gateServicesPass ? 'PASS (' + uniqueServices.length + ')' : 'FAIL (' + uniqueServices.length + ')'));
  console.log('  methods  >= ' + GATE_MIN_METHODS  + ' : '
    + (gateMethodsPass  ? 'PASS (' + totalMethods + ')' : 'FAIL (' + totalMethods + ')'));
  console.log('  contract fields    : ' + (contractOk ? 'PASS' : 'FAIL'));
  console.log('');

  if (!gateServicesPass || !gateMethodsPass || !contractOk) {
    console.error('ERROR: Pre-write gates FAILED. Fix issues and retry.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('(dry-run) Would write ' + packets.length + ' RPC packets');
    console.log('          across Postgres / Qdrant / Redis.');
    console.log('');
    console.log('Run with --apply to persist.');
    return;
  }

  // ── 6. Postgres upsert ─────────────────────────────────────────────────────
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
        `
        INSERT INTO atlas_packets
          (packet_id, artifact_id, packet_key, source_ref, feature_id, community_id,
           summary, payload, source_kind, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW(), NOW())
        ON CONFLICT (packet_id) DO UPDATE SET
          summary     = EXCLUDED.summary,
          payload     = EXCLUDED.payload,
          source_ref  = EXCLUDED.source_ref,
          feature_id  = EXCLUDED.feature_id,
          packet_key  = EXCLUDED.packet_key,
          source_kind = EXCLUDED.source_kind,
          updated_at  = NOW()
        `,
        [
          p.packet_key,           // packet_id
          p.source_ref,           // artifact_id
          p.packet_key,           // packet_key
          p.source_ref,           // source_ref
          p.feature_id,           // feature_id
          p.community_id,         // community_id (null)
          p.summary,              // summary
          JSON.stringify(payload),// payload jsonb
          p.packet_kind,          // source_kind
        ],
      );
      pgInserted++;
    } catch (err) {
      console.warn('  skip ' + p.packet_key + ' (' + p.source_ref + '): ' + err.message);
    }
  }

  console.log('  inserted/updated: ' + pgInserted + '/' + packets.length);
  await pool.end();

  // ── 7. Qdrant upsert ───────────────────────────────────────────────────────
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
        if (!collectionOk) {
          console.log('  WARN: vector dim is ' + sz + ', expected 768 -- skipping');
        }
      } else {
        console.log('  WARN: collection check HTTP ' + infoRes.status + ' -- skipping');
      }
    } catch (err) {
      console.log('  WARN: Qdrant unreachable (' + err.message + ') -- skipping');
    }

    if (collectionOk) {
      const points = [];
      for (const p of packets) {
        const embedText = `${p.service_name} ${p.function_symbol} ${p.summary} ${p.concept_ids.join(' ')}`;
        const vec = await embed(embedText);
        if (!vec) {
          if (VERBOSE) console.warn('  no embedding for ' + p.source_ref + ' -- Postgres only');
          continue;
        }
        points.push({
          id:      p.qdrant_point_id,
          vector:  { content: vec },
          payload: {
            // Canonical lineage contract
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
            // Proto-specific
            service_name:    p.service_name,
            proto_package:   p.proto_package,
            input_type:      p.input_type,
            output_type:     p.output_type,
            rpc_kind:        p.rpc_kind,
            proto_file:      p.proto_file,
            // Stage signals (sentinel 0)
            ann_turbovec_score: 0,
            gpu_cosine_score:   0,
            som_cache_hit:      0,
            // Atlas flags
            atlas_enriched:     true,
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
    }
  }

  // ── 8. Redis cache ─────────────────────────────────────────────────────────
  let redisOk = 0;
  if (!NO_REDIS) {
    console.log('');
    console.log('--- Redis (bifrost:packet:* TTL 7d) ---');
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis({
        host:                 process.env.REDIS_HOST     ?? '127.0.0.1',
        port:                 Number(process.env.REDIS_PORT ?? 6379),
        password:             process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis',
        lazyConnect:          true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue:   false,
        retryStrategy:        () => null,
      });
      redis.on('error', () => {});

      try {
        await redis.connect();
        await redis.ping();
      } catch (connErr) {
        console.log('  Redis offline (' + connErr.message + ') -- skipped');
        redis.quit().catch(() => {});
        // Proceed without Redis — not fatal
        return;
      }

      const TTL = 7 * 24 * 60 * 60; // 7 days
      for (const p of packets) {
        try {
          await redis.set(p.redis_key, JSON.stringify(p), 'EX', TTL);
          redisOk++;
        } catch (err) {
          if (VERBOSE) console.warn('  redis skip ' + p.packet_key + ': ' + err.message);
        }
      }
      await redis.quit();
      console.log('  cached: ' + redisOk + '/' + packets.length);
    } catch (err) {
      console.warn('  Redis module error -- skipped: ' + err.message);
    }
  }

  // ── 9. Write audit report (for packetization consumer) ──────────────────────
  const auditReport = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    proto_files_scanned: protoFiles.length,
    services_found: uniqueServices.length,
    rpc_methods: totalMethods,
    postgres_written: pgInserted,
    qdrant_written: qdrantOk,
    redis_written: redisOk,
    packets: packets.map(p => ({
      service_name: p.service_name,
      function_symbol: p.function_symbol,
      summary: p.summary,
      concept_ids: p.concept_ids,
      directory_path: p.directory_path,
      file_path: p.file_path,
      source_ref: p.source_ref,
      packet_key: p.packet_key,
      qdrant_point_id: p.qdrant_point_id,
      proto_package: p.proto_package,
      input_type: p.input_type,
      output_type: p.output_type,
      rpc_kind: p.rpc_kind,
      proto_file: p.proto_file,
    })),
  };

  const { mkdirSync, writeFileSync } = await import('node:fs');
  const reportDir = __dir + '/../../docs/reports';
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    reportDir + '/proto-registry-audit.json',
    JSON.stringify(auditReport, null, 2)
  );

  // ── 10. Final summary ──────────────────────────────────────────────────────
  console.log('');
  console.log('--- Summary ---');
  console.log('  proto files scanned : ' + protoFiles.length);
  console.log('  services found      : ' + uniqueServices.length);
  console.log('  rpc methods         : ' + totalMethods);
  console.log('  postgres written    : ' + pgInserted);
  if (!NO_QDRANT) console.log('  qdrant written      : ' + qdrantOk);
  if (!NO_REDIS)  console.log('  redis written       : ' + redisOk);
  console.log('  audit report        : docs/reports/proto-registry-audit.json');
  console.log('  DONE');
}

main().catch(err => {
  console.error('FATAL: ' + err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
