// scripts/atlas/build-feature-dependency-groups.mjs
/**
 * Builds feature dependency groups for Parent Atlas.
 * Dry-run by default. --apply writes additive atlas_packets rows only.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
// Check for command line arguments using process.argv[2] or similar logic, 
// but since we are in an ESM context, checking the array elements is safer.
const ARGS = process.argv;
const APPLY = ARGS.includes('--apply');
const VERIFY = ARGS.includes('--verify');
const DRY_RUN = ARGS.includes('--dry-run') || (!APPLY && !VERIFY);

const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'feature-dependency-groups.json');
const MD_REPORT = path.join(REPORT_DIR, 'feature-dependency-groups.md');

function sha16(input) {
  return createHash('sha256').update(String(input)).digest('hex').slice(0, 16);
}

function slug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
      'source_ref feature_id packet_key',
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
      'packet_key',
    ],
    likely_files: [
      'scripts/atlas/build-mcp-tool-manifest-packets.js',
      'scripts/atlas/audit-proto-registry.js',
      'scripts/atlas/index-function-packets.js',
      'sveltekit-frontend/src/routes/api/atlas/index-doc/+server.js',
      'sveltekit-frontend/src/routes/api/atlas/search/+server.js',
      'sveltekit-frontend/src/lib/server/db/qdrant-sync.js',
      'sveltekit-frontend/src/lib/server/db/qdrant-integration.js',
    ],
    domain: 'qdrant_vector_index',
    feature_id: 'qdrant_payload_enrichment',
    feature_label: 'Qdrant Payload Enrichment',
  },
  {
    intent: 'packet_contract_writer',
    aliases: [
      'packet contract',
      'stable packet identity',
      'metadata jsonb',
      'atlas_packets payload',
      'source_ref feature_id community_id',
    ],
    implementation_tokens: [
      'atlas_packets',
      'packet_key',
      'source_ref',
      'feature_id',
      'community_id',
      'metadata',
      'jsonb',
      'INSERT INTO atlas_packets',
    ],
    likely_files: [
      'scripts/atlas/audit-postgres-contract-mirrors.js',
      'scripts/atlas/index-function-packets.js',
      'scripts/atlas/build-mcp-tool-manifest-packets.js',
      'sveltekit-frontend/src/routes/api/atlas/index-doc/+server.js',
    ],
    domain: 'packet_contract',
    feature_id: 'packet_contract_lane',
    feature_label: 'Packet Contract Lane',
  },
  {
    intent: 'mcp_tool_manifest_writer',
    aliases: [
      'tool manifest packets',
      'mcp tool selection',
      'tools array forwarding',
      'tool schema indexing',
      'llama server tool calls',
    ],
    implementation_tokens: [
      'tool_manifest',
      'tools',
      'tool_calls',
      'ALLOWED_MCP_TOOLS',
      'use_mcp',
      'selectToolsForQuery',
    ],
    likely_files: [
      'scripts/atlas/build-mcp-tool-manifest-packets.js',
      'scripts/atlas/runtime-mcp-tool-selector.js',
      'sveltekit-frontend/src/routes/api/mcp/select-tools/+server.js',
      'sveltekit-frontend/src/lib/server/ai/gemma4-agent.js',
      'sveltekit-frontend/src/lib/server/ai/gemma4-tool-controller.js',
    ],
    domain: 'mcp_agents',
    feature_id: 'mcp_tool_manifest_packets',
    feature_label: 'MCP Tool Manifest Packets',
  },
  {
    intent: 'gpu_rerank_writer',
    aliases: [
      'gpu batch cosine',
      'tensorrt bridge',
      'libtorch bridge',
      'cuda rerank',
      'gpu cosine score',
    ],
    implementation_tokens: [
      'gpu_cosine_score',
      'batchCosineSimilarity',
      'tensorrt_bridge',
      'libtorch',
      'isCudaAvailable',
      'CUDA_VISIBLE_DEVICES',
    ],
    likely_files: [
      'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.js',
      'sveltekit-frontend/src/routes/api/atlas/search/+server.js',
      'simd-bridge/cpp/binding.cc',
    ],
    domain: 'gpu_turbovec_libtorch',
    feature_id: 'gpu_batch_cosine_rerank',
    feature_label: 'GPU BatchCosine Rerank',
  },
  {
    intent: 'feature_dependency_group_writer',
    aliases: [
      'feature dependency group',
      'implementation cluster',
      'related files by feature',
      'dependency group packet',
      'implementation context group',
    ],
    implementation_tokens: [
      'feature_dependency_group',
      'feature_label',
      'dependency_files',
      'root_files',
      'route_files',
      'test_files',
    ],
    likely_files: [
      'scripts/atlas/build-feature-dependency-groups.js',
      'sveltekit-frontend/docs/graph/codebase-graph.json',
      'sveltekit-frontend/docs/atlas-index/codebase-atlas.json',
    ],
    domain: 'code_intelligence',
    feature_id: 'feature_dependency_groups',
    feature_label: 'Feature Dependency Groups',
  },
];

function toPacket(row) {
  return {
    packet_kind: 'implementation_intent_alias',
    packet_key: `intent_alias:${sha16(row.intent)}`,
    source_ref: `intent:${row.intent}`,
    feature_id: row.feature_id || slug(row.intent),
    feature_label: row.feature_label || row.intent,
    community_id: null,
    domain: row.domain,
    intent: row.intent,
    aliases: row.aliases,
    implementation_tokens: row.implementation_tokens,
    likely_files: row.likely_files,
    summary: `Implementation intent alias for ${row.feature_label || row.intent}. Maps conceptual queries to implementation tokens and likely files.`,
    confidence: 1,
  };
}

function validate(packets) {
  const failures = [];
  const seen = new Set();

  for (const p of packets) {
    if (!p.packet_key) failures.push('missing packet_key');
    if (seen.has(p.packet_key)) failures.push(`duplicate packet_key: ${p.packet_key}`);
    seen.add(p.packet_key);

    if (!p.intent) failures.push(`missing intent: ${p.packet_key}`);
    if (!p.aliases?.length) failures.push(`missing aliases: ${p.packet_key}`);
    if (!p.implementation_tokens?.length) failures.push(`missing implementation_tokens: ${p.packet_key}`);
    if (!p.likely_files?.length) failures.push(`missing likely_files: ${p.packet_key}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    gates: {
      packets_total: packets.length,
      duplicate_packet_keys: failures.filter((x) => x.includes('duplicate')).length,
    },
  };
}

function writeReports(packets, validation) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const report = {
    ok: validation.ok,
    generated_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    apply: APPLY,
    validation,
    intents: packets,
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
    ...packets.map(
      (p) => `- **${p.intent}** → ${p.feature_label} (${p.likely_files.length} likely files)`
    ),
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
  let pg;
  try {
    // Use dynamic import for 'pg' to handle module scope correctly
    const pgModule = await import('pg');
    // Assuming 'Client' is exported directly or accessible via default export if needed
    const Client = (await import('pg')).Client;
    pg = Client;
  } catch (e) {
    console.warn('[warn] pg package unavailable; skipping Postgres apply');
    return { postgres: 'skipped_pg_missing', count: 0 };
  }

  const client = process.env.DATABASE_URL
    ? new pg.Client({ connectionString: process.env.DATABASE_URL })
    : new pg.Client({
        host: process.env.POSTGRES_HOST || '127.0.0.1',
        port: Number(process.env.POSTGRES_PORT || 5434),
        database: process.env.POSTGRES_DB || 'legal_ai_db',
        user: process.env.POSTGRES_USER || 'legal_admin',
        password: process.env.POSTGRES_PASSWORD || 'legal',
      });

  await client.connect();
  let count = 0;
  for (const p of packets) {
    const payload = {
      ...p,
      metadata: {
        path: `implementation-intents/${p.intent}.json`,
        hash: `sha256:${sha16(JSON.stringify(p))}`,
        indexed_at: new Date().toISOString(),
      },
    };

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
        JSON.stringify(payload),
        'implementation_intent_alias',
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
    console.error('Validation Failed:\n' + validation.failures.join('\n'));
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

main();