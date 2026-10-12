#!/usr/bin/env node
/**
 * CHUNK_PRODUCER_01 Chunk Producer Provenance Diagnostic (v1)
 *
 * Investigates producer provenance for codebase_chunk_index content and lineage.
 * Separates content producers from lineage producers.
 * Enforces:
 * - admissionAuthorized: false
 * - writesPerformed: false
 * - canonicalAuthority: false
 * - producerIdentified remains false unless exact cryptographic/AST evidence confirms the specific writer.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SCHEMA_V1 = 'atlas.chunk-producer-provenance.v1';
export const GATE_NAME = 'CHUNK_PRODUCER_01';

export const KNOWN_CONTENT_PRODUCERS = [
  'scripts/atlas/index-full-repo-for-search.mjs',
  'sveltekit-frontend/src/routes/api/codebase-index/index-stream/+server.ts',
  'sveltekit-frontend/scripts/batch-upsert-codeintel.mjs',
  'sveltekit-frontend/scripts/mirror-qdrant-to-postgres.ts',
];

export const KNOWN_LINEAGE_PRODUCERS = [
  'scripts/atlas/register-orphaned-chunks.mjs',
  'scripts/atlas/apply-codebase-chunk-lineage-backfill-v2.mjs',
  'scripts/atlas/apply-codebase-chunk-lineage-backfill-v1.mjs',
];

export function sha256Hex(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function evaluateChunkProducerProvenance(chunk, currentFileContent, historicalCommits = []) {
  const content = String(chunk.content ?? '').replace(/\r\n/g, '\n').trim();
  const storedChunkDigest = sha256Hex(content);

  let exactCurrentSourceMatch = false;
  if (currentFileContent != null) {
    const currentNorm = String(currentFileContent).replace(/\r\n/g, '\n');
    exactCurrentSourceMatch = content.length > 0 && currentNorm.includes(content);
  }

  const historicalSourceMatches = [];
  if (!exactCurrentSourceMatch && historicalCommits.length > 0) {
    for (const { commit, fileText } of historicalCommits) {
      if (fileText && String(fileText).replace(/\r\n/g, '\n').includes(content)) {
        historicalSourceMatches.push(commit);
      }
    }
  }

  // Determine possible producers based on chunk metadata fields
  const possibleContentProducers = [...KNOWN_CONTENT_PRODUCERS];
  const possibleLineageProducers = [...KNOWN_LINEAGE_PRODUCERS];

  // Specific heuristic attribution if present in chunk fields
  if (chunk.chunk_source === 'TEXT_FALLBACK' || chunk.ast_status === 'UNAVAILABLE') {
    // index-full-repo-for-search.mjs produces chunk_source = 'TEXT_FALLBACK'
    possibleContentProducers.unshift('scripts/atlas/index-full-repo-for-search.mjs:TEXT_FALLBACK');
  }

  // Lineage qualification requires exact current source match AND no historical mismatch
  const lineageQualified = exactCurrentSourceMatch && historicalSourceMatches.length === 0;

  // producerIdentified is strictly false until a cryptographic signature or AST provenance unequivocally links writer
  const producerIdentified = false;

  return {
    schema: SCHEMA_V1,
    gate: GATE_NAME,
    chunkId: String(chunk.id ?? chunk.chunk_id),
    sourceRef: chunk.source_ref ?? chunk.relative_path,
    claimedSourceRevision: chunk.source_revision ?? 'UNASSIGNED',
    storedChunkDigest,
    exactCurrentSourceMatch,
    historicalSourceMatches,
    possibleContentProducers: [...new Set(possibleContentProducers)],
    possibleLineageProducers: [...new Set(possibleLineageProducers)],
    producerIdentified,
    lineageQualified,
    admissionAuthorized: false,
    writesPerformed: false,
  };
}

export async function runProvenanceAudit(options = {}) {
  const root = options.root ?? ROOT;
  const limit = Number(options.limit ?? 25);
  const filterRef = options.filterSourceRef ?? null;

  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    statement_timeout: 60000,
    application_name: 'prove-chunk-producer-provenance-v1',
  });

  const client = await pool.connect();
  const records = [];

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const query = filterRef
      ? `
        SELECT c.id, c.chunk_id, c.relative_path, c.source_ref, c.content,
               c.content_hash, c.file_content_hash, c.source_revision,
               c.kind, c.ast_symbols,
               l.lineage_producer_revision, l.revision_status
        FROM public.codebase_chunk_index c
        LEFT JOIN public.atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id
        WHERE c.content IS NOT NULL AND c.relative_path IS NOT NULL
          AND lower(regexp_replace(regexp_replace(btrim(c.relative_path), '\\\\', '/', 'g'), '^\\./', '')) LIKE $2
        ORDER BY c.id
        LIMIT $1;
      `
      : `
        SELECT c.id, c.chunk_id, c.relative_path, c.source_ref, c.content,
               c.content_hash, c.file_content_hash, c.source_revision,
               c.kind, c.ast_symbols,
               l.lineage_producer_revision, l.revision_status
        FROM public.codebase_chunk_index c
        LEFT JOIN public.atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id
        WHERE c.content IS NOT NULL AND c.relative_path IS NOT NULL
        ORDER BY c.id
        LIMIT $1;
      `;

    const params = filterRef ? [limit, `%${filterRef.toLowerCase()}%`] : [limit];
    const res = await client.query(query, params);

    const fileCache = new Map();
    const commitsCache = new Map();

    for (const row of res.rows) {
      const relPath = (row.relative_path || row.source_ref).split(path.sep).join('/');
      const absPath = path.resolve(root, relPath);

      let currentFileContent = null;
      if (fs.existsSync(absPath)) {
        if (!fileCache.has(relPath)) {
          try {
            fileCache.set(relPath, fs.readFileSync(absPath, 'utf8'));
          } catch {
            fileCache.set(relPath, null);
          }
        }
        currentFileContent = fileCache.get(relPath);
      }

      // Lazy check of git history only if chunk content is absent from current file
      const content = String(row.content ?? '').replace(/\r\n/g, '\n').trim();
      const inCurrent = currentFileContent && content.length > 0 && currentFileContent.includes(content);

      let historicalCommits = [];
      if (!inCurrent) {
        if (!commitsCache.has(relPath)) {
          const loaded = [];
          try {
            const commitList = execFileSync('git', ['log', '-n10', '--format=%H', '--', relPath], {
              cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
            }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

            for (const commit of commitList) {
              try {
                const text = execFileSync('git', ['show', `${commit}:${relPath}`], {
                  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
                });
                loaded.push({ commit, fileText: text });
              } catch {
                // Ignore missing file in commit
              }
            }
          } catch {
            // Ignore git log errors
          }
          commitsCache.set(relPath, loaded);
        }
        historicalCommits = commitsCache.get(relPath);
      }

      const provenance = evaluateChunkProducerProvenance(row, currentFileContent, historicalCommits);
      records.push(provenance);
    }

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }

  const generatedAt = new Date().toISOString();
  const receipt = {
    schema: 'atlas.chunk-producer-provenance-report.v1',
    gate: GATE_NAME,
    generatedAt,
    readOnly: true,
    writesPerformed: false,
    canonicalAuthority: false,
    admissionAuthorized: false,
    producerCensus: {
      knownContentProducers: KNOWN_CONTENT_PRODUCERS,
      knownLineageProducers: KNOWN_LINEAGE_PRODUCERS,
    },
    totalAudited: records.length,
    counts: {
      exactCurrentSourceMatch: records.filter((r) => r.exactCurrentSourceMatch).length,
      historicalSourceMatches: records.filter((r) => r.historicalSourceMatches.length > 0).length,
      lineageQualified: records.filter((r) => r.lineageQualified).length,
      producerIdentified: records.filter((r) => r.producerIdentified).length, // 0
    },
    records,
  };

  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  const checksum = `sha256:${sha256Hex(receiptJson)}`;
  receipt.receiptChecksum = checksum;

  const tmpPath = path.resolve(root, '.tmp/atlas/chunk-producer-provenance-v1.json');
  const reportPath = path.resolve(root, 'docs/reports/chunk-producer-provenance-v1.json');
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  fs.writeFileSync(tmpPath, receiptJson, 'utf8');
  fs.writeFileSync(reportPath, receiptJson, 'utf8');

  return {
    reportPath,
    checksum,
    totalAudited: records.length,
    counts: receipt.counts,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 25;
  const filterArg = process.argv.find((a) => a.startsWith('--filter='));
  const filterSourceRef = filterArg ? filterArg.split('=')[1] : null;

  runProvenanceAudit({ limit, filterSourceRef })
    .then((res) => console.log(JSON.stringify(res, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
