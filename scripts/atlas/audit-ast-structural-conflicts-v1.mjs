#!/usr/bin/env node
/**
 * AST_BF_18C / AST_BF_18B read-only classifier.
 *
 * Compares the current source-byte candidate artifact with the existing
 * atlas_ast_nodes structural-key registry. It does not infer authority and it
 * never updates, supersedes, or deletes rows.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values: args } = parseArgs({
  options: {
    candidates: { type: 'string', default: '.tmp/atlas/ast-declaration-candidates-current-v1.jsonl' },
    limit: { type: 'string', default: '0' },
    report: { type: 'string', default: 'docs/reports/ast-structural-conflicts-v1.json' },
  },
  strict: false,
});
const candidatePath = path.resolve(ROOT, String(args.candidates));
const reportPath = path.resolve(ROOT, String(args.report));
const regenerationReceiptPath = path.join(ROOT, 'docs/reports/ast-declaration-candidates-current-v1.json');
const identityProofPath = path.join(ROOT, 'docs/reports/atlas-ast-backfill-idempotency-proof-v1.json');
const limit = Math.max(0, Number.parseInt(String(args.limit), 10) || 0);
const REPO_ID = 'deeds-web-app';
const STORAGE_KINDS = new Set(['file', 'class', 'interface', 'type', 'function', 'method', 'enum']);
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const normalizePath = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
const candidateKind = (value) => ({ function: 'function', interface: 'interface', type: 'type', method: 'method', class: 'class', file: 'file', enum: 'enum' })[String(value)] ?? null;
const structuralKey = (row) => `${REPO_ID}/${normalizePath(row.relative_path ?? row.source_ref)}#${rowKind(row)}:${String(row.symbol_name ?? '').trim()}`;
const rowKind = (row) => candidateKind(row.symbol_kind ?? row.node_kind);
const readJsonl = async () => {
  if (!fs.existsSync(candidatePath)) throw new Error(`CANDIDATE_ARTIFACT_MISSING:${candidatePath}`);
  const rows = [];
  const input = readline.createInterface({ input: fs.createReadStream(candidatePath, 'utf8'), crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (rowKind(row) && STORAGE_KINDS.has(rowKind(row)) && String(row.symbol_name ?? '').trim()) rows.push(row);
      if (limit > 0 && rows.length >= limit) break;
    } catch { /* malformed candidate lines are excluded and counted below by the artifact owner */ }
  }
  return rows;
};

const classify = (candidate, existing) => {
  const candidateSource = String(candidate.source_revision ?? '').trim() || null;
  const existingSource = String(existing.source_revision ?? '').trim() || null;
  const candidateDigest = String(candidate.source_content_digest ?? '').trim() || null;
  const existingDigest = String(existing.source_content_hash ?? '').trim() || null;
  const candidateParser = String(candidate.parser_version ?? '').trim() || null;
  const existingParser = String(existing.parser_version ?? '').trim() || null;
  const sameSource = Boolean(candidateSource && existingSource && candidateSource === existingSource);
  const sourceDiffers = Boolean(candidateSource && existingSource && candidateSource !== existingSource);
  const sameDigest = Boolean(candidateDigest && existingDigest && candidateDigest === existingDigest);
  const digestDiffers = Boolean(candidateDigest && existingDigest && candidateDigest !== existingDigest);
  const sameParser = Boolean(candidateParser && existingParser && candidateParser === existingParser);
  const parserDiffers = Boolean(candidateParser && existingParser && candidateParser !== existingParser);
  const sameSpan = Number(candidate.start_byte) === Number(existing.start_byte) && Number(candidate.end_byte) === Number(existing.end_byte);
  const sourceEvidence = sameSource && sameDigest;

  let classification = 'UNKNOWN';
  if (parserDiffers) classification = 'PARSER_REVISION_CHANGE';
  else if (sourceDiffers || digestDiffers) classification = 'SOURCE_REVISION_CHANGE';
  else if (sourceEvidence && sameParser && sameSpan) classification = 'STALE_OLD_IDENTITY';
  else if (sourceEvidence && sameParser && !sameSpan) classification = 'TRUE_CONFLICT';
  else if (sameSource && !sameDigest) classification = 'SOURCE_CONTENT_HASH_GRAIN_OR_DIVERGENCE';

  return {
    classification,
    candidate: {
      sourceRevision: candidateSource,
      contentDigest: candidateDigest,
      parserVersion: candidateParser,
      startByte: Number(candidate.start_byte),
      endByte: Number(candidate.end_byte),
      workspaceRevision: candidate.workspace_revision ?? null,
    },
    existing: {
      treeNodeId: existing.tree_node_id,
      sourceRevision: existingSource,
      contentHash: existingDigest,
      parserName: existing.parser_name ?? null,
      parserVersion: existingParser,
      startByte: Number(existing.start_byte),
      endByte: Number(existing.end_byte),
      workspaceId: existing.workspace_id ?? null,
    },
    evidence: { sameSource, sourceDiffers, sameDigest, digestDiffers, sameParser, parserDiffers, sameSpan },
  };
};

