import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.resolve(root, 'docs/reports/migration-inventory-classification-v1.json');
const liveReadbackPath = path.resolve(root, 'docs/reports/critical-lineage-live-readback-v1.json');
const reportPath = path.resolve(root, 'docs/reports/critical-lineage-migration-dispositions-v1.json');
const critical = new Set([
  'atlas_packet_chunk_lineage',
  'atlas_packets',
  'codebase_chunk_index',
  'graphify_execution_files',
  'graphify_executions',
  'graphify_files',
]);

const inventory = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const liveReadback = JSON.parse(fs.readFileSync(liveReadbackPath, 'utf8'));
const liveTables = new Map((liveReadback.tables ?? []).map((row) => [row.table, row]));
const rows = (inventory.rows ?? [])
  .filter((row) => row.classification === 'UNRESOLVED'
    && (row.criticalLineageTables ?? []).some((table) => critical.has(table)))
  .sort((a, b) => String(a.path).localeCompare(String(b.path)));

const readbackFor = (row) => (row.criticalLineageTables ?? []).map((table) => (
  liveTables.get(table) ?? (row.criticalLineageReadback ?? []).find((item) => item.table === table) ?? { table, status: 'READBACK_MISSING' }
));

const dispositionFor = (row, readback) => {
  const candidates = row.ownerCandidates ?? [];
  if (readback.length === 0 || readback.some((item) => item.status !== 'LIVE_SCHEMA_PRESENT')) {
    return 'LIVE_READBACK_REQUIRED';
  }
  if (candidates.length === 1) return 'SINGLE_OWNER_CANDIDATE_REVIEW_REQUIRED';
  if (candidates.length > 1) return 'MULTIPLE_OWNER_CANDIDATES_REVIEW_REQUIRED';
  return 'OWNER_EVIDENCE_MISSING';
};

const dispositions = rows.map((row) => ({
  ...(() => { const readback = readbackFor(row); return { _readback: readback, _disposition: dispositionFor(row, readback) }; })(),
  path: row.path,
  location: row.location,
  classification: row.classification,
  disposition: undefined,
  ownerDomain: row.ownerDomain,
  reviewPriority: row.reviewPriority,
  criticalLineageTables: row.criticalLineageTables,
  criticalLineageReadback: undefined,
  referencedTables: row.referencedTables,
  liveEvidence: row.liveEvidence ?? null,
  ownerCandidates: row.ownerCandidates ?? [],
  reason: row.reason,
  blocking: row.blocking === true,
})).map(({ _readback, _disposition, ...row }) => ({
  ...row,
  disposition: _disposition,
  criticalLineageReadback: _readback,
}));

const countBy = (key) => Object.fromEntries(
  [...new Set(dispositions.map((row) => row[key]))].sort().map((value) => [
    value ?? 'UNKNOWN',
    dispositions.filter((row) => row[key] === value).length,
  ]),
);

const report = {
  schema: 'atlas.critical-lineage-migration-dispositions.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  sourceReport: path.relative(root, inputPath),
  liveReadbackReport: path.relative(root, liveReadbackPath),
  criticalTables: [...critical].sort(),
  counts: {
    criticalUnresolvedFiles: dispositions.length,
    byDisposition: countBy('disposition'),
    byDomain: countBy('ownerDomain'),
    byPriority: countBy('reviewPriority'),
  },
  passCriteria: {
    allCriticalFilesEnumerated: dispositions.length === 58,
    unresolvedCurrentOwners: dispositions.length,
    ownerClassificationComplete: false,
    liveReadbackComplete: dispositions.every((row) => (row.criticalLineageReadback ?? []).length > 0
      && row.criticalLineageReadback.every((item) => item.status === 'LIVE_SCHEMA_PRESENT')),
    migrationAuthorized: false,
    writesPerformed: false,
  },
  nextGate: 'MIGRATION-CRITICAL-LINEAGE-DISPOSITION-01',
  rows: dispositions,
  writesPerformed: false,
  migrationAuthorized: false,
};

const temporaryPath = `${reportPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temporaryPath, reportPath);
console.log(JSON.stringify({
  reportPath: path.relative(root, reportPath),
  criticalUnresolvedFiles: dispositions.length,
  counts: report.counts,
  writesPerformed: false,
  migrationAuthorized: false,
}, null, 2));
