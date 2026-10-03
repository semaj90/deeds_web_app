import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const outputPath = process.env.OPENSPEC_IDENTITY_RECONCILIATION_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_IDENTITY_RECONCILIATION_OUTPUT)
  : path.join(REPORTS, 'openspec-task-identity-reconciliation-v1.json');

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
  if (process.env.OPENSPEC_CENSUS_PATH) return path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH);
  const scopedRoot = path.join(REPORTS, 'openspec-evidence');
  const candidates = fs.existsSync(scopedRoot)
    ? fs.readdirSync(scopedRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(scopedRoot, entry.name, 'census-v1.json'))
      .filter((filePath) => fs.existsSync(filePath))
    : [];
  if (candidates.length) return candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  return path.join(REPORTS, 'openspec-evidence-portfolio-census-v2.json');
}

function preview(value) {
  const text = String(value ?? '');
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function main() {
  const censusPath = latestCensusPath();
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  if (census.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');

  const canonicalCounts = new Map();
  for (const task of census.tasks ?? []) {
    const key = task.canonicalTaskRef;
    canonicalCounts.set(key, (canonicalCounts.get(key) ?? 0) + 1);
  }
  const proposals = [];
  const proposalCounts = new Map();
  for (const task of census.tasks ?? []) {
    if (task.taskId !== null) continue;
    const identity = task.taskIdentity ?? {};
    const unique = (canonicalCounts.get(task.canonicalTaskRef) ?? 0) === 1;
    const kind = identity.identityState === 'DERIVED_ID' && unique
      ? 'PROPOSE_DERIVED_CANONICAL_ID'
      : identity.identityState === 'DERIVED_ID'
        ? 'BLOCKED_DUPLICATE_DERIVED_ID'
        : 'BLOCKED_IDENTITY_AMBIGUOUS';
    proposalCounts.set(kind, (proposalCounts.get(kind) ?? 0) + 1);
    proposals.push({
      taskRef: task.taskRef,
      canonicalTaskRef: task.canonicalTaskRef,
      authorityScope: task.authorityScope,
      changeId: task.changeId,
      sourceLine: task.sourceLine,
      sourceRevision: task.taskHash,
      identityState: identity.identityState,
      derivedTaskKey: identity.derivedTaskKey,
      action: kind,
      claimPreview: preview(task.taskText),
    });
  }
  const duplicateSamples = (census.duplicateTaskIdGroups ?? []).slice(0, 50).map((group) => ({
    classification: group.classification,
    taskRefs: group.taskRefs,
    canonicalTaskRefs: group.canonicalTaskRefs,
    authorityScopes: group.authorityScopes,
    changeIds: group.changeIds,
  }));
  const unsigned = {
    schema: 'atlas.openspec-task-identity-reconciliation.v1',
    milestone: 'EVF-02',
    mode: 'READ_ONLY_IDENTITY_PROPOSAL',
    status: 'IDENTITY_PROPOSALS_NOT_ADMISSIBLE',
    source: {
      census: relative(censusPath),
      workspaceRevision: census.source?.workspaceRevision ?? null,
      identityAuthority: 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs',
    },
    summary: {
      taskCount: census.tasks?.length ?? 0,
      missingTaskIdCount: census.summary?.taskIdMissing ?? 0,
      proposalCount: proposals.length,
      proposalCounts: Object.fromEntries(proposalCounts),
      duplicateClassificationCount: census.duplicateTaskIdGroups?.length ?? 0,
      duplicateSampleCount: duplicateSamples.length,
    },
    proposals,
    duplicateSamples,
    admission: {
      uniqueDerivedIdsProposed: proposalCounts.get('PROPOSE_DERIVED_CANONICAL_ID') ?? 0,
      ambiguousIdsAdmitted: 0,
      duplicateIdsAdmitted: 0,
      taskLedgerWrites: 0,
      checkboxMutations: 0,
      persistentStoreWrites: 0,
      authorization: 'not provided',
    },
    contract: {
      canonicalIdentity: 'authority scope + change + declared ID or deterministic derived task key',
      missingIdAction: 'proposal only; source tasks.md remains unchanged',
      duplicateAction: 'blocked pending deterministic owner/supersession resolution',
      ambiguousAction: 'blocked; no heuristic promotion',
      outputIsRebuildable: true,
    },
    likely_cause: 'Many task rows lack declared IDs, while duplicate and ambiguous claims prevent safe identity promotion without an explicit reconciliation decision.',
    evidence: [relative(censusPath)],
    patch_targets: ['scripts/atlas/propose-openspec-task-identity-reconciliation-v1.mjs'],
    safe_next_command: 'node scripts/atlas/propose-openspec-task-identity-reconciliation-v1.mjs',
    smoke_command: 'node --check scripts/atlas/propose-openspec-task-identity-reconciliation-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, summary: report.summary, admission: report.admission, output: outputPath }, null, 2));
}

main();
