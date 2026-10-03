#!/usr/bin/env node
/**
 * Read-only, keyset-paginated export of legacy summary evidence from PostgreSQL.
 * Output is a local forensic/hint artifact; it never admits summaries or writes
 * ACE, embeddings, projections, queues, or database rows.
 *
 * Usage: npx tsx scripts/atlas/export-legacy-summary-evidence-v1.mts
 *        [--source=all|chunks|packets|layers] [--batch=1000] [--limit=5000]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { analyzeSummaryContaminationV1 } from './lib/summary-quality-v1.mjs';

type Source = 'chunks' | 'packets' | 'layers';
type RawRow = Record<string, unknown>;
const args = new Map(process.argv.slice(2).map((arg) => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, i), arg.slice(i + 1)];
}));
if (args.has('help')) {
  console.log('Read-only legacy summary export. --source=all|chunks|packets|layers --batch=1000 --limit=5000');
  process.exit(0);
}
const sourceArg = args.get('source') ?? 'all';
if (!['all', 'chunks', 'packets', 'layers'].includes(sourceArg)) throw new Error('INVALID_SOURCE');
const sources: Source[] = sourceArg === 'all' ? ['chunks', 'packets', 'layers'] : [sourceArg as Source];
const batch = Math.max(1, Math.min(10_000, Number(args.get('batch') ?? 1000)));
const limit = Math.max(0, Number(args.get('limit') ?? 0));
if (!Number.isSafeInteger(batch) || !Number.isSafeInteger(limit)) throw new Error('INVALID_BATCH_OR_LIMIT');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300_000 });
const client = await pool.connect();
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(REPO_ROOT, '.tmp/atlas/legacy-summary-evidence-v1', stamp);
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'legacy-summary-evidence.ndjson');
const manifestPath = path.join(outDir, 'manifest.json');
const output = fs.createWriteStream(outPath, { flags: 'wx' });
const rootHash = crypto.createHash('sha256');
const digest = (text: string) => `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
const textOrNull = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null;
const counters: Record<string, { rows: number; withText: number; withSourceRevision: number; byQuality: Record<string, number> }> = {};
for (const source of sources) counters[source] = { rows: 0, withText: 0, withSourceRevision: 0, byQuality: {} };
const writeLine = async (line: string) => {
  if (!output.write(line)) await once(output, 'drain');
};

function summaryFromRow(source: Source, row: RawRow): { text: string | null; field: string | null } {
  if (source === 'chunks') {
    const admitted = textOrNull(row.summaryText);
    if (admitted) return { text: admitted, field: 'summary_text' };
    const legacy = textOrNull(row.legacySummary);
    return { text: legacy, field: legacy ? 'summary (legacy/unverified)' : null };
  }
  if (source === 'packets') return { text: textOrNull(row.summary), field: textOrNull(row.summary) ? 'atlas_packets.summary' : null };
  const value = textOrNull(row.summaryText) ?? textOrNull(row.summary);
  return { text: value, field: value ? (textOrNull(row.summaryText) ? 'summary_text' : 'summary') : null };
}

const queries: Record<Source, (last: string, pageSize: number) => Promise<RawRow[]>> = {
  chunks: async (last, pageSize) => (await client.query(`
    SELECT id::text AS cursor_id, jsonb_build_object(
      'chunkRowId', id::text, 'chunkId', chunk_id, 'sourceRef', source_ref,
      'sourceRevision', source_revision, 'workspaceRevision', workspace_revision,
      'summaryText', summary_text, 'legacySummary', "summary",
      'summaryProvenance', summary_provenance, 'summaryModel', summary_model,
      'relativePath', relative_path, 'language', language, 'fileContentHash', file_content_hash,
      'contentPresent', (content IS NOT NULL), 'contentSha256', CASE WHEN content IS NULL THEN NULL ELSE 'sha256:' || encode(digest(convert_to(content, 'UTF8'), 'sha256'), 'hex') END
    ) AS data
    FROM public.codebase_chunk_index
    WHERE id > $1::uuid AND (nullif(btrim(summary_text), '') IS NOT NULL OR nullif(btrim("summary"), '') IS NOT NULL)
    ORDER BY id LIMIT $2`, [last, pageSize])).rows,
  packets: async (last, pageSize) => (await client.query(`
    SELECT packet_key AS cursor_id, jsonb_build_object(
      'packetKey', packet_key, 'sourceRef', source_ref, 'sourceRevision', source_revision,
      'workspaceRevision', workspace_revision, 'summary', summary,
      'summaryHash', summary_hash, 'filePath', file_path, 'metadata', metadata
    ) AS data
    FROM public.atlas_packets
    WHERE packet_key > $1 AND nullif(btrim(summary), '') IS NOT NULL
    ORDER BY packet_key LIMIT $2`, [last, pageSize])).rows,
  layers: async (last, pageSize) => (await client.query(`
    SELECT ctid::text AS cursor_id, jsonb_build_object(
      'packetKey', packet_key, 'layerType', layer_type, 'summaryLevel', summary_level,
      'generatedAt', generated_at, 'createdAt', created_at, 'modelName', model_name,
      'embeddingModel', embedding_model, 'summaryText', summary_text, 'summary', summary,
      'metadata', metadata, 'embeddingPresent', (embedding IS NOT NULL)
    ) AS data
    FROM public.atlas_summary_layers
    WHERE ctid > $1::tid AND (nullif(btrim(summary_text), '') IS NOT NULL OR nullif(btrim(summary), '') IS NOT NULL)
    ORDER BY ctid LIMIT $2`, [last, pageSize])).rows,
};

const initialCursor: Record<Source, string> = {
  chunks: '00000000-0000-0000-0000-000000000000', packets: '', layers: '(0,0)',
};

try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  for (const source of sources) {
    let cursor = initialCursor[source];
    const stats = counters[source];
    while (!limit || stats.rows < limit) {
      const take = limit ? Math.min(batch, limit - stats.rows) : batch;
      const rows = await queries[source](cursor, take);
      if (!rows.length) break;
      for (const raw of rows) {
        cursor = String(raw.cursor_id);
        const data = raw.data as RawRow;
        const { text, field } = summaryFromRow(source, data);
        if (!text) continue;
        const summaryQuality = analyzeSummaryContaminationV1(text);
        const sourceRevision = textOrNull(data.sourceRevision);
        const record = {
          schema: 'atlas.legacy-summary-evidence.v1', source,
          identity: {
            packetKey: textOrNull(data.packetKey), chunkRowId: textOrNull(data.chunkRowId),
            chunkId: textOrNull(data.chunkId), sourceRef: textOrNull(data.sourceRef),
            sourceRevision, workspaceRevision: textOrNull(data.workspaceRevision),
          },
          summary: { field, text, digest: digest(text), quality: summaryQuality.reasons.length ? 'QUARANTINE' : 'CLEAN_HINT_ONLY', qualityReasons: summaryQuality.reasons },
          sourceMetadata: data,
          lineageState: sourceRevision ? 'REVISION_FIELD_PRESENT_UNVERIFIED' : 'REVISION_MISSING',
          evidenceStatus: 'HISTORICAL_OR_UNREVALIDATED',
          canonicalAdmission: false,
          notes: ['Exported as legacy evidence only; no current source binding recheck was performed.', 'FTS/search matches are candidate discovery, not identity proof.', 'Never insert this row directly into ACE or summary admission.'],
        };
        const line = `${JSON.stringify(record)}\n`;
        await writeLine(line); rootHash.update(line);
        stats.rows++; stats.withText++;
        if (sourceRevision) stats.withSourceRevision++;
        const qualityKey = summaryQuality.reasons.length ? summaryQuality.reasons.join('+') : 'CLEAN_HINT_ONLY';
        stats.byQuality[qualityKey] = (stats.byQuality[qualityKey] ?? 0) + 1;
      }
      if (rows.length < take) break;
      console.log(`${source}: exported=${stats.rows}`);
    }
  }
  await client.query('ROLLBACK');
  output.end();
  await once(output, 'finish');
  const manifest = {
    schema: 'atlas.legacy-summary-evidence-manifest.v1', mode: 'READ_ONLY', sources,
    pagination: 'B-tree primary-key keyset for chunks/packets; transaction-local ctid cursor for legacy summary layers only',
    batchSize: batch, perSourceLimit: limit || null, rows: Object.values(counters).reduce((n, item) => n + item.rows, 0),
    counters, shard: path.relative(REPO_ROOT, outPath).replaceAll('\\', '/'),
    shardSha256: `sha256:${rootHash.digest('hex')}`, databaseWrites: 0, queuePublishes: 0,
    embeddingCalls: 0, projectionWrites: 0, aceAdmissions: 0,
    identityWarning: 'Present source/workspace revision columns are copied as observations only; this export does not join current authoritative bindings.',
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ manifest: path.relative(REPO_ROOT, manifestPath), rows: manifest.rows, databaseWrites: 0 }, null, 2));
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
  output.destroy();
  throw error;
} finally {
  client.release();
  await pool.end();
}
