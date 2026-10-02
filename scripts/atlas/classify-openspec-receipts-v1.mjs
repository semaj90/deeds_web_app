import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const OUTPUT_PATH = process.env.OPENSPEC_RECEIPT_TYPES_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_RECEIPT_TYPES_OUTPUT)
  : path.join(REPORTS, 'openspec-receipt-type-classification-v1.json');

const TYPES = new Set([
  'STATIC_AUDIT', 'UNIT_TEST', 'INTEGRATION_TEST', 'DRY_RUN', 'CONTROLLED_APPLY',
  'DATABASE_READBACK', 'VECTOR_READBACK', 'GRAPH_READBACK', 'CONFIGURATION',
  'MIGRATION', 'PROJECTION', 'HEALTH_CHECK', 'NEGATIVE_EVIDENCE', 'UNKNOWN',
]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function latestCensusPath() {
  if (!process.env.OPENSPEC_CENSUS_PATH) throw new Error('OPENSPEC_CENSUS_PATH_REQUIRED');
  return path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH);
}

function readJson(uri) {
  const filePath = path.resolve(ROOT, uri);
  try {
    if (fs.statSync(filePath).size > 4 * 1024 * 1024) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function flatten(value, keyPath = '', output = []) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 200)) flatten(item, keyPath, output);
    return output;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value).slice(0, 500)) flatten(item, keyPath ? `${keyPath}.${key}` : key, output);
    return output;
  }
  output.push({ key: keyPath.toLowerCase(), value: String(value).slice(0, 4000).toLowerCase() });
  return output;
}

function addSignal(signals, type, basis, strength) {
  if (TYPES.has(type)) signals.push({ type, basis, strength });
}

