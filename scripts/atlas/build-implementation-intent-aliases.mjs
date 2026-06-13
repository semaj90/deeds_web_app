#!/usr/bin/env node
/**
 * scripts/atlas/build-implementation-intent-aliases.mjs
 *
 * Builds the Implementation Intent Alias layer for Parent Atlas.
 *
 * Purpose:
 *   Human concept -> implementation vocabulary -> likely files -> Atlas packet.
 *
 * Default mode is dry-run. --apply writes additive atlas_packets rows only.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();
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

function requireEnv(name) {
  const value = getEnv(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
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
    description: 'Maps service URL, credential, and local-vs-Docker runtime issues to the env helper and configuration files.'
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
  const client = getEnv('DATABASE_URL')
    ? new Client({ connectionString: getEnv('DATABASE_URL') })
    : new Client({
        host: getEnv('POSTGRES_HOST', '127.0.0.1'),
        port: Number(getEnv('POSTGRES_PORT', '5434')),
        database: getEnv('POSTGRES_DB', 'legal_ai_db'),
        user: getEnv('POSTGRES_USER', 'legal_admin'),
        password: getEnv('POSTGRES_PASSWORD', 'legal')
      });

  await client.connect();
  let count = 0;
  for (const p of packets) {
    await client.query(
      `
      INSERT INTO atlas_packets
        (packet_id, artifact_id, packet_key, source_ref, feature_id, community_id,
         summary, payload, source_kind, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,NOW(),NOW())
      ON CONFLICT (packet_id) DO UPDATE SET
        packet_key = EXCLUDED.packet_key,
        source_ref = EXCLUDED.source_ref,
        feature_id = EXCLUDED.feature_id,
        summary = EXCLUDED.summary,
        payload = EXCLUDED.payload,
        source_kind = EXCLUDED.source_kind,
        updated_at = NOW()
      `,
      [
        p.packet_key,
        p.intent,
        p.packet_key,
        p.source_ref,
        p.feature_id,
        p.community_id,
        p.summary,
        JSON.stringify(p),
        'implementation_intent_alias'
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
