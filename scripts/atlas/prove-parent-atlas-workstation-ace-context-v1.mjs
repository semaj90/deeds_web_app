#!/usr/bin/env node

/** Read-only bounded ACE-context reference proof. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const builder = path.join(root, 'scripts', 'atlas', 'build-parent-atlas-workstation-ace-context-v1.mjs');
const reportPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ace-context-v1.json');
const run = () => {
  const result = spawnSync(process.execPath, [builder], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ACE_CONTEXT_BUILD_FAILED: ${result.stderr || result.stdout}`);
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
};
const first = run();
const second = run();
const proof = {
  schema: 'atlas.parent-atlas-workstation-ace-context-proof.v1',
  status: first.contextChecksum === second.contextChecksum && first.excludedTaskCount >= first.selectedTaskRefs.length ? 'PROVEN' : 'FAILED',
  referenceOnly: first.authority === 'EXISTING_ACE_CONTEXTMANIFEST_OWNER',
  bounded: first.selectedEvidenceRefs.length <= first.maxEvidenceReferences,
  backlogNotMaterialized: first.excludedTaskCount > 0,
  noCandidateNoModel: first.status === 'NO_EXECUTABLE_CANDIDATE' && first.modelCalls === 0,
  replayStable: first.contextChecksum === second.contextChecksum,
  selectedEvidenceRefs: first.selectedEvidenceRefs,
  contextChecksum: first.contextChecksum,
  writes: first.writes,
};
const out = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ace-context-proof-v1.json');
fs.writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...proof, out }, null, 2));
if (proof.status !== 'PROVEN' || !proof.referenceOnly || !proof.bounded || !proof.backlogNotMaterialized || !proof.noCandidateNoModel || !proof.replayStable) process.exitCode = 1;