function isOpenSpecTaskSourceRef(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  return /^(?:sveltekit-frontend\/)?openspec\/changes\/.+\/tasks\.md(?:#L\d+(?:C\d+)?)?$/i.test(normalized);
}

function classifyScope(candidate, parsed, fields) {
  const schema = String(parsed?.schema ?? candidate.schema ?? '').toLowerCase();
  const uri = String(candidate.uri ?? '').toLowerCase();
  const explicitTaskIdentityPresent = ['taskRefs', 'canonicalTaskKeys', 'taskIds', 'claimIds', 'migrationKeys', 'changeIds', 'gateIds']
    .some((key) => (candidate.fields?.[key] ?? fields.filter((field) => field.key.startsWith(key.toLowerCase())).map((field) => field.value)).length > 0);
  const sourceRefs = candidate.fields?.sourceRefs
    ?? fields.filter((field) => /(^|\.)(?:sourceref|sourcepath|canonicalsourceref|legacysourceref)s?$/.test(field.key)).map((field) => field.value);
  const taskClaimWithChange = Boolean(candidate.fields?.claims?.length || fields.some((field) => /(^|\.)(?:claim|claims|tasktext|tasktitle)$/.test(field.key)))
    && Boolean(candidate.fields?.changeIds?.length || fields.some((field) => /(^|\.)(?:change|changeid)$/.test(field.key)));
  const identityFieldPresent = explicitTaskIdentityPresent
    || taskClaimWithChange
    || sourceRefs.some(isOpenSpecTaskSourceRef);
  if (schema.includes('openspec') || uri.includes('/openspec/') || identityFieldPresent) return 'OPENSPEC_SCOPED';
  if (schema || uri.includes('/reports/')) return 'ATLAS_UNSCOPED';
  return 'UNKNOWN_SCOPE';
}

function classifyCandidate(candidate) {
  const parsed = candidate.canonicalSchemaValid ? candidate : readJson(candidate.uri);
  const schema = String(parsed?.schema ?? candidate.schema ?? '').toLowerCase();
  const filename = String(candidate.fileName ?? path.basename(candidate.uri)).toLowerCase();
  const fields = flatten(parsed ?? candidate.fields ?? {});
  const fieldText = fields.map((field) => `${field.key}=${field.value}`).join('\n');
  const signals = [];
  const explicitType = parsed?.evidenceType ?? parsed?.method ?? parsed?.receiptType ?? null;
  const explicitValue = String(explicitType ?? '').toUpperCase().replace(/[- ]/g, '_');
  const explicitAliases = {
    STATIC: 'STATIC_AUDIT',
    AUDIT: 'STATIC_AUDIT',
    READ_BACK: 'DATABASE_READBACK',
    READBACK: 'DATABASE_READBACK',
  };
  const explicit = explicitAliases[explicitValue] ?? explicitValue;
  if (TYPES.has(explicit)) addSignal(signals, explicit, 'EXPLICIT_FIELD', 100);

  if (/migration/.test(schema)) addSignal(signals, 'MIGRATION', 'SCHEMA', 90);
  if (/integration|e2e/.test(schema)) addSignal(signals, 'INTEGRATION_TEST', 'SCHEMA', 90);
  else if (/unit|vitest|jest|pytest|test/.test(schema)) addSignal(signals, 'UNIT_TEST', 'SCHEMA', 90);
  if (/dry[-_ ]?run|check[-_ ]?only|preview/.test(schema)) addSignal(signals, 'DRY_RUN', 'SCHEMA', 90);
  if (/readback|database|postgres|sql/.test(schema)) addSignal(signals, 'DATABASE_READBACK', 'SCHEMA', 90);
  if (/vector|qdrant|pgvector|embedding/.test(schema)) addSignal(signals, 'VECTOR_READBACK', 'SCHEMA', 90);
  if (/graph|cugraph|cagra|dag/.test(schema)) addSignal(signals, 'GRAPH_READBACK', 'SCHEMA', 90);
  if (/health|readiness|liveness/.test(schema)) addSignal(signals, 'HEALTH_CHECK', 'SCHEMA', 90);
  if (/projection|upsert|tombstone/.test(schema)) addSignal(signals, 'PROJECTION', 'SCHEMA', 90);
  if (/config|configuration/.test(schema)) addSignal(signals, 'CONFIGURATION', 'SCHEMA', 90);
  if (/negative|blocked|failed|rejection|contradiction/.test(schema)) addSignal(signals, 'NEGATIVE_EVIDENCE', 'SCHEMA', 90);
  if (/capability/.test(schema) && /canonicalversion|versionsconverged/.test(fieldText)) addSignal(signals, 'CONFIGURATION', 'SCHEMA', 90);
  if (/cuvs|semantic-card-corpus|embedding/.test(schema) && /identity_match|score_match|vector|embedding|cardcount/.test(fieldText)) addSignal(signals, 'VECTOR_READBACK', 'SCHEMA', 90);
  if (/neo4j|topology/.test(schema) || /relationships_found|relationships_exported/.test(fieldText)) addSignal(signals, 'GRAPH_READBACK', 'SCHEMA', 90);
  if (/candidate-feature-gpu|latent|autoencoder|kmeans|som/.test(schema) || /gpu_execution_observed|gpu_pack_checksum|latent64_is_prefix/.test(fieldText)) addSignal(signals, 'PROJECTION', 'SCHEMA', 90);
  if (/writer/.test(schema) && /action=canonicalization_applied|apply=true|canonicalization_applied/.test(fieldText)) addSignal(signals, 'CONTROLLED_APPLY', 'SCHEMA', 90);
  if (/audit|proof|alignment|lineage|surface|receipt/.test(schema) && signals.length === 0) addSignal(signals, 'STATIC_AUDIT', 'SCHEMA', 90);
  if (/receiptkind|receipt_kind|producerid|producer_id|inputhash|input_hash|outputhash|output_hash/.test(fieldText) && signals.length === 0) addSignal(signals, 'STATIC_AUDIT', 'FIELDS', 80);
  if (/proof\.|package_export_surface|legacy_shim_surface/.test(fieldText) && signals.length === 0) addSignal(signals, 'STATIC_AUDIT', 'FIELDS', 80);
  if (/migration|sql|drizzle|alter table/.test(fieldText)) addSignal(signals, 'MIGRATION', 'FIELDS', 80);
  if (/integration|e2e|playwright|supertest/.test(fieldText)) addSignal(signals, 'INTEGRATION_TEST', 'FIELDS', 80);
  else if (/unit|vitest|jest|pytest|node --test|\.test\.|\.spec\./.test(fieldText)) addSignal(signals, 'UNIT_TEST', 'FIELDS', 80);
  if (/dry[-_ ]?run|check[-_ ]?only|preview/.test(fieldText)) addSignal(signals, 'DRY_RUN', 'FIELDS', 80);
  if (/controlled[_ -]?apply|--apply|writeattempted|writesperformed/.test(fieldText)) addSignal(signals, 'CONTROLLED_APPLY', 'FIELDS', 80);
  if (/readback|database|postgres|sql/.test(fieldText)) addSignal(signals, 'DATABASE_READBACK', 'FIELDS', 80);
  if (/vector|qdrant|pgvector|embedding/.test(fieldText)) addSignal(signals, 'VECTOR_READBACK', 'FIELDS', 80);
  if (/graph|cugraph|cagra|dag/.test(fieldText)) addSignal(signals, 'GRAPH_READBACK', 'FIELDS', 80);
  if (/health|readiness|liveness/.test(fieldText)) addSignal(signals, 'HEALTH_CHECK', 'FIELDS', 80);
  if (/projection|upsert|tombstone/.test(fieldText)) addSignal(signals, 'PROJECTION', 'FIELDS', 80);
  if (/negative|blocked|failed|rejection|contradiction/.test(fieldText)) addSignal(signals, 'NEGATIVE_EVIDENCE', 'FIELDS', 80);

  const filenameSignals = [
    ['MIGRATION', /migration/], ['INTEGRATION_TEST', /integration|e2e/], ['UNIT_TEST', /test|spec/],
    ['DRY_RUN', /dry[-_ ]?run|preview/], ['DATABASE_READBACK', /database|postgres|readback/],
    ['VECTOR_READBACK', /vector|qdrant|embedding/], ['GRAPH_READBACK', /graph|cagra|cugraph/],
    ['HEALTH_CHECK', /health|readiness/], ['PROJECTION', /projection|upsert/], ['STATIC_AUDIT', /audit|census/],
  ];
  for (const [type, pattern] of filenameSignals) if (pattern.test(filename)) addSignal(signals, type, 'FILENAME', 20);

  const maxStrength = Math.max(...signals.map((signal) => signal.strength), 0);
  const candidateTypes = [...new Set(signals.filter((signal) => signal.strength === maxStrength).map((signal) => signal.type))].sort();
  const candidateType = candidateTypes.length === 1 ? candidateTypes[0] : 'UNKNOWN';
  const basis = maxStrength >= 90 ? 'SCHEMA_OR_EXPLICIT' : maxStrength >= 80 ? 'FIELDS' : maxStrength >= 20 ? 'FILENAME' : 'NONE';
  const typingState = candidateType === 'UNKNOWN'
    ? candidateTypes.length > 1 ? 'CANDIDATE_TYPE' : 'UNKNOWN'
    : basis === 'FILENAME' ? 'CANDIDATE_TYPE' : 'TYPED';
  return {
    uri: candidate.uri,
    schema: candidate.schema ?? parsed?.schema ?? null,
    evidenceId: candidate.evidenceId ?? parsed?.evidenceId ?? parsed?.receiptId ?? null,
    candidateType,
    candidateTypes,
    typingState,
    scopeDisposition: classifyScope(candidate, parsed, fields),
    basis,
    sourceFields: [...new Set(fields.map((field) => field.key))].sort().slice(0, 80),
    identityHints: {
      taskRefs: candidate.fields?.taskRefs ?? [],
      taskIds: candidate.fields?.taskIds ?? [],
      claimIds: candidate.fields?.claimIds ?? [],
      changeIds: candidate.fields?.changeIds ?? [],
      sourceRefs: candidate.fields?.sourceRefs ?? [],
    },
    typeConfirmed: typingState === 'TYPED' && candidateType !== 'UNKNOWN',
  };
}

export function classifyOpenSpecReceiptsV1(census) {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const candidates = [
    ...(census.evidenceReceipts ?? []).map((receipt) => ({ ...receipt, canonicalSchemaValid: true })),
    ...(census.historicalReceiptCandidates ?? []),
  ];
  const receipts = candidates.map(classifyCandidate).sort((left, right) => left.uri.localeCompare(right.uri));
  const counts = Object.fromEntries([...new Set(receipts.map((receipt) => receipt.candidateType))].sort().map((type) => [type, receipts.filter((receipt) => receipt.candidateType === type).length]));
  const typingStates = Object.fromEntries([...new Set(receipts.map((receipt) => receipt.typingState))].sort().map((state) => [state, receipts.filter((receipt) => receipt.typingState === state).length]));
  const unsigned = {
    schema: 'atlas.openspec-receipt-type-classification.v1',
    runId: process.env.OPENSPEC_EVIDENCE_RUN_ID ?? census.runId ?? null,
    milestone: 'EVF-03B',
    mode: 'READ_ONLY_RECEIPT_TYPING',
    status: receipts.length && receipts.every((receipt) => receipt.candidateType !== 'UNKNOWN') ? 'RECEIPT_TYPES_TYPED' : 'RECEIPT_TYPES_PARTIAL',
    source: { census: process.env.OPENSPEC_CENSUS_PATH ? relative(path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)) : 'latest-run-census-v1.json', workspaceRevision: census.source?.workspaceRevision ?? null },
    summary: {
      receiptCount: receipts.length,
      typeCounts: counts,
      typingStateCounts: typingStates,
      schemaOrFieldTypedCount: receipts.filter((receipt) => receipt.typingState === 'TYPED').length,
      candidateTypeCount: receipts.filter((receipt) => receipt.typingState === 'CANDIDATE_TYPE').length,
      filenameCandidateCount: receipts.filter((receipt) => receipt.typingState === 'CANDIDATE_TYPE' && receipt.basis === 'FILENAME').length,
      unknownCount: receipts.filter((receipt) => receipt.typingState === 'UNKNOWN').length,
      ambiguousCandidateCount: receipts.filter((receipt) => receipt.typingState === 'CANDIDATE_TYPE' && receipt.candidateTypes.length > 1).length,
      scopeCounts: Object.fromEntries([...new Set(receipts.map((receipt) => receipt.scopeDisposition))].sort().map((scope) => [scope, receipts.filter((receipt) => receipt.scopeDisposition === scope).length])),
      typeConfirmedCount: receipts.filter((receipt) => receipt.typeConfirmed).length,
    },
    receipts,
    invariants: [
      'Receipt type is descriptive metadata and cannot establish task identity or proof.',
      'Schema and payload fields outrank filenames; filename-only results remain CANDIDATE_TYPE.',
      'UNKNOWN and candidate classifications remain visible for later deterministic expansion.',
    ],
    likely_cause: 'Historical receipt candidates use mixed schemas and filenames, so proof binding needs an explicit type disposition before assertion matching.',
    evidence: [process.env.OPENSPEC_CENSUS_PATH ? relative(path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)) : 'latest-run-census-v1.json'],
    patch_targets: ['scripts/atlas/classify-openspec-receipts-v1.mjs'],
    safe_next_command: 'node scripts/atlas/classify-openspec-receipts-v1.mjs',
    smoke_command: 'node --check scripts/atlas/classify-openspec-receipts-v1.mjs',
    report_path: relative(OUTPUT_PATH),
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

function main() {
  const censusPath = latestCensusPath();
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const report = classifyOpenSpecReceiptsV1(census);
  report.source.census = relative(censusPath);
  report.evidence = [relative(censusPath)];
  const { checksum: _checksum, ...unsigned } = report;
  report.checksum = checksum(unsigned);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, summary: report.summary, output: OUTPUT_PATH }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
