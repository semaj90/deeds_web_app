#!/usr/bin/env node
/**
 * scripts/atlas/build-implementation-intent-aliases.mjs
 *
 * Builds the Implementation Intent Alias layer for Parent Atlas.
 *
 * Purpose:
 *   Human concept -> implementation vocabulary -> likely files -> Atlas packet.
 *
 * Credentials are read from the root .env file (DATABASE_URL, QDRANT_URL,
 * REDIS_HOST, REDIS_PASSWORD). No hardcoded passwords.
 *
 * Default mode is dry-run. --apply writes additive atlas_packets rows only.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();

// Load root .env before anything else
const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const DRY_RUN = process.argv.includes('--dry-run') || (!APPLY && !VERIFY);
const WITH_QDRANT = process.argv.includes('--qdrant');
const WITH_REDIS = process.argv.includes('--redis');

const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'implementation-intent-aliases.json');
const MD_REPORT = path.join(REPORT_DIR, 'implementation-intent-aliases.md');

function sha16(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 16);
}

function slug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function redact(value) {
  if (!value) return value;
  const s = String(value);
  return s.length <= 4 ? '****' : `${s.slice(0, 2)}****${s.slice(-2)}`;
}

function normalizeHttpUrl(raw, fallbackPort) {
  if (!raw) return undefined;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `http://${raw.includes(':') ? raw : `${raw}:${fallbackPort}`}`;
}

async function getPgClientCtor() {
  const pg = await import('pg');
  const Client = pg.Client || pg.default?.Client;
  if (typeof Client !== 'function') {
    throw new Error('Cannot resolve pg.Client from ESM import');
  }
  return Client;
}

// ---------------------------------------------------------------------------
// Active vector surfaces (as of 2026-06-22, verified in codebase_chunks_768)
//
//   content      768-dim   canonical semantic search
//   encoded_64    64-dim   topology / search (active latent surface)
//   error        768-dim   error-context embeddings
//   signature    768-dim   code signature embeddings
//
// Redis active keys:
//   gpu:karpathy:scores    — Karpathy authority blend hash (file -> JSON scores)
//   gpu:karpathy:encoded   — 64-dim encoded vectors hash (file -> CSV)
//
// Neo4j active properties:
//   gpuCluster, som_cluster, PageRank
//
// POSTPONED — do not pursue until retrieval + telemetry lanes are stable:
//   latent_128            (PATCH to Qdrant failed; no caller yet)
//   AE training pipeline  (no concrete caller)
//   manifold graph        (depends on trained AE)
// ---------------------------------------------------------------------------

const INTENTS = [
  {
    intent: 'qdrant_payload_writer',
    aliases: [
      'payload construction metadata aggregation',
      'qdrant payload enrichment',
      'vector payload mirror',
      'points upsert',
      'set payload',
      'with payload',
      'source reference payload',
      'source_ref feature_id packet_key'
    ],
    implementation_tokens: [
      'upsert',
      'setPayload',
      'points',
      'payload:',
      'with_payload',
      'qdrant_point_id',
      'source_ref',
      'feature_id',
      'packet_key'
    ],
    likely_files: [
      'scripts/atlas/build-mcp-tool-manifest-packets.mjs',
      'scripts/atlas/audit-proto-registry.mjs',
      'scripts/atlas/index-function-packets.mjs',
      'sveltekit-frontend/src/routes/api/atlas/index-doc/+server.ts',
      'sveltekit-frontend/src/routes/api/atlas/search/+server.ts',
      'sveltekit-frontend/src/lib/server/db/qdrant-sync.ts',
      'sveltekit-frontend/src/lib/server/db/qdrant-integration.ts'
    ],
    domain: 'qdrant_vector_index',
    feature_id: 'qdrant_payload_enrichment',
    feature_label: 'Qdrant Payload Enrichment',
    description: 'Maps natural-language requests about Qdrant payload construction to implementation tokens and candidate source files.'
  },
  {
    intent: 'packet_contract_writer',
    aliases: [
      'packet contract',
      'stable packet identity',
      'metadata jsonb',
      'atlas_packets payload',
      'source_ref feature_id community_id'
    ],
    implementation_tokens: [
      'atlas_packets',
      'packet_key',
      'source_ref',
      'feature_id',
      'community_id',
      'metadata',
      'jsonb',
      'INSERT INTO atlas_packets'
    ],
    likely_files: [
      'scripts/atlas/audit-postgres-contract-mirrors.mjs',
      'scripts/atlas/index-function-packets.mjs',
      'scripts/atlas/build-mcp-tool-manifest-packets.mjs',
      'sveltekit-frontend/src/routes/api/atlas/index-doc/+server.ts'
    ],
    domain: 'packet_contract',
    feature_id: 'packet_contract_lane',
    feature_label: 'Packet Contract Lane',
    description: 'Maps stable packet identity and metadata JSONB requirements to canonical atlas_packets writer surfaces.'
  },
  {
    intent: 'mcp_tool_manifest_writer',
    aliases: [
      'tool manifest packets',
      'mcp tool selection',
      'tools array forwarding',
      'tool schema indexing',
      'llama server tool calls'
    ],
    implementation_tokens: [
      'tool_manifest',
      'tools',
      'tool_calls',
      'ALLOWED_MCP_TOOLS',
      'use_mcp',
      'selectToolsForQuery'
    ],
    likely_files: [
      'scripts/atlas/build-mcp-tool-manifest-packets.mjs',
      'scripts/atlas/runtime-mcp-tool-selector.mjs',
      'sveltekit-frontend/src/routes/api/mcp/select-tools/+server.ts',
      'sveltekit-frontend/src/lib/server/ai/gemma4-agent.ts',
      'sveltekit-frontend/src/lib/server/ai/gemma4-tool-controller.ts'
    ],
    domain: 'mcp_agents',
    feature_id: 'mcp_tool_manifest_packets',
    feature_label: 'MCP Tool Manifest Packets',
    description: 'Maps MCP/tool-calling requests to manifest packets and runtime tool narrowing files.'
  },
  {
    intent: 'gpu_rerank_writer',
    aliases: [
      'gpu batch cosine',
      'tensorrt bridge',
      'libtorch bridge',
      'cuda rerank',
      'gpu cosine score'
    ],
    implementation_tokens: [
      'gpu_cosine_score',
      'batchCosineSimilarity',
      'tensorrt_bridge',
      'libtorch',
      'isCudaAvailable',
      'CUDA_VISIBLE_DEVICES'
    ],
    likely_files: [
      'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts',
      'sveltekit-frontend/src/routes/api/atlas/search/+server.ts',
      'simd-bridge/cpp/binding.cc'
    ],
    domain: 'gpu_turbovec_libtorch',
    feature_id: 'gpu_batch_cosine_rerank',
    feature_label: 'GPU BatchCosine Rerank',
    description: 'Maps GPU reranking and CUDA cosine scoring requests to the TypeScript and N-API bridge surfaces.'
  },
  {
    intent: 'feature_dependency_group_writer',
    aliases: [
      'feature dependency group',
      'implementation cluster',
      'related files by feature',
      'dependency group packet',
      'implementation context group'
    ],
    implementation_tokens: [
      'feature_dependency_group',
      'feature_label',
      'dependency_files',
      'root_files',
      'route_files',
      'test_files'
    ],
    likely_files: [
      'scripts/atlas/build-feature-dependency-groups.mjs',
      'sveltekit-frontend/docs/graph/codebase-graph.json',
      'sveltekit-frontend/docs/atlas-index/codebase-atlas.json'
    ],
    domain: 'code_intelligence',
    feature_id: 'feature_dependency_groups',
    feature_label: 'Feature Dependency Groups',
    description: 'Maps feature implementation context requests to grouped dependency packets.'
  },
  {
    intent: 'env_runtime_contract',
    aliases: [
      'environment variables',
      '.env credentials',
      'postgres password',
      'redis password',
      'local versus docker host',
      'service url normalization'
    ],
    implementation_tokens: [
      'DATABASE_URL',
      'POSTGRES_HOST',
      'POSTGRES_PASSWORD',
      'REDIS_HOST',
      'REDIS_PASSWORD',
      'QDRANT_URL',
      'normalizeHttpUrl',
      'RUNNING_IN_DOCKER'
    ],
    likely_files: [
      'sveltekit-frontend/src/lib/server/env.ts',
      'sveltekit-frontend/src/lib/server/env.server.ts',
      'sveltekit-frontend/.env',
      '.env',
      'scripts/atlas/batch-fix-env-errors.cjs'
    ],
    domain: 'admin_observability',
    feature_id: 'env_runtime_contract',
    feature_label: 'Environment Runtime Contract',
    description: 'Maps service URL, credential, and local-vs-Docker runtime issues to the env helper and configuration files. Canonical source: root .env (DATABASE_URL, QDRANT_URL, REDIS_HOST, REDIS_PASSWORD).'
  },
  {
    // Active latent surface: encoded_64 (64-dim) in codebase_chunks_768.
    // latent_128 is POSTPONED — Qdrant PATCH failed, no caller. Do not pursue
    // until retrieval and telemetry lanes are stable and a concrete caller exists.
    intent: 'active_latent_surfaces',
    aliases: [
      'encoded_64 search',
      'latent 64 topology',
      'qdrant named vector encoded_64',
      'karpathy encoded hash',
      'gpu karpathy latent cache',
      'latent vector current surface'
    ],
    implementation_tokens: [
      'encoded_64',
      'gpu:karpathy:encoded',
      'gpu:karpathy:scores',
      'with_vector',
      'points/vectors',
      'latent_64'
    ],
    likely_files: [
      'scripts/karpathy-gpu-enrich.mjs',
      'scripts/atlas/backfill-latent-vectors.mjs',
      'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts'
    ],
    domain: 'latent_manifold',
    feature_id: 'active_latent_surfaces',
    feature_label: 'Active Latent Surfaces',
    description: 'Documents the currently active latent vector surfaces. encoded_64 (64-dim) is the live topology/search surface in Qdrant codebase_chunks_768. Redis gpu:karpathy:encoded holds the 64-dim vectors; gpu:karpathy:scores holds the Karpathy authority blend. latent_128, AE training, and manifold graph are POSTPONED until retrieval and telemetry lanes are fully stable.'
  },
  {
    // Active SOM/cluster surfaces in Qdrant payload, Redis, and Neo4j.
    // Covers the fields that are live today: som_cluster, gpuCluster, PageRank,
    // somRow, somCol stored as Qdrant payload fields and Neo4j node properties.
    intent: 'som_topology_surfaces',
    aliases: [
      'som payload repair',
      'gpuCluster payload',
      'som_cluster backfill',
      'centroid payload mirror',
      'qdrant som topology payload',
      'neo4j gpu cluster pagerank',
      'som row col centroid'
    ],
    implementation_tokens: [
      'som_cluster',
      'gpuCluster',
      'centroid_id',
      'somRow',
      'somCol',
      'cluster:kmeans:k20:centroids',
      'points/payload',
      'PageRank',
      'gpuCluster'
    ],
    likely_files: [
      'scripts/atlas/backfill-qdrant-som-centroids.mjs',
      'scripts/atlas/train-som-20x20.mjs',
      'scripts/atlas/backfill-latent-vectors.mjs',
      'scripts/karpathy-gpu-enrich.mjs'
    ],
    domain: 'som_topology',
    feature_id: 'som_topology_surfaces',
    feature_label: 'SOM Topology Surfaces',
    description: 'Maps SOM centroid and cluster payload backfill to the active surfaces: som_cluster/somRow/somCol/centroid_id in Qdrant points/payload; gpuCluster/som_cluster/PageRank as Neo4j node properties; cluster:kmeans:k20:centroids in Redis. AE training and manifold graph are POSTPONED pending retrieval stability.'
  }
];

function buildAceHits(row) {
  return [
    {
      tool: 'atlas-tools_build_agentic_rag_context',
      query: row.aliases?.[0] || row.intent,
      evidence_kind: 'agentic_rag_context',
      confidence: 0.75,
      source_ref: row.likely_files?.[0] || `intent:${row.intent}`
    }
  ];
}

function toPacket(row) {
  const summary = `Grounded by ACE/KAG/DAG retrieval context: ${row.feature_label} maps concept aliases (${row.aliases.slice(0, 3).join(', ')}) to implementation tokens (${row.implementation_tokens.slice(0, 5).join(', ')}) and likely source refs.`;
  return {
    packet_kind: 'implementation_intent_alias',
    packet_key: `intent_alias:${sha16(row.intent)}`,
    source_ref: `intent:${row.intent}`,
    feature_id: row.feature_id || slug(row.intent),
    feature_label: row.feature_label || row.intent,
    community_id: null,
    domain: row.domain,
    intent: row.intent,
    description: row.description,
    summary,
    ace_kag_dag_hits: buildAceHits(row),
    aliases: row.aliases,
    implementation_tokens: row.implementation_tokens,
    likely_files: row.likely_files,
    metadata: {
      path: `implementation-intents/${row.intent}.json`,
      hash: `sha256:${sha16(JSON.stringify(row))}`,
      indexed_at: new Date().toISOString()
    },
    payload: {
      intent: row.intent,
      aliases: row.aliases,
      implementation_tokens: row.implementation_tokens,
      likely_files: row.likely_files,
      domain: row.domain,
      feature_id: row.feature_id,
      feature_label: row.feature_label
    },
    confidence: 1
  };
}

function validate(packets) {
  const failures = [];
  const warnings = [];
  const seen = new Set();

  for (const p of packets) {
    if (!p.packet_key) failures.push('missing packet_key');
    if (seen.has(p.packet_key)) failures.push(`duplicate packet_key: ${p.packet_key}`);
    seen.add(p.packet_key);
    if (!p.source_ref) failures.push(`missing source_ref: ${p.packet_key}`);
    if (!p.feature_id) failures.push(`missing feature_id: ${p.packet_key}`);
    if (!p.description) failures.push(`missing description: ${p.packet_key}`);
    if (!p.summary) failures.push(`missing summary: ${p.packet_key}`);
    if (!Array.isArray(p.ace_kag_dag_hits)) failures.push(`missing ace_kag_dag_hits array: ${p.packet_key}`);
    if (!p.aliases?.length) failures.push(`missing aliases: ${p.packet_key}`);
    if (!p.implementation_tokens?.length) failures.push(`missing implementation_tokens: ${p.packet_key}`);
    if (!p.likely_files?.length) warnings.push(`no likely_files: ${p.packet_key}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    gates: {
      packets_total: packets.length,
      duplicate_packet_keys: failures.filter((x) => x.includes('duplicate')).length,
      missing_description: failures.filter((x) => x.includes('description')).length,
      missing_summary: failures.filter((x) => x.includes('summary')).length
    }
  };
}

function writeReports(packets, validation) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    ok: validation.ok,
    generated_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    apply: APPLY,
    with_qdrant: WITH_QDRANT,
    with_redis: WITH_REDIS,
    validation,
    intents: packets,
    env: {
      qdrant_url: normalizeHttpUrl(getEnv('QDRANT_URL', 'http://127.0.0.1:6333'), 6333),
      postgres_host: getEnv('POSTGRES_HOST', '127.0.0.1'),
      postgres_port: getEnv('POSTGRES_PORT', '5434'),
      postgres_password: redact(getEnv('POSTGRES_PASSWORD', '')),
      redis_host: getEnv('REDIS_HOST', '127.0.0.1'),
      redis_password: redact(getEnv('REDIS_PASSWORD', ''))
    }
  };

  fs.writeFileSync(JSON_REPORT, JSON.stringify(report, null, 2));

  const md = [
    '# Implementation Intent Aliases',
    '',
    `Generated: ${report.generated_at}`,
    `Packets: ${packets.length}`,
    `Status: ${validation.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Active Vector Surfaces',
    '',
    '| Named vector | Dim | Role |',
    '|---|---|---|',
    '| `content` | 768 | canonical semantic search |',
    '| `encoded_64` | 64 | topology / search (active latent) |',
    '| `error` | 768 | error-context embeddings |',
    '| `signature` | 768 | code signature embeddings |',
    '',
    '**Postponed** (no concrete caller, pending retrieval stability): `latent_128`, AE training, manifold graph.',
    '',
    '## Active Cache Keys',
    '',
    '| Store | Key | Purpose |',
    '|---|---|---|',
    '| Redis | `gpu:karpathy:scores` | Karpathy authority blend (file → JSON) |',
    '| Redis | `gpu:karpathy:encoded` | 64-dim encoded vectors (file → CSV) |',
    '| Neo4j | `gpuCluster` | GPU cluster node property |',
    '| Neo4j | `som_cluster` | SOM cluster node property |',
    '| Neo4j | `PageRank` | PageRank score node property |',
    '',
    '## Intents',
    '',
    ...packets.map((p) => `- **${p.intent}** -> ${p.feature_label} (${p.likely_files.length} likely files)`),
    '',
    '## Warnings',
    '',
    ...(validation.warnings.length ? validation.warnings.map((f) => `- ${f}`) : ['- none']),
    '',
    '## Failures',
    '',
    ...(validation.failures.length ? validation.failures.map((f) => `- ${f}`) : ['- none']),
    ''
  ].join('\n');

  fs.writeFileSync(MD_REPORT, md);
  return report;
}

async function applyToPostgres(packets) {
  const Client = await getPgClientCtor();
  // DATABASE_URL takes priority; falls back to individual env vars (all from .env)
  const client = getEnv('DATABASE_URL')
    ? new Client({ connectionString: getEnv('DATABASE_URL') })
    : new Client({
        host: getEnv('POSTGRES_HOST', '127.0.0.1'),
        port: Number(getEnv('POSTGRES_PORT', '5434')),
        database: getEnv('POSTGRES_DB', 'legal_ai_db'),
        user: getEnv('POSTGRES_USER', 'legal_admin'),
        password: getEnv('POSTGRES_PASSWORD')
      });

  await client.connect();
  let count = 0;
  for (const p of packets) {
    await client.query(
      `
      INSERT INTO atlas_packets
        (packet_key, source_ref, feature_id, feature_label, community_id,
         summary, payload, source_kind, directory_path, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,NOW(),NOW())
      ON CONFLICT (packet_key) DO UPDATE SET
        source_ref    = EXCLUDED.source_ref,
        feature_id    = EXCLUDED.feature_id,
        feature_label = EXCLUDED.feature_label,
        summary       = EXCLUDED.summary,
        payload       = EXCLUDED.payload,
        source_kind   = EXCLUDED.source_kind,
        updated_at    = NOW()
      `,
      [
        p.packet_key,
        p.source_ref,
        p.feature_id,
        p.feature_label,
        p.community_id,
        p.summary,
        JSON.stringify(p),
        'implementation_intent_alias',
        'scripts/atlas'
      ]
    );
    count++;
  }
  await client.end();
  return { postgres: 'ok', count };
}

async function main() {
  const packets = INTENTS.map(toPacket);
  const validation = validate(packets);
  writeReports(packets, validation);

  console.log(`Implementation intent aliases: ${packets.length}`);
  console.log(`Report: ${path.relative(ROOT, JSON_REPORT)}`);
  console.log(`Gate: ${validation.ok ? 'PASS' : 'FAIL'}`);

  if (!validation.ok) {
    console.error(validation.failures.join('\n'));
    process.exitCode = 1;
    return;
  }
  if (VERIFY) return;
  if (APPLY) {
    const result = await applyToPostgres(packets);
    console.log(`Apply: ${JSON.stringify(result)}`);
  } else {
    console.log('Dry run only. Use --apply to write atlas_packets.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
