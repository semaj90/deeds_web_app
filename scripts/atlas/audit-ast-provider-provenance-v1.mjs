#!/usr/bin/env node

/**
 * AST_PROVIDER_PROVENANCE_RECONCILIATION_01 — read-only database audit. No Graphify or AST regeneration.
 * Capability comes from the live provider owners; producer provenance comes from atlas_ast_nodes evidence,
 * never from file extension alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { loadLiveAstProviderCapabilityContractV1 } from './lib/ast-provider-capability-contract-v1.mjs';
import { extensionOf, parserExclusionReasonV1 } from './lib/current-file-capability-classification-v1.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const workspaceRevision = arg('--workspace-revision');
const executionId = arg('--execution-id');
const runId = arg('--run-id');
const rowsRelativePath = arg('--rows') ?? '.tmp/atlas/current-ast-capability-rows-v1.ndjson';
const rowsPath = path.resolve(REPO_ROOT, rowsRelativePath);
const rowsRel = path.relative(REPO_ROOT, rowsPath);
if (rowsRel.startsWith('..') || path.isAbsolute(rowsRel)) throw new Error('ROWS_PATH_OUTSIDE_REPOSITORY');
if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision ?? '') || !/^[0-9a-f-]{36}$/.test(executionId ?? '')
  || !/^[a-zA-Z0-9][a-zA-Z0-9-]{2,63}$/.test(runId ?? '')) throw new Error('EXPLICIT_SCOPE_AND_RUN_ID_REQUIRED');

const contract = await loadLiveAstProviderCapabilityContractV1();
if (contract.status !== 'LOADED') {
  console.log(JSON.stringify({ verdict: 'AST_PROVIDER_CAPABILITY_CONTRACT_REQUIRED', missing: contract.missing }, null, 2));
  process.exit(2);
}
const liveExt = new Map();
for (const p of contract.providers) for (const e of p.extensions) (liveExt.get(e) ?? liveExt.set(e, []).get(e)).push(p.providerId);

// Recognized code languages are a POLICY (what we consider code), not provider capability.
const RECOGNIZED_CODE_LANGUAGE_POLICY_V1 = new Set(['svelte', 'py', 'pyi', 'rs', 'go', 'cu', 'cuh', 'c', 'cc', 'cpp', 'h', 'hpp', 'sql', 'sh', 'ps1', 'proto', 'wgsl', 'java', 'cs', 'ts', 'mts', 'cts', 'tsx', 'js', 'mjs', 'cjs', 'jsx']);

const base = new Map();
for (const l of fs.readFileSync(rowsPath, 'utf8').split('\n')) if (l) {
  const r = JSON.parse(l);
  if (typeof r.sourceRef !== 'string' || !r.sourceRef || base.has(r.sourceRef)) throw new Error('BASE_SOURCE_ROWS_INVALID_OR_DUPLICATE');
  if (typeof r.lineageClass !== 'string') throw new Error('BASE_LINEAGE_CLASS_MISSING');
  base.set(r.sourceRef, r);
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 180000 });
const client = await pool.connect();
let prod;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  prod = (await client.query(`
    WITH m AS (SELECT DISTINCT source_ref, lower(regexp_replace(repository_relative_path, '^sveltekit-frontend/', '')) AS p
               FROM public.graphify_execution_file_membership_v2
               WHERE execution_id = $1::uuid AND workspace_revision::text = $2 AND repository_id = 'repo:root')
    SELECT m.source_ref, a.parser_name, a.parser_version, a.grammar_version, a.parser_language,
           count(*)::int AS nodes, count(*) FILTER (WHERE a.workspace_id IS NOT NULL)::int AS workspace_bound,
           count(*) FILTER (WHERE a.source_revision IS NOT NULL)::int AS revision_bound,
           min(a.created_at) AS first_at, max(a.created_at) AS last_at, min(a.source_ref_key) AS sample_source_ref_key
    FROM m JOIN public.atlas_ast_nodes a ON lower(regexp_replace(replace(btrim(a.relative_path), chr(92), '/'), '^[.]/', '')) = m.p
    GROUP BY 1, 2, 3, 4, 5`, [executionId, workspaceRevision])).rows;
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }

function provenance(p) {
  if (p.parser_name === 'tree-sitter' && p.parser_version && /^\d+\.\d+/.test(p.parser_version) && p.grammar_version) return { cls: 'CURRENT_TREE_SITTER_PROVIDER', kind: 'CODE_AST' };
  if (p.parser_name === 'tree-sitter' && p.parser_version === 'chunk-index-v1') return { cls: 'LEGACY_TREE_SITTER_PROVIDER', kind: p.parser_language === 'json' ? 'CONFIG_STRUCTURE' : 'CODE_AST' };
  if (p.parser_name === 'ast-grep-napi') return { cls: 'ALTERNATE_STRUCTURAL_PROVIDER', kind: 'CODE_AST' };
  if (/symbol-extractor$/.test(p.parser_name ?? '')) return { cls: 'ALTERNATE_STRUCTURAL_PROVIDER', kind: p.parser_language === 'markdown' ? 'DOCUMENT_STRUCTURE' : 'CONFIG_STRUCTURE' };
  return { cls: 'PRODUCER_UNRESOLVED', kind: 'UNKNOWN' };
}
const bySource = new Map();
for (const p of prod) { const c = provenance(p); (bySource.get(p.source_ref) ?? bySource.set(p.source_ref, []).get(p.source_ref)).push({ ...p, ...c }); }

const RANK = ['CURRENT_TREE_SITTER_PROVIDER', 'ALTERNATE_STRUCTURAL_PROVIDER', 'LEGACY_TREE_SITTER_PROVIDER', 'LANGUAGE_SPECIFIC_PROVIDER', 'IMPORTED_LEGACY_AST', 'PRODUCER_UNRESOLVED'];
const rows = []; const tallies = { outcome: {}, provenance: {}, kind: {}, strayRows: { total: 0, byProvenance: {}, byExtension: {} } };
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
for (const [sourceRef, b] of base) {
  const ext = extensionOf(sourceRef); const dot = `.${ext}`;
  const eligibilityExclusion = parserExclusionReasonV1(sourceRef);
  const producers = bySource.get(sourceRef) ?? [];
  const best = [...producers].sort((x, y) => RANK.indexOf(x.cls) - RANK.indexOf(y.cls))[0] ?? null;
  const liveProviders = liveExt.get(dot) ?? [];
  const codeAstProducers = producers.filter((p) => p.kind === 'CODE_AST');
  let outcome;
  if (eligibilityExclusion) outcome = 'NOT_AST_ELIGIBLE';
  else if (liveProviders.length) {
    outcome = b.lineageClass === 'AST_EVIDENCE_ABSENT' ? 'ELIGIBLE_NOT_TRAVERSED' : b.lineageClass === 'AST_REVISION_QUALIFIED' ? 'REVISION_QUALIFIED_AST' : 'PARSED_NOT_REVISION_QUALIFIED';
  } else if (RECOGNIZED_CODE_LANGUAGE_POLICY_V1.has(ext)) {
    outcome = codeAstProducers.length ? (b.lineageClass === 'AST_REVISION_QUALIFIED' ? 'REVISION_QUALIFIED_AST' : 'LEGACY_PRODUCER_ROWS_UNQUALIFIED') : 'ELIGIBLE_PARSER_UNAVAILABLE';
  } else outcome = 'NOT_AST_ELIGIBLE';
  const stray = producers.length > 0 && !liveProviders.length;
  if (stray) { tallies.strayRows.total += 1; bump(tallies.strayRows.byProvenance, best.cls); bump(tallies.strayRows.byExtension, ext || 'none'); }
  bump(tallies.outcome, outcome); bump(tallies.provenance, best ? best.cls : 'NO_AST_ROWS'); bump(tallies.kind, best ? best.kind : 'NONE');
  rows.push({
    sourceRef, primaryOutcome: outcome, eligibilityExclusion, lineageClass: b.lineageClass,
    liveProviderIds: liveProviders, analysisKind: best ? best.kind : (liveProviders.length ? 'CODE_AST' : null),
    producerProvenance: best ? best.cls : null, providerId: best ? best.parser_name : null, providerVersion: best ? best.parser_version : null, grammarVersion: best ? best.grammar_version : null,
    producerLanguage: best ? best.parser_language : null,
    producerAllowedForFile: !best ? null : (contract.extToLanguage[dot] ? (contract.extToLanguage[dot] === best.parser_language || (dot === '.jsx' && best.parser_language === 'javascript')) : 'NO_LIVE_CONTRACT_FOR_EXTENSION'),
    producerRevisionQualified: b.lineageClass === 'AST_REVISION_QUALIFIED',
    producerWorkspaceBound: producers.some((p) => p.workspace_bound > 0), producerRevisionBound: producers.some((p) => p.revision_bound > 0),
    allProducers: producers.map((p) => ({ name: p.parser_name, version: p.parser_version, grammar: p.grammar_version, lang: p.parser_language, cls: p.cls, kind: p.kind })),
  });
}
const producerTable = Object.values(prod.reduce((a, p) => { const c = provenance(p); const k = `${p.parser_name}|${p.parser_version}|${p.grammar_version}|${p.parser_language}`; const e = (a[k] ??= { parserName: p.parser_name, parserVersion: p.parser_version, grammarVersion: p.grammar_version, parserLanguage: p.parser_language, provenance: c.cls, analysisKind: c.kind, sources: 0, nodes: 0, workspaceBoundNodes: 0, revisionBoundNodes: 0, firstAt: p.first_at instanceof Date ? p.first_at.toISOString() : p.first_at ?? null, lastAt: p.last_at instanceof Date ? p.last_at.toISOString() : p.last_at ?? null, sampleSourceRefKey: p.sample_source_ref_key }); e.sources += 1; e.nodes += p.nodes; e.workspaceBoundNodes += p.workspace_bound; e.revisionBoundNodes += p.revision_bound; return a; }, {})).sort((x, y) => y.sources - x.sources);

const hasUnresolved = (tallies.provenance.PRODUCER_UNRESOLVED ?? 0) > 0;
const hasLegacy = (tallies.provenance.LEGACY_TREE_SITTER_PROVIDER ?? 0) > 0;
const verdict = hasUnresolved || hasLegacy ? 'AST_LEGACY_PRODUCER_RECONCILIATION_REQUIRED' : 'AST_PROVIDER_PROVENANCE_PROVEN';
const outputDir = path.join(REPO_ROOT, '.tmp/atlas/ast-provider-provenance', runId);
fs.mkdirSync(path.dirname(outputDir), { recursive: true });
fs.mkdirSync(outputDir, { recursive: false });
const rowsBytes = Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const rowsName = 'source-rows.ndjson';
fs.writeFileSync(path.join(outputDir, rowsName), rowsBytes, { flag: 'wx' });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const body = {
  schema: 'atlas.ast-provider-provenance-reconciliation.v1', gate: 'AST_PROVIDER_PROVENANCE_RECONCILIATION_01', mode: 'READ_ONLY_DATABASE_AUDIT', writesPerformed: true, scratchArtifactsOnly: true, productionWrites: false, graphifyRun: false, astRegenerated: false,
  verdict, scope: { workspaceRevision, executionId }, identities: base.size,
  liveCapabilityContracts: contract.providers.map((p) => ({ providerId: p.providerId, analysisKind: p.analysisKind, languageIds: p.languageIds, extensions: p.extensions, contractRevision: p.contractRevision, owner: p.owner })),
  sidecarRuntime: contract.sidecarRuntime,
  contractGaps: ['no live owner exports provider VERSION for node-tree-sitter (only recorded per row at write time)', 'no live owner exports DOCUMENT_STRUCTURE or CONFIG_STRUCTURE capability (markdown/json extractors observed only)', 'recognized-code-language set is an explicit POLICY constant in this script, not provider capability'],
  primaryOutcomes: tallies.outcome, bestProducerProvenance: tallies.provenance, bestProducerAnalysisKind: tallies.kind, astObservedWithoutLiveProviderExtension: tallies.strayRows,
  observedProducers: producerTable,
  notMeasured: { TRAVERSED_PARSE_FAILED: 'no parse-failure ledger', SYMBOL_RESOLVED: 'symbol resolution not joined' },
  supersedesCapabilityCensus: 'capabilityCensus in current-workspace-ast-lineage-v1-c7c0b2d04a606b8c.json (hand-copied provider set)',
  featureMatrixBlockerPreserved: 'PLACEHOLDER_EMBEDDING_SHARED remains BLOCKING; matrix is diagnostic only',
  perSourceRows: path.relative(REPO_ROOT, path.join(outputDir, rowsName)).replaceAll(path.sep, '/'),
  perSourceRowsSha256: sha256(rowsBytes), perSourceRowsBytes: rowsBytes.byteLength,
  generatedAt: new Date().toISOString(),
};
const reportBytes = Buffer.from(`${JSON.stringify({ ...body, reportSha256: sha256(Buffer.from(canonical(body))) }, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'report.json'), reportBytes, { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'report.sha256'), `${sha256(reportBytes)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ verdict, outputDir: path.relative(REPO_ROOT, outputDir).replaceAll(path.sep, '/'), reportSha256: sha256(reportBytes), sourceRowsSha256: sha256(rowsBytes), primaryOutcomes: tallies.outcome, bestProducerProvenance: tallies.provenance, kinds: tallies.kind, stray: tallies.strayRows, producers: producerTable.map((p) => `${p.parserName}/${p.parserVersion}/${p.parserLanguage}: ${p.sources} sources [${p.provenance}/${p.analysisKind}]`), liveExtensions: contract.providers.map((p) => `${p.providerId}: ${p.extensions.join(' ')}`) }, null, 2));
