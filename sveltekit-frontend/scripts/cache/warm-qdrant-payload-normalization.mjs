#!/usr/bin/env node
/**
 * Warm a small Redis/Bifrost lookup layer after Qdrant payload normalization.
 *
 * This script is intentionally read-only unless --apply is provided.
 * It reads the latest normalization report and stores compact lookup keys:
 *   - atlas:qdrant:payload:packet:{packet_key} -> JSON envelope
 *   - atlas:qdrant:payload:sourceRef:{sha256} -> packet_key
 *   - atlas:qdrant:payload:filePath:{sha256} -> packet_key
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from 'redis';
import { loadAtlasEnv } from '../atlas/load-atlas-env.mjs';
import { normalizeSourceRef, sourceRefHash } from '../atlas/canonical-source-ref.mjs';
import { resolveRedisConfig, resolveRedisUrl } from '../../../scripts/atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const DEFAULT_REPORT = path.join(REPORT_DIR, 'qdrant-payload-complete-backfill.json');
const FALLBACK_REPORTS = [
  path.join(REPORT_DIR, 'qdrant-payload-complete-backfill.json'),
  path.join(REPORT_DIR, 'qdrant-payload-schema-normalization-apply.json'),
  path.join(REPORT_DIR, 'qdrant-payload-schema-normalization-dry-run.json'),
];

const DRY_RUN = !process.argv.includes('--apply');
const REPORT_PATH = process.argv.find((arg) => arg.startsWith('--report='))?.split('=', 2)[1] ?? DEFAULT_REPORT;
const TTL_SECONDS = Number.parseInt(process.env.QDRANT_NORMALIZATION_CACHE_TTL ?? '86400', 10);

function sha256(input) {
  return createHash('sha256').update(String(input)).digest('hex');
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function main() {
  loadAtlasEnv(ROOT);
  const runtimeEnv = {
    ...process.env,
    REDIS_PASSWORD: String(process.env.REDIS_PASSWORD ?? '').trim() || 'redis',
  };
  const redisConfig = resolveRedisConfig(runtimeEnv);
  const redisUrl = resolveRedisUrl(runtimeEnv);
  const client = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: () => false,
      connectTimeout: 5000,
    },
  });

  client.on('error', () => {});

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply',
    reportPath: path.relative(ROOT, REPORT_PATH).replace(/\\/g, '/'),
    redisUrl,
    redisHost: redisConfig.host,
    redisPort: redisConfig.port,
    rowsSeen: 0,
    packetKeysWritten: 0,
    sourceRefKeysWritten: 0,
    filePathKeysWritten: 0,
    skipped: 0,
    errors: 0,
    samples: [],
  };

  let bridgeReport;
  try {
    bridgeReport = await readJson(REPORT_PATH);
  } catch {
    let loaded = false;
    for (const candidate of FALLBACK_REPORTS) {
      try {
        bridgeReport = await readJson(candidate);
        report.note = `Primary report missing, fell back to ${path.relative(ROOT, candidate).replace(/\\/g, '/')}`;
        loaded = true;
        break;
      } catch {
        continue;
      }
    }
    if (!loaded) {
      throw new Error(`Unable to read normalization report at ${REPORT_PATH}`);
    }
  }
  const updates = Array.isArray(bridgeReport.updates) ? bridgeReport.updates : [];
  if (updates.length === 0) {
    report.note = 'Normalization report has no update rows; cache warm is a no-op.';
  }

  if (!DRY_RUN) {
    await client.connect();
  }

  try {
    for (const item of updates) {
      report.rowsSeen += 1;

      const packetKey = item.packet_key ?? null;
      const sourceRef = normalizeSourceRef(item.source_ref ?? '');
      const filePath = normalizeSourceRef(item.file_path ?? '');
      const pointId = item.qdrant_point_id ?? null;
      if (!packetKey || !pointId) {
        report.skipped += 1;
        continue;
      }

      const envelope = {
        packet_key: packetKey,
        qdrant_point_id: pointId,
        source_ref: sourceRef || null,
        file_path: filePath || null,
        feature_id: item.feature_id ?? null,
        feature_label: item.feature_label ?? null,
        updated_at: bridgeReport.generatedAt ?? new Date().toISOString(),
      };

      if (DRY_RUN) {
        report.packetKeysWritten += 1;
        if (sourceRef) report.sourceRefKeysWritten += 1;
        if (filePath) report.filePathKeysWritten += 1;
        if (report.samples.length < 15) {
          report.samples.push({ packet_key: packetKey, qdrant_point_id: pointId, source_ref: sourceRef || null, file_path: filePath || null });
        }
        continue;
      }

      const pipe = client.multi();
      pipe.set(`atlas:qdrant:payload:packet:${packetKey}`, JSON.stringify(envelope), { EX: TTL_SECONDS });
      pipe.set(`atlas:qdrant:payload:sourceRef:${sourceRefHash(sourceRef || packetKey)}`, packetKey, { EX: TTL_SECONDS });
      if (filePath) {
        pipe.set(`atlas:qdrant:payload:filePath:${sha256(filePath)}`, packetKey, { EX: TTL_SECONDS });
      }
      const response = await pipe.exec();
      if (!response) {
        report.errors += 1;
        continue;
      }
      report.packetKeysWritten += 1;
      if (sourceRef) report.sourceRefKeysWritten += 1;
      if (filePath) report.filePathKeysWritten += 1;
    }
  } catch (error) {
    report.errors += 1;
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (!DRY_RUN) {
      await client.quit().catch(() => client.disconnect().catch(() => {}));
    }
  }

  const outJson = path.join(REPORT_DIR, `qdrant-payload-normalization-cache-${DRY_RUN ? 'dry-run' : 'apply'}.json`);
  const outMd = path.join(REPORT_DIR, 'qdrant-payload-normalization-cache.md');

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    outMd,
    [
      '# Qdrant Payload Normalization Cache Warm',
      '',
      `Generated: ${report.generatedAt}`,
      `Mode: ${report.mode}`,
      `Report: ${report.reportPath}`,
      '',
      '## Summary',
      '',
      `- rows seen: ${report.rowsSeen}`,
      `- packet keys written: ${report.packetKeysWritten}`,
      `- sourceRef keys written: ${report.sourceRefKeysWritten}`,
      `- filePath keys written: ${report.filePathKeysWritten}`,
      `- skipped: ${report.skipped}`,
      `- errors: ${report.errors}`,
      '',
      '## Sample',
      '',
      ...(report.samples.length > 0
        ? report.samples.map((sample) => `- ${sample.packet_key} | point=${sample.qdrant_point_id} | source_ref=${sample.source_ref ?? 'n/a'} | file_path=${sample.file_path ?? 'n/a'}`)
        : ['- none']),
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify({
    ok: report.errors === 0,
    mode: report.mode,
    report: outJson,
    markdown: outMd,
    stats: {
      rowsSeen: report.rowsSeen,
      packetKeysWritten: report.packetKeysWritten,
      sourceRefKeysWritten: report.sourceRefKeysWritten,
      filePathKeysWritten: report.filePathKeysWritten,
      skipped: report.skipped,
      errors: report.errors,
    },
  }, null, 2));

  process.exit(report.errors === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('[atlas:qdrant:payload:cache-warm] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
