#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pgPkg from 'pg';

const { Pool } = pgPkg;

const args = new Set(process.argv.slice(2));
const getArg = (name, fallback = undefined) => {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};

const LIMIT = Number(getArg('--limit', '0'));
const USE_GEMMA4 = args.has('--gemma4');
const OUT_JSON = 'docs/reports/qdrant-p3g-missing-classification.json';
const OUT_MD = 'docs/reports/qdrant-p3g-missing-classification.md';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090/v1/chat/completions';

function sha(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 16);
}

function existsFileMaybe(sourceRef) {
  if (!sourceRef) return false;
  const variants = [
    sourceRef,
    sourceRef.replace(/^sveltekit-frontend\//, ''),
    `sveltekit-frontend/${sourceRef}`,
  ];
  return variants.some((v) => fs.existsSync(v));
}

function classifySource(row) {
  const text = [
    row.source_ref,
    row.file_path,
    row.identity_lane,
    row.payload?.source_kind,
    row.payload?.packet_kind,
    row.payload?.kind,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/intent_alias|schema_stub|mcp_tool_stub|generated_stub/.test(text)) {
    return 'non_vector_identity';
  }

  if (/node_modules|\.svelte-kit|dist|build|coverage|\.generated|generated|\.tmp/.test(text)) {
    return 'skipped_generated';
  }

  if (
    !row.summary &&
    !row.payload?.bm25_text &&
    !row.payload?.content &&
    !row.file_path &&
    !row.source_ref
  ) {
    return 'missing_text';
  }

  const ref = row.source_ref || row.file_path || '';
  if (
    row.payload?.source_kind === 'codebase' ||
    ref.startsWith('src/') ||
    ref.includes('/src/') ||
    ref.endsWith('.ts') ||
    ref.endsWith('.svelte') ||
    ref.endsWith('.mjs')
  ) {
    return 'needs_embedding';
  }

  return 'ambiguous';
}

async function health() {
  const h = {
    postgres_ok: false,
    qdrant_ok: false,
    qdrant_collection: QDRANT_COLLECTION,
    collection_dim: null,
    ollama_ok: false,
    embedding_model: 'embeddinggemma:latest',
    embedding_model_ok: false,
    valkey_ok: false,
    gpu_visible: false,
    recommended_batch_size: 32,
  };

  try {
    const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
    h.qdrant_ok = r.ok;
    const j = await r.json().catch(() => ({}));
    h.collection_dim =
      j?.result?.config?.params?.vectors?.size ??
      j?.result?.config?.params?.vectors?.default?.size ??
      null;
  } catch {}

  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    h.ollama_ok = r.ok;
    const j = await r.json().catch(() => ({}));
    h.embedding_model_ok = JSON.stringify(j).includes('embeddinggemma');
  } catch {}

  try {
    execFileSync('docker', ['exec', 'legal-ai-valkey', 'redis-cli', '-a', 'redis', 'PING'], {
      stdio: 'pipe',
      timeout: 5000,
    });
    h.valkey_ok = true;
  } catch {}

  try {
    const out = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader'],
      {
        stdio: 'pipe',
        timeout: 5000,
        encoding: 'utf8',
      }
    );
    h.gpu_visible = out.trim().length > 0;
  } catch {}

  return h;
}

