#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import pg from 'pg';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');
const INPUT_JSON_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-join-warmup.json');
const OUTPUT_JSON_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-nes-glyph-compress.json');
const OUTPUT_MD_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-nes-glyph-compress.md');
const OUTPUT_JSONL_PATH = path.join(REPO_ROOT, '.tmp', 'sourceRef-first-nes-glyph-packets.jsonl');
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';
const DEFAULT_BIFROST_URL = 'http://127.0.0.1:3040';
const DEFAULT_BIFROST_MODEL = 'ollama/gemma4-rotorquant:latest';
const FALLBACK_BIFROST_MODEL = 'ollama/ibm/granite-docling:258m';
const BIFROST_REQUEST_TIMEOUT_MS = Number(process.env.SOURCE_REF_BIFROST_TIMEOUT_MS || 20_000);

dotenv.config({ path: ENV_PATH });

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const splitAt = trimmed.indexOf('=');
    if (splitAt === -1) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBifrostModel(model) {
  const text = toNonEmptyString(model) ?? DEFAULT_BIFROST_MODEL;
  return text.includes('/') ? text : `ollama/${text}`;
}

function uniqueModels(models) {
  return [...new Set((models ?? []).map((model) => normalizeBifrostModel(model)).filter(Boolean))];
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text ?? '')).digest('hex');
}

function shortHash(text, len = 12) {
  return hashText(text).slice(0, len);
}

function buildPacketKey(featureId, queryHash, chunkId) {
  const safeChunk = String(chunkId ?? '').replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 64);
  return ['nes', String(featureId ?? 'unknown').replace(/[^a-zA-Z0-9:_-]/g, '_'), String(queryHash ?? '').slice(0, 16), safeChunk].join(':');
}

function sentenceFallback(text, maxChars = 240) {
  const cleaned = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const sentences = cleaned.match(/[^.!?\n]{10,}[.!?]/g) || [];
  const fallback = sentences.slice(0, 2).join(' ') || cleaned;
  return fallback.slice(0, maxChars);
}

function buildClusterItem(cluster, reportGeneratedAt) {
  const topFiles = Array.isArray(cluster.topFiles) ? cluster.topFiles.filter(Boolean).slice(0, 6) : [];
  const sourceRef = topFiles[0] ?? cluster.clusterKey ?? 'unknown';
  const sourceRefs = [...new Set([sourceRef, ...topFiles])];
  const featureId = `cluster:${shortHash(cluster.clusterKey ?? sourceRef, 10)}`;
  const queryHash = hashText(`sourceRef-first-cluster:${cluster.clusterKey}:${reportGeneratedAt}`);
  const chunkId = shortHash(`cluster:${cluster.clusterKey}:${sourceRef}`);
  const prompt = [
    'Create a compact NES/Glyph summary card.',
    `Kind: cluster`,
    `featureId: ${featureId}`,
    `sourceRef: ${sourceRef}`,
    `clusterKey: ${cluster.clusterKey}`,
    `hotness: ${Number(cluster.hotness ?? 0).toFixed(4)}`,
    `fileCount: ${Number(cluster.fileCount ?? 0)}`,
    `topTags: ${(cluster.topTags ?? []).slice(0, 6).join(', ') || 'none'}`,
    `topFiles: ${topFiles.join(', ') || 'none'}`,
    `Prompt: ${cluster.prompt ?? ''}`,
  ].join('\n');
  return {
    kind: 'cluster',
    featureId,
    sourceRef,
    sourceRefs,
    queryHash,
    chunkId,
    summaryKey: `sourceRef-first:cluster:${cluster.clusterKey}`,
    title: `Cluster ${cluster.clusterKey}`,
    prompt,
    payload: {
      clusterKey: cluster.clusterKey,
      clusterId: cluster.clusterId ?? null,
      hotness: cluster.hotness ?? null,
      fileCount: cluster.fileCount ?? null,
      topTags: cluster.topTags ?? [],
      topFiles,
      sourceRefFirstReportAt: reportGeneratedAt,
      sourceRefFirstWarmupKind: 'cluster',
    },
  };
}

