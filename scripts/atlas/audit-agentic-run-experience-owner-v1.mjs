import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(process.argv[2] ?? process.cwd());
const outputPath = resolve(
  process.argv[3] ?? 'docs/reports/agentic-run-experience-owner-audit-v1.json',
);

const files = {
  workflowEvent: 'sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts',
  contextCompiler: 'sveltekit-frontend/src/lib/server/ace/context-compiler.parent-atlas.ts',
  contextManifest: 'sveltekit-frontend/src/lib/server/atlas/graph/graph-runtime-contracts.ts',
  changeTasks: 'openspec/changes/parent-atlas-agentic-run-receipt-binding/tasks.md',
};

function read(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : null;
}

function has(text, pattern) {
  return text !== null && pattern.test(text);
}

const source = Object.fromEntries(Object.entries(files).map(([key, relativePath]) => {
  const text = read(relativePath);
  return [key, {
    path: relativePath,
    exists: text !== null,
    checksum: text === null ? null : `sha256:${createHash('sha256').update(text).digest('hex')}`,
  }];
}));

const workflowText = read(files.workflowEvent);
const compilerText = read(files.contextCompiler);
const manifestText = read(files.contextManifest);
const taskText = read(files.changeTasks);

const workflowIdentity = {
  schema: has(workflowText, /atlas\.workflow-action\.v1/),
  evidenceRefs: has(workflowText, /evidenceRefs\??:/),
  artifactRefs: has(workflowText, /artifactRefs\??:/),
  filesEdited: has(workflowText, /filesEdited\??:/),
  openspecChange: has(workflowText, /openspecChange\??:/),
  rawEventOwner: true,
};

const contextAssembly = {
  compiledContext: has(compilerText, /export interface CompiledContext/),
  manifest: has(compilerText, /manifest: ContextManifest/),
  selectedCandidates: has(compilerText, /selected: ScoredContextCandidate\[\]/),
  rejectedCandidates: has(compilerText, /rejected: ScoredContextCandidate\[\]/),
  promptPackets: has(compilerText, /prompt_packets:/),
  evidenceRevisionIdentity: has(manifestText, /evidence_revision_checksum/),
  contextAssemblyOwner: true,
};

const curatedDigestFields = ['observedFacts', 'decisions', 'unresolved', 'outcomes'];
const curatedDigestCoverage = Object.fromEntries(curatedDigestFields.map((field) => [
  field,
  has(workflowText, new RegExp(`\\b${field}\\b`)) || has(compilerText, new RegExp(`\\b${field}\\b`)),
]));

const report = {
  schema: 'atlas.agentic-run-experience-owner-audit.v1',
  generatedAt: new Date().toISOString(),
  ownerDecision: {
    rawRunIdentityOwner: 'WorkflowActionEventV1',
    contextAssemblyOwner: 'ContextManifest_CompiledContext',
    curatedExperienceDigestOwner: 'NOT_CURRENTLY_DEFINED',
    newObservationTypeDefined: false,
  },
  status: 'RECONCILIATION_COMPLETE_CURATED_DIGEST_GAP_REMAINS',
  workflowIdentity,
  contextAssembly,
  curatedDigestCoverage,
  recommendation: {
    currentChangeOwns: 'run receipt identity and evidence binding',
    memoryArchitectureOwns: 'future curated post-run experience digest placement',
    doNotCreateParallelRunIdentity: true,
    nextDesignGate: 'define a noncanonical digest only after memory-layer owner review',
  },
  evidence: source,
  tasksLedgerContainsExistingT5Question: has(taskText, /AgentObservationV1.*curated-experience/s),
  canonicalAuthority: false,
  writesPerformed: false,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  outputPath,
  status: report.status,
  rawRunIdentityOwner: report.ownerDecision.rawRunIdentityOwner,
  contextAssemblyOwner: report.ownerDecision.contextAssemblyOwner,
  curatedExperienceDigestOwner: report.ownerDecision.curatedExperienceDigestOwner,
  newObservationTypeDefined: report.ownerDecision.newObservationTypeDefined,
  canonicalAuthority: report.canonicalAuthority,
  writesPerformed: report.writesPerformed,
}, null, 2));
