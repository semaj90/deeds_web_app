/** DOC-25 fixture proof: validation receipt for an unapplied patch proposal. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-25-compiler-test-replay-receipt-v1.json');
const checks = [];
function run(name, command, args) {
  try { execFileSync(command, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }); checks.push({ name, status: 'PASS', exitCode: 0 }); }
  catch (error) { checks.push({ name, status: 'FAIL', exitCode: error.status ?? 1, detail: String(error.stderr ?? error.message).slice(0, 500) }); }
}
run('patch-proposal-script-syntax', process.execPath, ['--check', 'scripts/atlas/prove-doc-24-patch-proposal-fixture-v1.mjs']);
run('versioned-doc-openspec-validation', process.env.COMSPEC ?? 'cmd.exe', ['/d', '/s', '/c', 'npx openspec validate parent-atlas-versioned-doc-intelligence --type change --strict --json --no-interactive']);
const validationDigest = createHash('sha256').update(JSON.stringify(checks), 'utf8').digest('hex');
const report = {
  schema: 'atlas.doc-25-compiler-test-replay-receipt.v1',
  gate: 'DOC-25',
  status: checks.every((item) => item.status === 'PASS') ? 'DOC_25_VALIDATION_RECEIPT_FIXTURE_PROVEN' : 'DOC_25_VALIDATION_RECEIPT_FIXTURE_FAILED',
  proposalRef: 'docs/reports/parent-atlas/doc-24-patch-proposal-fixture-v1.json',
  validationChecks: checks,
  validationChecksum: `sha256:${validationDigest}`,
  patchApplied: false,
  mutationAuthorized: false,
  writesPerformed: false,
  nextGate: 'DOC_25_LIVE_ISOLATED_PATCH_REPLAY',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, checks, patchApplied: false }, null, 2));
if (report.status !== 'DOC_25_VALIDATION_RECEIPT_FIXTURE_PROVEN') process.exitCode = 1;