function buildPacketItem(packet, reportGeneratedAt) {
  const sourceRefs = [...new Set([packet.sourceRef, ...(packet.sourceRefs ?? []), ...(packet.hitSourceRefs ?? [])].map((value) => toNonEmptyString(value)).filter(Boolean))];
  const sourceRef = sourceRefs[0] ?? packet.sourceRef ?? 'unknown';
  const featureId = `feature:${toNonEmptyString(packet.featureId) ?? 'unknown'}`;
  const queryHash = toNonEmptyString(packet.queryHash) ?? hashText(`sourceRef-first-packet:${sourceRef}:${reportGeneratedAt}`);
  const chunkId = toNonEmptyString(packet.chunkId) ?? shortHash(`${sourceRef}:${queryHash}`);
  const prompt = [
    'Create a compact NES/Glyph summary card.',
    `Kind: nes_packet`,
    `featureId: ${featureId}`,
    `sourceRef: ${sourceRef}`,
    `queryHash: ${queryHash}`,
    `chunkId: ${chunkId}`,
    `Packet summary: ${toNonEmptyString(packet.summary) ?? 'none'}`,
    `Packet sourceRefs: ${sourceRefs.slice(0, 6).join(', ') || 'none'}`,
    `Hit sourceRefs: ${(packet.hitSourceRefs ?? []).slice(0, 6).join(', ') || 'none'}`,
    `Prompt: ${packet.prompt ?? ''}`,
  ].join('\n');
  return {
    kind: 'nes_packet',
    featureId,
    sourceRef,
    sourceRefs,
    queryHash,
    chunkId,
    summaryKey: `sourceRef-first:packet:${featureId}:${queryHash.slice(0, 16)}`,
    title: `Packet ${featureId}`,
    prompt,
    payload: {
      packetKey: packet.packetKey ?? null,
      packetId: packet.packetId ?? null,
      hitCount: Number(packet.hitCount ?? 0),
      hitSourceRefs: packet.hitSourceRefs ?? [],
      communityCount: Number(packet.communityCount ?? 0),
      sourceRefFirstReportAt: reportGeneratedAt,
      sourceRefFirstWarmupKind: 'nes_packet',
    },
  };
}

