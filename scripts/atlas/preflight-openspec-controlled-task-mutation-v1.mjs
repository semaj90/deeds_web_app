import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const reconciliationPath = path.join(REPORTS, 'openspec-workboard-evidence-reconciliation-v1.json');
const healthPath = path.join(REPORTS, 'openspec-evidence-health-v1.json');
const outputPath = process.env.OPENSPEC_MUTATION_PREFLIGHT_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_MUTATION_PREFLIGHT_OUTPUT)
  : path.join(REPORTS, 'openspec-controlled-task-mutation-preflight-v1.json');

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const reconciliation = readJson(reconciliationPath);
  const health = readJson(healthPath);
  const gates = {
    workboardParity: reconciliation.status === 'WORKBOARD_PARITY_PROVEN_NO_WRITE',
    evidencePromotionEligible: health.promotionEligible === true,
    taskMutationContractEnabled: health.contracts?.taskMutationAllowed === true,
    independentReparseRequired: true,
    authorizationProvided: false,
  };
  const unsigned = {
    schema: 'atlas.openspec-controlled-task-mutation-preflight.v1',
    milestone: 'EVF-20',
    mode: 'READ_ONLY_MUTATION_PREFLIGHT',
    status: Object.values(gates).every(Boolean) ? 'READY_FOR_EXPLICIT_AUTHORIZED_APPLY' : 'BLOCKED_FAIL_CLOSED',
    source: {
      reconciliation: relative(reconciliationPath),
      evidenceHealth: relative(healthPath),
      workspaceRevision: health.source?.workspaceRevision ?? null,
    },
    gates,
    protocol: [
      'APPLY_PROVEN evidence state is required before proposing checkbox changes.',
      'Generate a bounded proposed tasks.md patch; never infer authorization from a checked state.',
      'Require explicit authorization bound to the exact workspace revision and patch checksum.',
      'Write only the authorized patch, then reparse tasks.md independently.',
      'Emit an independent post-write receipt and reject parity drift.',
    ],
    mutation: {
      proposedPatchGenerated: false,
      authorizationRequested: false,
      writeAttempted: false,
      taskLedgersMutated: false,
      checkboxChanges: 0,
      receiptEmitted: false,
    },
    contract: {
      sourceOfClaim: 'tasks.md',
      sourceOfProof: 'revision-bound evidence receipts',
      workboardRole: 'derived projection only',
      noImplicitAuthorization: true,
      archiveInsteadOfDelete: true,
    },
    likely_cause: 'Controlled checkbox mutation is unsafe while workboard parity, evidence promotion, and explicit authorization are absent.',
    evidence: [relative(reconciliationPath), relative(healthPath)],
    patch_targets: ['scripts/atlas/preflight-openspec-controlled-task-mutation-v1.mjs'],
    safe_next_command: 'node scripts/atlas/reconcile-openspec-workboard-evidence-v1.mjs',
    smoke_command: 'node --check scripts/atlas/preflight-openspec-controlled-task-mutation-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, gates: report.gates, writesPerformed: false, output: outputPath }, null, 2));
}

main();
