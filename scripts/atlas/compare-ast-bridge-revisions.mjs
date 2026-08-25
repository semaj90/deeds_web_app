#!/usr/bin/env node
/**
 * Read-only diagnostic for Graphify AST candidates that share a file with
 * atlas_ast_nodes but do not share a structural key.
 *
 * It separates source/revision drift from parser/key drift. No database,
 * vector, graph, or cache writes are performed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { buildAstSourceRefKey, normalizeAstNodeKind } from './lib/ast-source-ref-key.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
}

const candidatesPath = path.resolve(REPO_ROOT, args.get('candidates') ?? 'docs/reports/graphify-ast-declaration-candidates-v2.jsonl');
const reportPath = path.resolve(REPO_ROOT, args.get('report') ?? 'docs/reports/atlas-ast-bridge-revision-comparison-v1.json');
const frontendRoot = path.join(REPO_ROOT, 'sveltekit-frontend');
const bridgeKeysPath = path.join(REPO_ROOT, '.tmp/atlas/atlas-ast-nodes-source-ref-keys.txt');
const env = loadRepoEnv();
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 20000,
});

const normalizePath = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const fileKey = (value) => normalizePath(value);
const candidateFile = (row) => fileKey(row.relative_path ?? row.source_ref);
const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

async function readCandidates() {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(candidatesPath, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* malformed rows are outside this comparison */ }
  }
  return rows;
}

function addCount(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

async function main() {
  if (!fs.existsSync(candidatesPath)) throw new Error(`candidate artifact missing: ${candidatesPath}`);
  const candidates = await readCandidates();
  if (!fs.existsSync(bridgeKeysPath)) throw new Error(`bridge key dump missing: ${bridgeKeysPath}`);
  const bridgeKeys = new Set(fs.readFileSync(bridgeKeysPath, 'utf8').split('\n').map((value) => value.trim()).filter(Boolean));
  const bridgeFiles = new Set([...bridgeKeys].map((key) => fileKey(key.split('#', 1)[0])));
  const astResult = await pool.query(`
    SELECT source_ref_key, relative_path, node_kind, qualified_symbol,
           source_revision, source_content_hash, parser_name, parser_version
    FROM atlas_ast_nodes
    WHERE source_ref_key IS NOT NULL
  `);
  const graphifyResult = await pool.query(`
    SELECT source_ref, code_source_revision, content_hash
    FROM graphify_files
    WHERE source_ref IS NOT NULL
  `);

  const astByFile = new Map();
  const astByKey = new Set();
  for (const row of astResult.rows) {
    astByKey.add(String(row.source_ref_key));
    const key = fileKey(String(row.source_ref_key).split('#', 1)[0] || row.relative_path);
    if (!astByFile.has(key)) astByFile.set(key, []);
    astByFile.get(key).push(row);
  }
  const graphifyByFile = new Map(graphifyResult.rows.map((row) => [fileKey(row.source_ref), row]));
  const candidateRowsByFile = new Map();
  for (const row of candidates) {
    const file = candidateFile(row);
    const key = buildAstSourceRefKey(row.relative_path ?? row.source_ref, row.symbol_kind ?? row.ast_kind, row.symbol_name);
    if (!candidateRowsByFile.has(file)) candidateRowsByFile.set(file, []);
    candidateRowsByFile.get(file).push({ row, key });
  }

  const report = {
    schema: 'atlas.ast-bridge-revision-comparison.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    databaseWrites: false,
    inputCandidatesPath: path.relative(REPO_ROOT, candidatesPath),
    counts: { candidateRows: candidates.length, existingAstRows: astResult.rowCount, graphifyFiles: graphifyResult.rowCount, sharedFiles: 0, mismatchedCandidateRows: 0, filesWithRevisionDrift: 0, filesWithHashDrift: 0, filesWithMissingCurrentSource: 0 },
    byClassification: {},
    byParserVersion: {},
    samples: [],
  };

  for (const [file, candidateEntries] of candidateRowsByFile) {
    const existing = astByFile.get(file);
    if (!existing) continue;
    report.counts.sharedFiles += 1;
    const mismatchedEntries = candidateEntries.filter((entry) => bridgeFiles.has(file) && !bridgeKeys.has(entry.key));
    if (mismatchedEntries.length === 0) continue;
    report.counts.mismatchedCandidateRows += mismatchedEntries.length;
    const graphify = graphifyByFile.get(file);
    const sourcePath = path.join(frontendRoot, file);
    const currentHash = fs.existsSync(sourcePath) ? sha256File(sourcePath) : null;
    const revisions = existing.map((row) => String(row.source_revision ?? '').trim()).filter(Boolean);
    const graphifyRevision = String(graphify?.code_source_revision ?? '').trim();
    const revisionDrift = Boolean(graphifyRevision && revisions.length && !revisions.includes(graphifyRevision));
    const hashDrift = Boolean(graphify?.content_hash && currentHash && String(graphify.content_hash) !== currentHash);
    const missingSource = !currentHash;
    if (revisionDrift) report.counts.filesWithRevisionDrift += 1;
    if (hashDrift) report.counts.filesWithHashDrift += 1;
    if (missingSource) report.counts.filesWithMissingCurrentSource += 1;

    let classification = 'KEY_OR_PARSER_DRIFT';
    if (missingSource) classification = 'CURRENT_SOURCE_MISSING';
    else if (!graphify) classification = 'REVISION_AUTHORITY_UNAVAILABLE';
    else if (!revisions.length) classification = 'AST_REVISION_MISSING';
    else if (revisionDrift && hashDrift) classification = 'REVISION_AND_FILE_HASH_DRIFT';
    else if (revisionDrift) classification = 'REVISION_DRIFT';
    else if (hashDrift) classification = 'FILE_HASH_DRIFT';
    addCount(report.byClassification, classification);
    for (const row of existing) addCount(report.byParserVersion, `${row.parser_name ?? 'unknown'}:${row.parser_version ?? 'unknown'}`);
    if (report.samples.length < 40) {
      report.samples.push({
        file,
        candidateKeyCount: mismatchedEntries.length,
        existingKeyCount: existing.length,
        graphifyRevision: graphifyRevision || null,
        existingRevisions: [...new Set(revisions)],
        currentFileSha256: currentHash,
        graphifyContentHash: graphify?.content_hash ?? null,
        classification,
        existingKeys: existing.slice(0, 8).map((row) => row.source_ref_key),
      });
    }
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[compare-ast-bridge-revisions] fatal:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
