import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inputPath = resolve(root, '.tmp/atlas/stale-migration-presence-receipt-20261109.json');
const objectInventoryPath = resolve(root, '.tmp/atlas/stale-migration-objects-20261109.json');
const objectPresencePath = resolve(root, '.tmp/atlas/stale-migration-objects-presence-20261109.json');
const manifestPath = resolve(root, 'sveltekit-frontend/drizzle/sidecar-migrations.json');
const journalPath = resolve(root, 'sveltekit-frontend/drizzle/meta/_journal.json');
const defaultOutput = '.tmp/atlas/stale-migration-provenance-classification-v2.json';
const outArg = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) ?? defaultOutput;
const outputPath = resolve(root, outArg);
const tmpRoot = resolve(root, '.tmp/atlas');
const relativeOutput = relative(tmpRoot, outputPath);
if (relativeOutput.startsWith(`..${sep}`) || relativeOutput === '..' || isAbsolute(relativeOutput)) {
  throw new Error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS');
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const parserNoiseNames = new Set(['on', 'for', 'to']);
const inputBytes = readFileSync(inputPath);
const objectInventoryBytes = readFileSync(objectInventoryPath);
const objectPresenceBytes = readFileSync(objectPresencePath);
const manifestBytes = readFileSync(manifestPath);
const journalBytes = readFileSync(journalPath);
const input = JSON.parse(inputBytes.toString('utf8'));
const objectInventory = JSON.parse(objectInventoryBytes.toString('utf8'));
const objectPresenceText = objectPresenceBytes.toString('utf8').replace(/^BEGIN\s*/i, '').replace(/\s*ROLLBACK\s*$/i, '');
const objectPresence = JSON.parse(objectPresenceText);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const journal = JSON.parse(journalBytes.toString('utf8'));
const sidecars = manifest.sidecars ?? [];
const journalTags = new Set((journal.entries ?? []).map((entry) => entry.tag));

if (input.schema !== 'atlas.stale-migration-presence.v1' || input.rows?.length !== 63) {
  throw new Error(`UNEXPECTED_PRESENCE_INPUT:${input.schema}:${input.rows?.length}`);
}

const statementFamilies = (sql) => {
  const executableSql = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
  const patterns = [
    ['CREATE_TABLE', /\bCREATE\s+TABLE\b/gi],
    ['ALTER_TABLE', /\bALTER\s+TABLE\b/gi],
    ['CREATE_INDEX', /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi],
    ['CREATE_VIEW', /\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\b/gi],
    ['CREATE_FUNCTION', /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/gi],
    ['CREATE_TRIGGER', /\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\b/gi],
    ['CREATE_TYPE', /\bCREATE\s+TYPE\b/gi],
    ['DROP', /\bDROP\s+(?:TABLE|INDEX|VIEW|FUNCTION|TRIGGER|TYPE)\b/gi],
    ['INSERT', /\bINSERT\s+INTO\b/gi],
    ['UPDATE', /\bUPDATE\b/gi],
    ['DELETE', /\bDELETE\s+FROM\b/gi],
    ['COMMENT', /\bCOMMENT\s+ON\b/gi],
    ['GRANT', /\bGRANT\b/gi],
    ['DO_BLOCK', /\bDO\s+\$\$/gi],
  ];
  return Object.fromEntries(patterns.map(([name, regex]) => [name, [...executableSql.matchAll(regex)].length]));
};

const rows = input.rows.map((observed) => {
  const sourceRef = `sveltekit-frontend/drizzle/${observed.file}`;
  const sourcePath = resolve(root, sourceRef);
  const sourcePresent = existsSync(sourcePath);
  const sourceBytes = sourcePresent ? readFileSync(sourcePath) : null;
  const registryEntry = sidecars.find((entry) => entry.file === observed.file || entry.file.endsWith(`/${observed.file}`)) ?? null;
  const journalTag = observed.file.replace(/\.sql$/i, '');
  const registryStatus = registryEntry?.status ?? 'UNREGISTERED';
  const schemaEquivalence = 'NOT_VERIFIED_OBJECT_PRESENCE_IS_NOT_DEFINITION_PARITY';
  const executionHistory = registryEntry?.appliedBy && !String(registryEntry.appliedBy).includes('unknown')
    ? 'DOCUMENTED_METADATA_REQUIRES_INDEPENDENT_HISTORY_VALIDATION'
    : 'UNKNOWN_NO_VERIFIED_APPLIER_OR_EXECUTION_RECEIPT';
  const sql = sourceBytes?.toString('utf8') ?? '';
  const rawReportedObjectNames = objectInventory[observed.file] ?? [];
  const parserNoiseDropped = rawReportedObjectNames.filter((name) => parserNoiseNames.has(String(name).toLowerCase()));
  const reportedObjectNames = rawReportedObjectNames.filter((name) => !parserNoiseNames.has(String(name).toLowerCase()));

  return {
    file: observed.file,
    sourceRef,
    sourcePresent,
    sourceRevision: sourceBytes ? `sha256:${sha256(sourceBytes)}` : null,
    sourceBytes: sourceBytes?.byteLength ?? null,
    statementFamilies: sourcePresent ? statementFamilies(sql) : null,
    parserReportedObjectNames: reportedObjectNames.map((name) => ({
      name,
      nameMentionedInCurrentSql: sourcePresent && sql.toLowerCase().includes(String(name).toLowerCase()),
      presenceObservation: Object.hasOwn(objectPresence, name) ? objectPresence[name] : null,
    })),
    parserNoiseDropped,
    objectPresence: {
      observedLabel: observed.label,
      expectedObjectCount: observed.objects,
      presentObjectCount: observed.present,
      evidenceRef: '.tmp/atlas/stale-migration-objects-presence-20261109.json',
      evidenceTarget: 'UNKNOWN_DATABASE_AND_SERVER_IDENTITY',
    },
    schemaEquivalence,
    executionHistory,
    migrationRegistration: {
      journalTag,
      exactJournalTagPresent: journalTags.has(journalTag),
      sidecarStatus: registryStatus,
      appliedBy: registryEntry?.appliedBy ?? null,
      appliedAt: registryEntry?.appliedAt ?? null,
    },
    reviewDisposition: observed.label === 'NO_OBJECTS_PARSED'
      ? 'SQL_SOURCE_HASHED_BUT_TARGET_NAMES_NOT_EXTRACTED_MANUAL_SOURCE_REVIEW_REQUIRED'
      : observed.label === 'PARTIAL'
        ? 'PARTIAL_OBJECT_PRESENCE_ONLY_CATALOG_IDENTITY_AND_DEFINITION_PARITY_UNVERIFIED'
        : 'PRESENCE_ONLY_NOT_ADMITTED',
  };
});

const counts = Object.fromEntries([...new Set(rows.map((row) => row.objectPresence.observedLabel))]
  .map((label) => [label, rows.filter((row) => row.objectPresence.observedLabel === label).length]));
const currentCatalogCheck = {
  requestedTarget: 'legal_ai_live_integration_scratch on loopback :5434',
  result: 'NOT_VERIFIED_AUTHENTICATION_FAILED',
  code: '28P01',
  connectionAttemptReadOnly: true,
  writesPerformed: false,
};
const proposedSidecarManifestDiff = {
  additions: [],
  removals: [],
  rationale: 'No registry change is proposed: object presence lacks a verified database identity, definition parity, and execution history. Do not register partial or unparsed files as applied or documented sidecars on this evidence.',
  deferredFiles: rows.filter((row) => row.migrationRegistration.sidecarStatus === 'UNREGISTERED').map((row) => row.file),
};

const report = {
  schema: 'atlas.stale-migration-provenance-classification.v1',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  writesPerformed: false,
  sourceRevisionBasis: 'SHA-256 of each current SQL file byte stream; worktree may be dirty.',
  inputs: {
    presenceReceipt: { path: '.tmp/atlas/stale-migration-presence-receipt-20261109.json', sha256: `sha256:${sha256(inputBytes)}` },
    parsedObjectInventory: { path: '.tmp/atlas/stale-migration-objects-20261109.json', sha256: `sha256:${sha256(objectInventoryBytes)}` },
    rawObjectPresenceCapture: { path: '.tmp/atlas/stale-migration-objects-presence-20261109.json', sha256: `sha256:${sha256(objectPresenceBytes)}`, databaseIdentity: 'UNKNOWN' },
    sidecarManifest: { path: 'sveltekit-frontend/drizzle/sidecar-migrations.json', sha256: `sha256:${sha256(manifestBytes)}` },
    drizzleJournal: { path: 'sveltekit-frontend/drizzle/meta/_journal.json', sha256: `sha256:${sha256(journalBytes)}` },
  },
  counts: {
    sourceRows: rows.length,
    sourceFilesPresent: rows.filter((row) => row.sourcePresent).length,
    ...counts,
    schemaEquivalenceVerified: 0,
    executionHistoryVerified: 0,
  },
  currentCatalogCheck,
  proposedSidecarManifestDiff,
  rows,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output: relative(root, outputPath).replaceAll('\\', '/'), counts: report.counts, currentCatalogCheck, proposedAdditions: 0 }));
