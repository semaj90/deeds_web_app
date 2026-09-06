#!/usr/bin/env node

/**
 * SOURCE-EVIDENCE-AUTHORITY-01 live replay proof.
 *
 * Runs the real selector (select-current-source-evidence-authority-v1.mts)
 * twice against the live database and the live current workspace, and
 * asserts both runs agree on: status, selected run (if any), ambiguity
 * count, and current workspace identity. This is READ-ONLY -- it never
 * rewrites Graphify rows, runs Graphify, or mutates any store.
 *
 * Complements (does not replace) the pure fixture matrix in
 * prove-current-source-evidence-authority-selector-v1.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const selector = path.join(root, 'scripts', 'atlas', 'select-current-source-evidence-authority-v1.mts');
const reportPath = path.join(root, 'docs', 'reports', 'current-source-evidence-authority-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'current-source-evidence-authority-live-replay-proof-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

function run() {
  const result = spawnSync('npx', ['tsx', selector], { cwd: root, encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    return { exitCode: result.status, error: result.stderr, report: null };
  }
  return { exitCode: result.status, error: null, report: JSON.parse(fs.readFileSync(reportPath, 'utf8')) };
}

const first = run();
const second = run();

const bothSucceeded = first.exitCode === 0 && second.exitCode === 0 && first.report && second.report;
const agree = bothSucceeded
  && first.report.status === second.report.status
  && first.report.selection?.graphifyRunId === second.report.selection?.graphifyRunId
  && first.report.ambiguityCount === second.report.ambiguityCount
  && first.report.currentWorkspace.workspaceRevision === second.report.currentWorkspace.workspaceRevision
  && first.report.currentWorkspace.sourceManifestDigest === second.report.currentWorkspace.sourceManifestDigest;

const bothReadOnly = bothSucceeded
  && first.report.writesPerformed === false && second.report.writesPerformed === false
  && first.report.canonicalAuthority === false && second.report.canonicalAuthority === false;

const status = bothSucceeded && agree && bothReadOnly ? 'LIVE_REPLAY_PROVEN' : 'NOT_PROVEN';

const proof = {
  schema: 'atlas.current-source-evidence-authority-live-replay-proof.v1',
  gate: 'SOURCE-EVIDENCE-AUTHORITY-01',
  status,
  bothSucceeded,
  agree,
  bothReadOnly,
  firstStatus: first.report?.status ?? null,
  secondStatus: second.report?.status ?? null,
  selectedRunId: first.report?.selection?.graphifyRunId ?? null,
  ambiguityCount: first.report?.ambiguityCount ?? null,
  currentWorkspaceRevision: first.report?.currentWorkspace?.workspaceRevision ?? null,
  runCounts: first.report?.runCounts ?? null,
  canonicalAuthority: false,
  writesPerformed: false,
  evidence: [
    'scripts/atlas/lib/current-source-evidence-authority-selector.mjs',
    'scripts/atlas/select-current-source-evidence-authority-v1.mts',
    'docs/reports/current-source-evidence-authority-v1.json',
  ],
};
proof.proofChecksum = sha256(JSON.stringify(proof));
fs.writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: proof.status, firstStatus: proof.firstStatus, secondStatus: proof.secondStatus, ambiguityCount: proof.ambiguityCount, out: outPath }, null, 2));
if (proof.status !== 'LIVE_REPLAY_PROVEN') process.exit(1);
