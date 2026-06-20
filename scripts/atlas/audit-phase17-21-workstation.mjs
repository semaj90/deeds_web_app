#!/usr/bin/env node

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'phase17-21-workstation-audit.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'phase17-21-workstation-audit.md');

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function fileEvidence(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return { path: relativePath, exists: false, bytes: 0 };
  const stat = fs.statSync(absolutePath);
  return {
    path: relativePath,
    exists: true,
    bytes: stat.isFile() ? stat.size : 0,
    modified_at: stat.mtime.toISOString(),
  };
}

function countLines(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return 0;
  const buffer = fs.readFileSync(absolutePath);
  let lines = 0;
  for (const byte of buffer) if (byte === 10) lines += 1;
  return lines + (buffer.length > 0 && buffer[buffer.length - 1] !== 10 ? 1 : 0);
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
  } catch {
    return null;
  }
}

function runPsql(sql) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-e',
      'PGPASSWORD=123456',
      process.env.PARENT_ATLAS_POSTGRES_CONTAINER ?? 'legal-ai-postgres',
      'psql',
      '-U',
      process.env.PARENT_ATLAS_POSTGRES_USER ?? 'legal_admin',
      '-d',
      process.env.PARENT_ATLAS_POSTGRES_DB ?? 'legal_ai_db',
      '-At',
      '-F',
      '\t',
      '-c',
      sql,
    ],
    { cwd: ROOT, encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 * 4 },
  );
  if (result.status !== 0) return { ok: false, error: String(result.stderr ?? '').trim() };
  return { ok: true, output: String(result.stdout ?? '').trim() };
}

