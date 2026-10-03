import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CENSUS_PATH = process.env.OPENSPEC_CENSUS_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-portfolio-census-v2.json');
const CENSUS_REF = path.relative(ROOT, CENSUS_PATH).replaceAll('\\', '/');
const OUTPUT_PATH = process.env.OPENSPEC_RECEIPT_BINDING_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_RECEIPT_BINDING_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-receipt-binding-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function countBy(rows, field) {
  return Object.fromEntries([...new Set(rows.map((row) => row[field] ?? 'NULL'))]
    .sort()
    .map((value) => [value, rows.filter((row) => (row[field] ?? 'NULL') === value).length]));
}

export function buildOpenSpecReceiptBindingV1(census) {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const bindings = (census.receiptBindings ?? []).map((binding) => ({
    uri: binding.uri,
    schema: binding.schema ?? null,
    evidenceId: binding.evidenceId ?? null,
    bindingStrategy: binding.bindingStrategy ?? null,
    bindingType: binding.bindingType ?? null,
    resolution: binding.resolution ?? null,
    canonicalTaskRef: binding.canonicalTaskRef ?? null,
    candidateTaskRefs: binding.candidateTaskRefs ?? [],
    revisionStatus: binding.revisionStatus ?? null,
    proofEligible: binding.proofEligible === true,
  })).sort((left, right) => left.uri.localeCompare(right.uri));
  const unsigned = {
    schema: 'atlas.openspec-receipt-binding.v1',
    generatedAt: new Date().toISOString(),
    source: {
      census: CENSUS_REF,
      workspaceRevision: census.source?.workspaceRevision ?? null,
      receiptAuthority: 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs',
      canonicalAuthority: false,
    },
    summary: {
      receiptCount: bindings.length,
      resolutionCounts: countBy(bindings, 'resolution'),
      bindingTypeCounts: countBy(bindings, 'bindingType'),
      bindingStrategyCounts: countBy(bindings, 'bindingStrategy'),
      revisionStatusCounts: countBy(bindings, 'revisionStatus'),
      checksumFailedCount: census.summary?.checksum_failed_receipts ?? null,
      invalidSchemaCount: census.summary?.invalid_schema_receipts ?? null,
      proofEligibleBindingCount: bindings.filter((binding) => binding.proofEligible).length,
      heuristicCandidateCount: bindings.filter((binding) => ['FILENAME_HINT', 'NORMALIZED_CLAIM'].includes(binding.bindingStrategy)).length,
      exactBindingCount: bindings.filter((binding) => ['BOUND_EXACT', 'BOUND_SOURCE_REF'].includes(binding.bindingType)).length,
      aliasBindingCount: bindings.filter((binding) => binding.bindingType === 'BOUND_ALIAS').length,
      ambiguousCount: bindings.filter((binding) => binding.resolution === 'AMBIGUOUS').length,
      orphanCount: bindings.filter((binding) => binding.resolution === 'MISSING_TASK').length,
      staleOrMissingRevisionCount: bindings.filter((binding) => binding.revisionStatus !== 'PRESENT').length,
    },
    bindings,
    invariants: [
      'Exact identity and source-reference bindings remain diagnostic until current workspace and task-source revisions qualify them.',
      'Alias, filename, normalized-claim, ambiguous, orphan, and missing-revision bindings cannot independently create PROVEN state.',
      'Receipt binding is a read-only projection; it does not rewrite receipts, task ledgers, or canonical stores.',
    ],
    sideEffects: { receiptsMutated: false, taskLedgersMutated: false, persistentStoresMutated: false },
    likely_cause: 'Historical receipts use mixed schemas and identity hints, so binding outcomes need an explicit non-proof classification.',
    evidence: [`${CENSUS_REF}#receiptBindings`, 'census.summary.checksum_failed_receipts', 'census.summary.missing_revision_receipts'],
    patch_targets: ['scripts/atlas/audit-openspec-receipt-binding-v1.mjs'],
    safe_next_command: 'node scripts/atlas/audit-openspec-receipt-binding-v1.mjs',
    smoke_command: 'node --check scripts/atlas/audit-openspec-receipt-binding-v1.mjs',
    report_path: 'docs/reports/openspec-receipt-binding-v1.json',
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));
  const report = buildOpenSpecReceiptBindingV1(census);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, summary: report.summary, workspaceRevision: report.source.workspaceRevision, checksum: report.checksum, output: OUTPUT_PATH }, null, 2));
}