async function summarizeWithGemma({ bifrostUrl, modelCandidates, prompt, cacheKey, dryRun }) {
  if (dryRun) {
    return {
      ok: true,
      model: modelCandidates[0] ?? DEFAULT_BIFROST_MODEL,
      summary: sentenceFallback(prompt, 240),
      dryRun: true,
    };
  }

  let lastError = null;
  for (const model of modelCandidates) {
    try {
      const res = await fetch(`${bifrostUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-bf-cache-ttl': String(3600),
          'x-bf-cache-type': 'semantic',
          'x-bf-cache-key': cacheKey,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You summarize codebase packets for retrieval. Return a compact, grounded paragraph and do not invent facts.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 160,
          temperature: 0.1,
          stream: false,
        }),
        signal: AbortSignal.timeout(BIFROST_REQUEST_TIMEOUT_MS),
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        const summary =
          data?.choices?.[0]?.message?.content ??
          data?.choices?.[0]?.text ??
          data?.output ??
          data?.text ??
          sentenceFallback(prompt, 240);
        return { ok: true, model, summary, dryRun: false };
      }

      const body = await res.text().catch(() => '');
      lastError = new Error(`Bifrost HTTP ${res.status} with ${model}${body ? `: ${body.slice(0, 200)}` : ''}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  return {
    ok: false,
    model: modelCandidates[0] ?? DEFAULT_BIFROST_MODEL,
    summary: sentenceFallback(prompt, 240),
    error: lastError?.message ?? 'Bifrost summary failed',
    dryRun: false,
  };
}

function writeOutputs(report) {
  fs.mkdirSync(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_JSONL_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUTPUT_MD_PATH, buildMarkdown(report), 'utf8');
  fs.writeFileSync(
    OUTPUT_JSONL_PATH,
    `${report.outputs.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    'utf8',
  );
}

function buildMarkdown(report) {
  const lines = [
    '# SourceRef-First NES/Glyph Compression',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Inputs',
    '',
    `- warmup report: ${report.inputs.warmupReport}`,
    `- cluster limit: ${report.inputs.clusterLimit}`,
    `- packet limit: ${report.inputs.packetLimit}`,
    `- Bifrost models: ${report.inputs.bifrostModels.join(', ')}`,
    '',
    '## Output',
    '',
    `- selected items: ${report.summary.selectedItems}`,
    `- summaries generated: ${report.summary.summariesGenerated}`,
    `- packets persisted: ${report.summary.packetsPersisted}`,
    `- hits persisted: ${report.summary.hitsPersisted}`,
    `- Bifrost fallbacks: ${report.summary.bifrostFallbacks}`,
    `- errors: ${report.summary.errors}`,
    '',
    '## Top sourceRefs',
    '',
    ...(report.top.sourceRefs.length > 0 ? report.top.sourceRefs.map((row) => `- ${row.value}: ${row.count}`) : ['- none']),
    '',
    '## Top featureIds',
    '',
    ...(report.top.featureIds.length > 0 ? report.top.featureIds.map((row) => `- ${row.value}: ${row.count}`) : ['- none']),
    '',
    '## Notes',
    '',
    '- This lane turns the sourceRef-first warmup report into reusable NES/Glyph packets.',
    '- Gemma4/Bifrost summaries are best-effort and fall back to deterministic packet summaries if the gateway is slow or unavailable.',
    '- The packet layer is persisted through the existing NES chrom packet service, so the join spine remains sourceRef + featureId + queryHash.',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const env = loadEnv();
  const { values } = parseArgs({
    options: {
      dryRun: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      limit: { type: 'string' },
      skipBifrost: { type: 'boolean', default: false },
      skipPersist: { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: false,
  });

  const dryRun = Boolean(values.dryRun) || !Boolean(values.apply);
  const skipBifrost = Boolean(values.skipBifrost);
  const skipPersist = Boolean(values.skipPersist);
  const limit = clampInt(values.limit, 2, 1, 32);

  if (!fs.existsSync(INPUT_JSON_PATH)) {
    console.error(`[sourceRef-compress] warmup report not found: ${INPUT_JSON_PATH}`);
    process.exit(1);
  }

  const warmupReport = loadJson(INPUT_JSON_PATH, null);
  if (!warmupReport) {
    console.error('[sourceRef-compress] could not read warmup report');
    process.exit(1);
  }

  const bifrostUrl = process.env.BIFROST_URL || env.BIFROST_URL || DEFAULT_BIFROST_URL;
  const bifrostModels = uniqueModels([
    warmupReport?.inputs?.bifrostModel,
    ...(warmupReport?.inputs?.bifrostModelCandidates ?? []),
    process.env.BIFROST_MODEL || env.BIFROST_MODEL,
    process.env.BIFROST_MODEL_ALT || env.BIFROST_MODEL_ALT,
    process.env.OLLAMA_MODEL || env.OLLAMA_MODEL,
    FALLBACK_BIFROST_MODEL,
  ]);

  const generatedAt = new Date().toISOString();
  const clusterItems = Array.isArray(warmupReport?.samples?.clusters) ? warmupReport.samples.clusters.slice(0, limit) : [];
  const packetItems = Array.isArray(warmupReport?.samples?.packets) ? warmupReport.samples.packets.slice(0, limit) : [];
  const selectedItems = [...clusterItems.map((item) => buildClusterItem(item, warmupReport.generatedAt)), ...packetItems.map((item) => buildPacketItem(item, warmupReport.generatedAt))];

  const report = {
    schema: 'sourceRef_first_nes_glyph_compress_report.v1',
    generatedAt,
    mode: dryRun ? 'dry-run' : 'apply',
    inputs: {
      warmupReport: INPUT_JSON_PATH,
      clusterLimit: limit,
      packetLimit: limit,
      bifrostModels,
    },
    summary: {
      selectedItems: selectedItems.length,
      summariesGenerated: 0,
      packetsPersisted: 0,
      hitsPersisted: 0,
      bifrostFallbacks: 0,
      errors: 0,
    },
    top: {
      featureIds: [],
      sourceRefs: [],
    },
    outputs: [],
  };

  const sourceRefCounts = new Map();
  const featureIdCounts = new Map();
  const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const redisUrl = process.env.REDIS_URL || env.REDIS_URL || DEFAULT_REDIS_URL;
  const redisPassword = process.env.REDIS_PASSWORD || env.REDIS_PASSWORD || null;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  let redis = null;
  let client = null;
  let runId = null;

  try {
    if (!dryRun && !skipPersist) {
      const redisOptions = {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      };
      if (redisPassword) redisOptions.password = redisPassword;
      redis = new Redis(redisUrl, redisOptions);
      redis.on('error', () => {});
      await redis.connect().catch(() => null);
      client = await pool.connect();
      await client.query('BEGIN');
      const runInsert = await client.query(
        `
          INSERT INTO kag_dag_runs (
            query, query_hash, intent, status, model, total_duration_ms,
            final_answer, final_json, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
          RETURNING id
        `,
        [
          'sourceRef-first NES/Glyph compression',
          hashText(`sourceRef-first-nes-glyph-compress:${generatedAt}`),
          'source_ref_first_compression',
          'completed',
          bifrostModels[0] ?? DEFAULT_BIFROST_MODEL,
          0,
          'SourceRef-first warmup samples compressed into reusable NES/Glyph summary packets.',
          JSON.stringify({ ok: true, selectedItems: selectedItems.length }),
          JSON.stringify({
            warmupReport: INPUT_JSON_PATH,
            compressionAt: generatedAt,
            modelCandidates: bifrostModels,
          }),
        ],
      );
      runId = runInsert.rows[0]?.id ?? null;
    }

    for (const item of selectedItems) {
      const cacheKey = `sourceRef-first:compress:${item.kind}:${item.featureId}:${item.queryHash.slice(0, 16)}`;
      const summaryResult = await summarizeWithGemma({
        bifrostUrl,
        modelCandidates: bifrostModels,
        prompt: item.prompt,
        cacheKey,
        dryRun,
      });

      if (summaryResult.ok && summaryResult.dryRun) {
        report.summary.summariesGenerated += 1;
      } else if (summaryResult.ok) {
        report.summary.summariesGenerated += 1;
      } else {
        report.summary.summariesGenerated += 1;
        report.summary.bifrostFallbacks += 1;
      }
      if (summaryResult.error) {
        report.summary.errors += 1;
      }

      const sourceRefs = Array.from(new Set([item.sourceRef, ...(item.sourceRefs ?? [])].map((value) => toNonEmptyString(value)).filter(Boolean)));
      const summary = sentenceFallback(summaryResult.summary || item.prompt, 360);
      const packetKey = buildPacketKey(item.featureId, item.queryHash, item.chunkId);
      const hitList = sourceRefs.map((sr, idx) => ({
        chunkId: item.chunkId,
        sourceRef: sr,
        hitType: idx === 0 ? 'primary' : 'related',
        score: idx === 0 ? 1 : Math.max(0.5, 1 - idx * 0.1),
        nodeKey: item.summaryKey,
        evidence: {
          kind: item.kind,
          featureId: item.featureId,
          sourceRefFirstSummaryKey: item.summaryKey,
        },
        metadata: {
          sourceRefFirstSummary: summary,
          sourceRefFirstCompressionAt: generatedAt,
          sourceRefFirstReportAt: warmupReport.generatedAt,
        },
      }));

      if (!dryRun && !skipPersist && client) {
        const payload = {
          sourceRefFirstKind: item.kind,
          sourceRefFirstPrompt: item.prompt,
          sourceRefFirstSummary: summary,
          sourceRefFirstReportAt: warmupReport.generatedAt,
          sourceRefFirstCompressionAt: generatedAt,
          sourceRefFirstSummaryKey: item.summaryKey,
          sourceRefFirstBifrostModel: summaryResult.model,
        };

        const upsert = await client.query(
          `
            INSERT INTO nes_chrom_packets (
              packet_key, query_hash, chunk_id, source_ref, source_refs, feature_id,
              packet_type, lane, model, summary, payload, embedding, qdrant_point_id,
              kag_dag_run_id, kag_node_key, token_budget, created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5::jsonb, $6,
              'nes_chrom', 'source_ref_first_compression', $7, $8, $9::jsonb, NULL, NULL,
              $10, $11, 360, NOW(), NOW()
            )
            ON CONFLICT (packet_key) DO UPDATE SET
              summary = EXCLUDED.summary,
              payload = EXCLUDED.payload,
              source_refs = EXCLUDED.source_refs,
              kag_dag_run_id = EXCLUDED.kag_dag_run_id,
              kag_node_key = EXCLUDED.kag_node_key,
              token_budget = EXCLUDED.token_budget,
              updated_at = NOW()
            RETURNING id
          `,
          [
            packetKey,
            item.queryHash,
            item.chunkId,
            item.sourceRef,
            JSON.stringify(sourceRefs),
            item.featureId,
            summaryResult.model,
            summary,
            JSON.stringify(payload),
            runId,
            item.summaryKey,
          ],
        );
        const packetId = upsert.rows[0]?.id ?? null;

        if (packetId && hitList.length > 0) {
          await client.query(`DELETE FROM nes_chrom_kag_dag_hits WHERE packet_id = $1`, [packetId]);
          for (const hit of hitList) {
            await client.query(
              `
                INSERT INTO nes_chrom_kag_dag_hits (
                  packet_id, run_id, chunk_id, source_ref, hit_type, score, node_key, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
              `,
              [
                packetId,
                runId,
                hit.chunkId,
                hit.sourceRef,
                hit.hitType,
                hit.score,
                hit.nodeKey,
              ],
            );
          }
        }

        if (redis) {
          await redis.set(
            `bifrost:kag:${cacheKey}`,
            JSON.stringify({
              kind: 'source_ref_first_compressed_packet',
              packetId,
              packetKey,
              featureId: item.featureId,
              sourceRef: item.sourceRef,
              sourceRefs,
              queryHash: item.queryHash,
              chunkId: item.chunkId,
              summary,
              sourceRefFirstReportAt: warmupReport.generatedAt,
              sourceRefFirstCompressionAt: generatedAt,
            }),
            'EX',
            3600 * 4,
          ).catch(() => null);
        }

        report.summary.packetsPersisted += 1;
        report.summary.hitsPersisted += hitList.length;
      }

      for (const sr of sourceRefs) {
        sourceRefCounts.set(sr, (sourceRefCounts.get(sr) ?? 0) + 1);
      }
      featureIdCounts.set(item.featureId, (featureIdCounts.get(item.featureId) ?? 0) + 1);

      report.outputs.push({
        kind: item.kind,
        sourceRef: item.sourceRef,
        sourceRefs,
        featureId: item.featureId,
        queryHash: item.queryHash,
        chunkId: item.chunkId,
        summary,
        summaryKey: packetKey,
        cachedKey: cacheKey,
        persisted: !dryRun && !skipPersist,
        bifrostModel: summaryResult.model,
        bifrostFallback: Boolean(summaryResult.error),
        hitCount: hitList.length,
      });
    }

    if (client) {
      await client.query('COMMIT');
    }
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => null);
    }
    throw error;
  } finally {
    if (client) client.release();
    await pool.end().catch(() => null);
    if (redis) await redis.quit().catch(() => null);
  }

  report.top.sourceRefs = [...sourceRefCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 10);
  report.top.featureIds = [...featureIdCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 10);

  writeOutputs(report);

  console.log(`[sourceRef-compress] items=${report.summary.selectedItems} summaries=${report.summary.summariesGenerated} packets=${report.summary.packetsPersisted} hits=${report.summary.hitsPersisted} errors=${report.summary.errors}`);
  console.log(`[sourceRef-compress] json=${OUTPUT_JSON_PATH}`);
  console.log(`[sourceRef-compress] md=${OUTPUT_MD_PATH}`);
  console.log(`[sourceRef-compress] jsonl=${OUTPUT_JSONL_PATH}`);
}

main().catch((err) => {
  console.error('[sourceRef-compress] fatal:', err?.message ?? err);
  process.exit(1);
});