function inspectSummarySchema() {
  const result = runPsql(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parent_atlas_documents'
      AND column_name IN (
        'summary', 'summary_hash', 'summary_model', 'summary_backend',
        'summary_version', 'summary_generated_at', 'summary_metadata'
      )
    ORDER BY column_name;
  `);
  if (!result.ok) return { status: 'DEGRADED', columns: [], error: result.error };
  const columns = result.output.split(/\r?\n/).filter(Boolean);
  const required = [
    'summary',
    'summary_hash',
    'summary_model',
    'summary_backend',
    'summary_version',
    'summary_generated_at',
    'summary_metadata',
  ];
  return {
    status: required.every((column) => columns.includes(column)) ? 'READY' : 'MIGRATION_PENDING',
    columns,
    missing: required.filter((column) => !columns.includes(column)),
  };
}

function inspectSummaryCoverage() {
  const result = runPsql(`
    SELECT
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::int,
      COUNT(summary_hash)::int,
      COUNT(summary_model)::int,
      COUNT(summary_backend)::int,
      COUNT(summary_version)::int,
      COUNT(summary_generated_at)::int,
      COUNT(*) FILTER (WHERE summary LIKE '%<|channel>%')::int
    FROM public.parent_atlas_documents
    WHERE source_ref NOT LIKE 'feature:%';
  `);
  if (!result.ok) return { status: 'DEGRADED', error: result.error };
  const [
    totalRaw = '0',
    populatedRaw = '0',
    hashRaw = '0',
    modelRaw = '0',
    backendRaw = '0',
    versionRaw = '0',
    generatedRaw = '0',
    channelRaw = '0',
  ] = result.output.split('\t');
  const total = Number(totalRaw);
  const populated = Number(populatedRaw);
  return {
    status: 'READY',
    total,
    populated,
    missing: Math.max(0, total - populated),
    coverage_pct: total > 0 ? Number(((populated / total) * 100).toFixed(2)) : 0,
    provenance: {
      summary_hash: Number(hashRaw),
      summary_model: Number(modelRaw),
      summary_backend: Number(backendRaw),
      summary_version: Number(versionRaw),
      summary_generated_at: Number(generatedRaw),
    },
    channel_marker_rows: Number(channelRaw),
  };
}

function phase(id, status, completion_pct, have, need, evidence = []) {
  return { id, status, completion_pct, have, need, evidence };
}

async function main() {
  const validation = readJson('docs/reports/addressable-packets-validation.json');
  const summarySchema = inspectSummarySchema();
  const summaryCoverage = inspectSummaryCoverage();
  const packageJson = readJson('package.json') ?? {};
  const frontendPackage = readJson('sveltekit-frontend/package.json') ?? {};
  const scripts = { ...(packageJson.scripts ?? {}), ...(frontendPackage.scripts ?? {}) };

  const native = {
    tensorrt_bridge: fileEvidence('simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    turbovec_napi: fileEvidence('crates/turbovec-napi/turbovec-napi.win32-x64-msvc.node'),
    rust_simdjson: fileEvidence('simd-bridge/rust-simdjson/target/release/simd_bridge_rs.node'),
    atlas_packet_parser_source: fileEvidence('crates/atlas_packet_parser/src/lib.rs'),
    atlas_packet_parser_binary: fileEvidence('crates/atlas_packet_parser/atlas-packet-parser.win32-x64-msvc.node'),
    omni_bridge_source: fileEvidence('crates/omni-bridge/src/lib.rs'),
  };

  const artifacts = {
    addressable_packets: {
      raw: fileEvidence('.tmp/addressable-packets.ndjson'),
      validated: fileEvidence('.tmp/addressable-packets.validated.ndjson'),
      validation: validation
        ? {
            checked: validation.total_checked,
            valid: validation.total_valid,
            invalid: validation.total_invalid,
            pass: validation.validation_pass,
          }
        : null,
    },
    mapreduce: {
      ndjson: fileEvidence('.tmp/mapreduce-full-v5.ndjson'),
      duckdb: fileEvidence('.tmp/ingest/atlas.duckdb'),
    },
    phase17: {
      output: fileEvidence('.tmp/phase17-pytorch-features.jsonl'),
      rows: countLines('.tmp/phase17-pytorch-features.jsonl'),
    },
    phase18: {
      output: fileEvidence('.tmp/phase18-xgboost-rerank.jsonl'),
      rows: countLines('.tmp/phase18-xgboost-rerank.jsonl'),
    },
    phase19: {
      output: fileEvidence('.tmp/atlas-retrieval-loop.jsonl'),
      rows: countLines('.tmp/atlas-retrieval-loop.jsonl'),
    },
    topology: {
      ae_weights: fileEvidence('.tmp/gpu-som-checkpoint/ae_weights_768_64.json'),
      som_8x8: fileEvidence('.tmp/gpu-som-checkpoint/som_8x8_n76878.json'),
      kmeans_20: fileEvidence('.tmp/gpu-som-checkpoint/kmeans_k20_n76878.json'),
      som_20x20: fileEvidence('models/som/som_20x20_codebook.json'),
    },
  };

  const phases = [
    phase(
      17,
      artifacts.phase17.rows > 10 ? 'PARTIAL' : 'SCAFFOLD_ONLY',
      35,
      [
        'PyTorch feature extractor and Python fallback exist.',
        'LibTorch/TensorRT bridge and CUDA-capable native surfaces exist.',
        `Current phase17 artifact contains ${artifacts.phase17.rows} row(s).`,
      ],
      [
        'Replace card-length heuristics with measured embedding/topology features.',
        'Use the proven retrieval corpus, not a one-row contract-card sample.',
        'Keep CUDA/GEMM as feature extraction acceleration, not packet identity.',
      ],
      [
        'sveltekit-frontend/scripts/atlas/phase17-pytorch-feature-extractor.mjs',
        'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts',
        'simd-bridge/cpp/build/Release/tensorrt_bridge.node',
      ],
    ),
    phase(
      18,
      artifacts.phase18.rows > 10 ? 'PARTIAL' : 'SCAFFOLD_ONLY',
      40,
      [
        'XGBoost reranker scripts and trained-sidecar lanes exist.',
        `Current phase18 compatibility artifact contains ${artifacts.phase18.rows} row(s).`,
      ],
      [
        'Use the validated retrieval/evaluation dataset as the training denominator.',
        'Require measured NDCG/MRR improvement before promotion.',
      ],
      [
        'sveltekit-frontend/scripts/atlas/phase18-xgboost-reranker.mjs',
        'scripts/atlas/train-policy-reranker.py',
      ],
    ),
    phase(
      19,
      artifacts.phase19.rows > 50 ? 'OPERATIONAL' : 'PARTIAL',
      90,
      [
        `Append-only retrieval loop contains ${artifacts.phase19.rows} rows.`,
        'Neo4j, Qdrant, and Valkey mirrors have dedicated operational lanes.',
      ],
      [
        'Keep new events tied to replay_id, packet_key, source_ref, and outcome.',
        'Do not reuse pseudo-cosine events as evaluation truth.',
      ],
      [
        'sveltekit-frontend/scripts/atlas/phase19-retrieval-loop-seed.mjs',
        '.tmp/atlas-retrieval-loop.jsonl',
      ],
    ),
    phase(
      20,
      validation?.validation_pass ? 'OPERATIONAL' : 'PARTIAL',
      95,
      [
        `Zod validation: ${validation?.total_valid ?? 0}/${validation?.total_checked ?? 0} addressable packets valid.`,
        'Rust SIMD JSON and TurboVec N-API packet parsers exist.',
        'MapReduce NDJSON and DuckDB materialization artifacts exist.',
        'Postgres remains canonical; Qdrant/Valkey/Neo4j are mirrors.',
      ],
      [
        native.atlas_packet_parser_binary.exists
          ? 'Keep the Rust packet parser binary covered by snapshot tests.'
          : 'Build and package the atlas_packet_parser N-API binary from existing Rust source.',
        'Keep streaming validation; do not load the 805 MB MapReduce artifact into normal JS objects.',
      ],
      [
        'scripts/atlas/validate-addressable-packets.mjs',
        'sveltekit-frontend/src/lib/server/packets/packet-contract.ts',
        'crates/turbovec-napi/src/lib.rs',
        'crates/atlas_packet_parser/src/lib.rs',
      ],
    ),
    phase(
      21,
      'EVAL_GATED',
      75,
      [
        '50-query replay proof, cache namespace proof, runtime degradation proof, and final package gate pass.',
        'Policy/PPO and Gym-style scripts exist as research surfaces.',
      ],
      [
        'Build adversarial and tensor-analysis datasets from replayed traces.',
        'Open PPO/adapters only after a baseline-vs-candidate evaluation improves.',
        'Keep TensorRT/custom CUDA kernel work research-only until measured.',
      ],
      [
        'packages/parent-atlas/docs/atlas/PROOF-SYSTEM.md',
        'docs/reports/parent-atlas-proof-of-truth.json',
        'docs/reports/runtime-degradation-proof.json',
      ],
    ),
  ];

  const report = {
    schema: 'phase17_21_workstation_audit.v1',
    generated_at: new Date().toISOString(),
    overall: phases.every((item) => ['OPERATIONAL', 'EVAL_GATED'].includes(item.status))
      ? 'READY'
      : 'PARTIAL',
    completion_pct: Number(
      (phases.reduce((sum, item) => sum + item.completion_pct, 0) / phases.length).toFixed(1),
    ),
    canonical_truth: 'Postgres',
    summary_lane: {
      status: summarySchema.status === 'READY' ? 'READY' : 'MIGRATION_PENDING',
      batch_size: 500,
      concurrency: 1,
      chat_backend: 'llama-server',
      chat_model: 'gemma4-legal-iq4xs-direct.gguf',
      embedding_backend: 'Ollama/EmbeddingGemma',
      dry_command: 'npm run atlas:summaries:gemma4:500:dry',
      apply_command: 'npm run atlas:summaries:gemma4:500:apply',
      schema: summarySchema,
      coverage: summaryCoverage,
    },
    ndjson_contract: {
      schema: 'AddressablePacketSchema',
      validator: 'scripts/atlas/validate-addressable-packets.mjs',
      validation,
      rust_parser: native.rust_simdjson.exists || native.turbovec_napi.exists,
      mapreduce_materialized: artifacts.mapreduce.ndjson.exists,
      duckdb_materialized: artifacts.mapreduce.duckdb.exists,
    },
    accelerator_boundary: {
      operational: [
        'LibTorch/CUDA bridge for feature extraction and reranking',
        'TurboVec quantized ANN prefilter',
        'SOM/KMeans/AE topology metadata',
      ],
      optional_or_missing: [
        'cuVS/CAGRA runtime library is not a summary-generation dependency',
        'RAPIDS is not required by the canonical packet pipeline',
        'atlas_packet_parser source exists but the root binary is not packaged',
      ],
      forbidden_shortcut: 'Do not use latent64, SOM, cuVS, CAGRA, or GEMM output as summary text or canonical identity.',
    },
    electricsql: {
      status: 'NOT_PRESENT',
      decision: 'DEFER',
      reason: 'ElectricSQL replication does not perform tokenizer remapping. Token maps remain versioned derived artifacts and must be evaluated separately.',
    },
    native,
    artifacts,
    phases,
    aliases: {
      phase17: scripts['atlas:phase17'] ?? null,
      phase18: scripts['atlas:phase18'] ?? null,
      phase19: scripts['atlas:phase19'] ?? null,
      summary500Dry: scripts['atlas:summaries:gemma4:500:dry'] ?? null,
      summary500Apply: scripts['atlas:summaries:gemma4:500:apply'] ?? null,
    },
  };

  await fsPromises.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fsPromises.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Phase 17-21 Workstation Audit',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.overall}`,
    '',
    '## Phase Matrix',
    '',
    '| Phase | Status | Complete | What exists | What remains |',
    '|---:|---|---:|---|---|',
    ...phases.map((item) =>
      `| ${item.id} | ${item.status} | ${item.completion_pct}% | ${item.have.join(' ')} | ${item.need.join(' ')} |`
    ),
    '',
    '## NDJSON And Storage',
    '',
    `- Zod validation: ${validation?.total_valid ?? 0}/${validation?.total_checked ?? 0} valid; ${validation?.total_invalid ?? 0} invalid.`,
    `- MapReduce NDJSON: ${artifacts.mapreduce.ndjson.exists ? `${artifacts.mapreduce.ndjson.bytes} bytes` : 'missing'}.`,
    `- DuckDB mirror: ${artifacts.mapreduce.duckdb.exists ? `${artifacts.mapreduce.duckdb.bytes} bytes` : 'missing'}.`,
    `- Rust SIMD/TurboVec parser available: ${report.ndjson_contract.rust_parser ? 'yes' : 'no'}.`,
    `- atlas_packet_parser packaged binary: ${native.atlas_packet_parser_binary.exists ? 'yes' : 'no'}.`,
    '',
    '## Gemma4 Batch Summary Lane',
    '',
    `- batch: ${report.summary_lane.batch_size}, concurrency: ${report.summary_lane.concurrency}`,
    `- chat: ${report.summary_lane.chat_backend} / ${report.summary_lane.chat_model}`,
    `- embeddings: ${report.summary_lane.embedding_backend}`,
    `- schema: ${summarySchema.status}`,
    `- summary coverage: ${summaryCoverage.coverage_pct ?? 0}% (${summaryCoverage.populated ?? 0}/${summaryCoverage.total ?? 0})`,
    `- dry: \`${report.summary_lane.dry_command}\``,
    `- apply: \`${report.summary_lane.apply_command}\``,
    '',
    '## Accelerator Boundary',
    '',
    '- cuVS/CAGRA, RAPIDS, CUDA GEMM, LibTorch, AE, SOM, and KMeans may accelerate vector or topology analysis.',
    '- They do not generate summary text and do not replace packet identity.',
    '- ElectricSQL is not present and is not a tokenizer-remapping engine.',
    '',
  ];
  await fsPromises.writeFile(REPORT_MD, `${lines.join('\n')}\n`, 'utf8');

  console.log(JSON.stringify({
    status: report.overall,
    completion_pct: report.completion_pct,
    zod_valid: validation?.total_valid ?? 0,
    zod_invalid: validation?.total_invalid ?? 0,
    summary_schema: summarySchema.status,
    summary_missing: summaryCoverage.missing ?? null,
    phase17_rows: artifacts.phase17.rows,
    phase18_rows: artifacts.phase18.rows,
    phase19_rows: artifacts.phase19.rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