const run = async () => {
  const candidates = await readJsonl();
  let regenerationReceipt = null;
  try { regenerationReceipt = JSON.parse(fs.readFileSync(regenerationReceiptPath, 'utf8')); } catch { /* optional companion receipt */ }
  let identityProof = null;
  try { identityProof = JSON.parse(fs.readFileSync(identityProofPath, 'utf8')); } catch { /* optional companion receipt */ }
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 20000 });
  let existingRows;
  try {
    const result = await pool.query(`
      SELECT structural_key, tree_node_id, source_revision, source_content_hash,
             parser_name, parser_version, start_byte, end_byte, workspace_id
      FROM atlas_ast_nodes
    `);
    existingRows = result.rows;
  } finally {
    await pool.end();
  }

  const existingByKey = new Map(existingRows.map((row) => [String(row.structural_key), row]));
  const conflicts = [];
  const missing = [];
  const counts = {
    candidateRows: candidates.length,
    existingRows: existingRows.length,
    registryMissing: 0,
    structuralKeyMatches: 0,
    observationsByClassification: {},
  };
  for (const candidate of candidates) {
    const key = structuralKey(candidate);
    const existing = existingByKey.get(key);
    if (!existing) { counts.registryMissing += 1; missing.push({ structuralKey: key }); continue; }
    const result = classify(candidate, existing);
    counts.structuralKeyMatches += 1;
    counts.observationsByClassification[result.classification] = (counts.observationsByClassification[result.classification] ?? 0) + 1;
    conflicts.push({ structuralKey: key, ...result });
  }
  const observationsChecksum = sha256(conflicts.map((row) => JSON.stringify(row)).sort().join('\n'));
  const identityClassification = identityProof?.steps?.AST_BF_18C_STRUCTURAL_CONFLICT_CLASSIFICATION ?? null;
  const report = {
    schema: 'atlas.ast-structural-conflicts.v1',
    generatedAt: new Date().toISOString(),
    inputs: {
      candidateArtifact: path.relative(ROOT, candidatePath).replaceAll('\\', '/'),
      candidateArtifactExists: true,
      limit,
      candidateRowsChecksum: sha256(candidates.map((row) => JSON.stringify(row)).join('\n')),
    },
    counts,
    digestDivergence: {
      sourceCount: regenerationReceipt?.digestDivergedSources?.length ?? null,
      sources: regenerationReceipt?.digestDivergedSources ?? [],
      status: regenerationReceipt?.digestDivergedSources?.length ? 'REVIEW_REQUIRED' : 'NONE_REPORTED',
    },
    observationsChecksum,
    observations: conflicts.slice(0, 500),
    observationRowsTruncated: Math.max(0, conflicts.length - 500),
    identityProof: identityClassification ? {
      source: path.relative(ROOT, identityProofPath).replaceAll('\\', '/'),
      structuralKeyConflicts: identityClassification.conflicts ?? null,
      byClass: identityClassification.byClass ?? {},
      sameTreeNodeId: identityProof.steps?.AST_BF_17_NET_NEW?.alreadyPresentByTreeNodeId ?? null,
      status: identityClassification.status ?? 'UNKNOWN',
    } : null,
    missingSample: missing.slice(0, 100),
    policy: {
      staleOldIdentityRequiresStrongRevisionEvidence: true,
      trueConflictRequiresReview: true,
      unknownRequiresReview: true,
      supersessionProposed: false,
      canonicalWritesAllowed: false,
    },
    canonicalAuthority: false,
    writesPerformed: false,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    reportPath,
    candidateRows: counts.candidateRows,
    existingRows: counts.existingRows,
    structuralKeyMatches: counts.structuralKeyMatches,
    structuralKeyConflicts: identityClassification?.conflicts ?? null,
    sameTreeNodeId: identityProof?.steps?.AST_BF_17_NET_NEW?.alreadyPresentByTreeNodeId ?? null,
    observationsChecksum,
    writesPerformed: false,
  }, null, 2));
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
