#!/usr/bin/env node

/** Bounded, read-only filesystem/hash scope reconciliation. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const rawLimit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 100);
const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 1000 ? rawLimit : 100;
const reportPath = path.join(REPO_ROOT, 'docs/reports/atlas-byte-scope-reconciliation-v1.json');
const MAX_READ_BYTES = 2 * 1024 * 1024 * 1024 - 1;
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const report = { schema: 'atlas.byte-scope-reconciliation.v1', generatedAt: new Date().toISOString(), readOnly: true, writesPerformed: false, sampleLimit: limit, status: 'UNKNOWN', classifications: {}, samples: [], authorities: {}, recommendation: null };
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cleanHash = (value) => String(value ?? '').trim().toLowerCase().replace(/^sha256:/, '');

function resolveSourcePath(sourceRef) {
  const normalized = String(sourceRef ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return null;
  const candidates = [path.resolve(REPO_ROOT, normalized)];
  if (!normalized.startsWith('sveltekit-frontend/')) candidates.push(path.resolve(REPO_ROOT, 'sveltekit-frontend', normalized));
  return candidates.find((candidate) => {
    const relative = path.relative(REPO_ROOT, candidate);
    return !relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  }) ?? null;
}

try {
  await pool.query('BEGIN READ ONLY');
  const [authority, artifacts, chunks, packets] = await Promise.all([
    pool.query(`SELECT
      (SELECT count(*) FROM public.atlas_artifacts WHERE content_hash IS NOT NULL) AS artifact_hashes,
      (SELECT count(*) FROM public.codebase_chunk_index WHERE content_hash IS NOT NULL) AS chunk_hashes,
      (SELECT count(*) FROM public.atlas_packets WHERE content_hash IS NOT NULL) AS packet_hashes,
      (SELECT count(*) FROM public.atlas_packets WHERE byte_start IS NOT NULL AND byte_end IS NOT NULL AND byte_end > byte_start) AS packet_spans`),
    pool.query(`SELECT source_ref, content_hash, count(*) OVER (PARTITION BY source_ref) AS source_ref_count FROM public.atlas_artifacts WHERE source_ref IS NOT NULL AND content_hash IS NOT NULL ORDER BY updated_at DESC NULLS LAST, artifact_id LIMIT $1`, [limit]),
    pool.query(`SELECT COALESCE(source_ref, relative_path) AS source_ref, content_hash, relative_path, count(*) OVER (PARTITION BY COALESCE(source_ref, relative_path)) AS source_ref_count FROM public.codebase_chunk_index WHERE content_hash IS NOT NULL AND (source_ref IS NOT NULL OR relative_path IS NOT NULL) ORDER BY updated_at DESC NULLS LAST, id LIMIT $1`, [limit]),
    pool.query(`SELECT source_ref, packet_key, content_hash AS packet_content_hash, sha256 AS packet_sha256, byte_start, byte_end, count(*) OVER (PARTITION BY source_ref) AS source_ref_count FROM public.atlas_packets WHERE source_ref IS NOT NULL AND byte_start IS NOT NULL AND byte_end IS NOT NULL AND byte_end > byte_start ORDER BY updated_at DESC NULLS LAST, packet_key LIMIT $1`, [limit]),
  ]);
  report.authorities = Object.fromEntries(Object.entries(authority.rows[0]).map(([key, value]) => [key, Number(value)]));
  const grouped = new Map();
  for (const row of [...artifacts.rows, ...chunks.rows, ...packets.rows]) {
    const sourceRef = String(row.source_ref ?? '').trim();
    if (!sourceRef) continue;
    const entry = grouped.get(sourceRef) ?? { sourceRef, artifacts: [], chunks: [], packets: [] };
    if ('packet_content_hash' in row) entry.packets.push(row);
    else if ('relative_path' in row) entry.chunks.push(row);
    else entry.artifacts.push(row);
    grouped.set(sourceRef, entry);
  }
  for (const entry of [...grouped.values()].slice(0, limit)) {
    const sourcePath = resolveSourcePath(entry.sourceRef);
    let bytes = null;
    let sourceReadError = null;
    let sourceSizeBytes = null;
    if (sourcePath) {
      try {
        sourceSizeBytes = fs.statSync(sourcePath).size;
        if (sourceSizeBytes <= MAX_READ_BYTES) bytes = fs.readFileSync(sourcePath);
        else sourceReadError = `source exceeds bounded audit read limit (${sourceSizeBytes} bytes)`;
      } catch (error) {
        sourceReadError = error instanceof Error ? error.message : String(error);
      }
    }
    const filesystemSha256 = bytes ? hash(bytes) : null;
    const artifactHashes = [...new Set(entry.artifacts.map((row) => cleanHash(row.content_hash)).filter(Boolean))];
    const chunkHashes = [...new Set(entry.chunks.map((row) => cleanHash(row.content_hash)).filter(Boolean))];
    const packetHashes = [...new Set(entry.packets.flatMap((row) => [row.packet_content_hash, row.packet_sha256]).map(cleanHash).filter(Boolean))];
    const chunkChecks = entry.packets.map((row) => {
      if (!bytes) return { packetKey: row.packet_key, exactSpanMatch: null };
      const start = Number(row.byte_start); const end = Number(row.byte_end);
      const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= bytes.length;
      const computedHash = valid ? hash(bytes.subarray(start, end)) : null;
      return { packetKey: row.packet_key, startByte: start, endByte: end, computedHash, exactSpanMatch: Boolean(computedHash && chunkHashes.includes(computedHash)) };
    });
    const fullMatch = Boolean(filesystemSha256 && [...artifactHashes, ...packetHashes].includes(filesystemSha256));
    const chunkMatch = chunkChecks.some((check) => check.exactSpanMatch);
    const ambiguous = Number(entry.artifacts[0]?.source_ref_count ?? entry.chunks[0]?.source_ref_count ?? entry.packets[0]?.source_ref_count ?? 0) > 1 || artifactHashes.length > 1 || chunkHashes.length > 1;
    const classification = sourceReadError?.startsWith('source exceeds') ? 'SOURCE_TOO_LARGE' : !bytes ? 'MISSING_SOURCE' : ambiguous ? 'AMBIGUOUS' : fullMatch ? 'EXACT_FILE_BYTES' : chunkMatch ? 'EXACT_CHUNK_BYTES' : (artifactHashes.length || chunkHashes.length || packetHashes.length) ? (chunkChecks.length ? 'SCOPE_MISMATCH' : 'UNPROVEN_SCOPE') : 'NO_HASH_MATCH';
    report.classifications[classification] = (report.classifications[classification] ?? 0) + 1;
    report.samples.push({ sourceRef: entry.sourceRef, sourcePath: sourcePath ? path.relative(REPO_ROOT, sourcePath).replaceAll('\\', '/') : null, sourceSizeBytes, sourceReadError, filesystemSha256, artifactHashes, chunkHashes, packetHashes, chunkChecks, classification });
  }
  await pool.query('ROLLBACK');
  report.status = 'COMPLETE_READ_ONLY';
  report.recommendation = report.classifications.EXACT_FILE_BYTES ? 'Only EXACT_FILE_BYTES records may inform a whole-file hash contract; do not generalize chunk hashes.' : 'No bounded exact whole-file agreement was proven; keep packet backfill and projection cleanup blocked.';
} catch (error) {
  report.status = 'ERROR'; report.error = error instanceof Error ? error.message : String(error);
  try { await pool.query('ROLLBACK'); } catch { /* connection may already be closed */ }
} finally { await pool.end(); }
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, classifications: report.classifications, sampleCount: report.samples.length, reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/') }, null, 2));