async function askGemma4(summary) {
  if (!USE_GEMMA4) return null;

  const body = {
    model: 'gemma4-legal-iq4xs-direct.gguf',
    messages: [
      {
        role: 'system',
        content:
          'You are a classifier assistant. Do not invent facts. Recommend next safe action from provided bucket counts only.',
      },
      {
        role: 'user',
        content: JSON.stringify(summary, null, 2),
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'recommend_p3g_actions',
          description: 'Recommend safe P3g actions from deterministic classifier output.',
          parameters: {
            type: 'object',
            properties: {
              next_actions: { type: 'array', items: { type: 'string' } },
              apply_allowed: { type: 'boolean' },
              warning: { type: 'string' },
            },
            required: ['next_actions', 'apply_allowed', 'warning'],
          },
        },
      },
    ],
    tool_choice: 'auto',
    temperature: 0.1,
  };

  try {
    const r = await fetch(GEMMA4_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

async function main() {
  fs.mkdirSync('docs/reports', { recursive: true });

  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const h = await health();

  const sql = `
    SELECT
      p.packet_id,
      p.packet_key,
      p.source_ref,
      p.source_ref_key,
      p.file_path,
      p.feature_id,
      p.feature_label,
      p.domain_class,
      p.identity_lane,
      p.summary,
      p.payload,
      p.qdrant_point_id,
      h.qdrant_point_id AS ledger_qdrant_point_id,
      h.qdrant_collection AS ledger_qdrant_collection,
      h.content_hash,
      h.chunk_id
    FROM atlas_packets p
    LEFT JOIN atlas_higher_hop_index h
      ON h.packet_key = p.packet_key
    WHERE p.packet_key IS NOT NULL
      AND p.qdrant_point_id IS NULL
    ORDER BY p.packet_id
    ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}
  `;

  const res = await pool.query(sql);
  h.postgres_ok = true;
  await pool.end();

  const buckets = {
    join_repair_possible: [],
    qdrant_payload_match_possible: [],
    needs_embedding: [],
    non_vector_identity: [],
    skipped_generated: [],
    missing_text: [],
    ambiguous: [],
  };

  for (const row of res.rows) {
    const base = {
      packet_id: row.packet_id,
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      source_ref_key: row.source_ref_key,
      file_path: row.file_path,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
      identity_lane: row.identity_lane,
      ledger_qdrant_point_id: row.ledger_qdrant_point_id,
      ledger_qdrant_collection: row.ledger_qdrant_collection,
      file_exists: existsFileMaybe(row.source_ref || row.file_path),
    };

    if (row.ledger_qdrant_point_id) {
      buckets.join_repair_possible.push(base);
      continue;
    }

    const cls = classifySource(row);
    buckets[cls].push(base);
  }

  const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));

  const summary = {
    generatedAt: new Date().toISOString(),
    status: 'CLASSIFIED',
    mode: LIMIT ? `sample:${LIMIT}` : 'full',
    health: h,
    totalMissing: res.rows.length,
    counts,
    samples: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.slice(0, 10)])),
    nextActions: {
      join_repair_possible: 'Run repair-qdrant-postgres-join.mjs.',
      qdrant_payload_match_possible: 'Run payload/point-id reconciliation.',
      needs_embedding: 'Eligible for embeddinggemma backfill after review.',
      non_vector_identity: 'Skip embedding.',
      skipped_generated: 'Skip embedding unless explicitly required.',
      missing_text: 'Fix source text or summary first.',
      ambiguous: 'Manual review.',
    },
  };

  summary.gemma4 = await askGemma4({
    counts,
    health: h,
    rule: 'No broad apply until classifier buckets are reviewed.',
  });

  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));

  const md = [
    '# Qdrant P3g Missing Packet Classification',
    '',
    `Generated: ${summary.generatedAt}`,
    `Status: ${summary.status}`,
    `Mode: ${summary.mode}`,
    '',
    '## Health',
    '',
    ...Object.entries(h).map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`),
    '',
    '## Bucket Counts',
    '',
    ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Next Actions',
    '',
    ...Object.entries(summary.nextActions).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Rule',
    '',
    'Do not embed all missing packets. Repair joins first, reconcile payload matches second, embed only `needs_embedding`, and skip non-vector identities.',
    '',
  ].join('\n');

  fs.writeFileSync(OUT_MD, md);

  console.log(
    JSON.stringify({ status: summary.status, totalMissing: summary.totalMissing, counts }, null, 2)
  );
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error('[FAIL]', e);
  process.exit(1);
});
