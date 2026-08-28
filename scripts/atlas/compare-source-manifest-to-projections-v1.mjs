#!/usr/bin/env node

/** Read-only comparison of filesystem manifest hashes with Postgres projections. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { buildApprovedAliasMap, classifySourceRef, normalizeSourceRef } from './lib/source-ref-namespace-v1.mjs';

const inputPath = path.resolve(REPO_ROOT, process.argv.find((arg) => arg.startsWith('--manifest='))?.split('=')[1] ?? '.tmp/atlas/indexable-source-manifest-v1/manifest.jsonl');
const reportPath = path.join(REPO_ROOT, 'docs/reports/source-manifest-projection-comparison-v1.json');
const aliasApprovalPath = path.join(REPO_ROOT, 'docs/reports/feature-ontology-explicit-alias-approval-v1.json');
const env = loadRepoEnv();
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const clean = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/^sveltekit-frontend\//, '');
const hashes = (rows, fields) => [...new Set(rows.flatMap((row) => fields.map((field) => row[field])).map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];

const lines = (await fsp.readFile(inputPath, 'utf8')).split(/\r?\n/).filter(Boolean);
const manifestRows = lines.map((line) => JSON.parse(line));
const refs = [...new Set(manifestRows.map((row) => clean(row.relativePath)).filter(Boolean))];
const report = { schema: 'atlas.source-manifest-projection-comparison.v1', readOnly: true, writesPerformed: false, input: path.relative(REPO_ROOT, inputPath).replaceAll('\\', '/'), sampleCount: manifestRows.length, classifications: {}, records: [] };
const aliasApproval = fs.existsSync(aliasApprovalPath) ? JSON.parse(fs.readFileSync(aliasApprovalPath, 'utf8')) : null;
const approvedAliases = buildApprovedAliasMap(aliasApproval?.approvedPairs ?? []);
report.namespaceClassifications = {};

try {
  const [packets, chunks, artifacts] = await Promise.all([
    pool.query(`SELECT source_ref, content_hash, sha256 FROM public.atlas_packets WHERE source_ref = ANY($1::text[]) OR source_ref = ANY($2::text[])`, [refs, refs.map((ref) => `sveltekit-frontend/${ref}`)]),
    pool.query(`SELECT source_ref, relative_path, content_hash FROM public.codebase_chunk_index WHERE source_ref = ANY($1::text[]) OR relative_path = ANY($1::text[]) OR source_ref = ANY($2::text[])`, [refs, refs.map((ref) => `sveltekit-frontend/${ref}`)]),
    pool.query(`SELECT source_ref, content_hash FROM public.atlas_artifacts WHERE source_ref = ANY($1::text[]) OR source_ref = ANY($2::text[])`, [refs, refs.map((ref) => `sveltekit-frontend/${ref}`)]),
  ]);
  const group = (rows) => rows.reduce((map, row) => { const key = clean(row.source_ref ?? row.relative_path); const list = map.get(key) ?? []; list.push(row); map.set(key, list); return map; }, new Map());
  const packetMap = group(packets.rows); const chunkMap = group(chunks.rows); const artifactMap = group(artifacts.rows);
  for (const manifest of manifestRows) {
    const sourceRef = clean(manifest.relativePath);
    const packetRows = packetMap.get(sourceRef) ?? []; const chunkRows = chunkMap.get(sourceRef) ?? []; const artifactRows = artifactMap.get(sourceRef) ?? [];
    const packetHashes = hashes(packetRows, ['content_hash', 'sha256']); const chunkHashes = hashes(chunkRows, ['content_hash']); const artifactHashes = hashes(artifactRows, ['content_hash']);
    const fileHash = String(manifest.contentHash ?? '').toLowerCase();
    const exactFile = fileHash && (packetHashes.includes(fileHash) || artifactHashes.includes(fileHash));
    const anyProjection = packetHashes.length || chunkHashes.length || artifactHashes.length;
    const ambiguous = packetHashes.length > 1 || chunkHashes.length > 1 || artifactHashes.length > 1;
    const classification = manifest.canonicalAdmission === false ? 'NON_CANONICAL_ROOT' : ambiguous ? 'AMBIGUOUS' : exactFile ? 'EXACT_FILE_BYTES' : anyProjection ? 'HASH_SCOPE_MISMATCH' : 'UNRESOLVED';
    const projectionRefs = [...packetRows, ...chunkRows, ...artifactRows]
      .map((row) => row.source_ref ?? row.relative_path)
      .map(normalizeSourceRef)
      .filter(Boolean);
    const namespace = classifySourceRef({
      manifestRef: manifest.relativePath,
      projectionRefs,
      approvedAliases,
      canonicalAdmission: manifest.canonicalAdmission !== false,
    });
    report.classifications[classification] = (report.classifications[classification] ?? 0) + 1;
    report.namespaceClassifications[namespace.classification] = (report.namespaceClassifications[namespace.classification] ?? 0) + 1;
    report.records.push({ relativePath: manifest.relativePath, sourceRootAuthority: manifest.sourceRootAuthority ?? 'UNKNOWN', canonicalAdmission: manifest.canonicalAdmission !== false, filesystemHash: manifest.contentHash, packetHashes, chunkHashes, artifactHashes, classification, namespace });
  }
  report.status = 'COMPLETE_READ_ONLY';
} catch (error) {
  report.status = 'ERROR'; report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, classifications: report.classifications, sampleCount: report.records.length, reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/') }, null, 2));
