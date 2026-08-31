import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportPath = path.join(root, 'docs/reports/dspy-gepa-subprompt-audit-v1.json');

const files = [
  'python/parent_atlas_dspy_repair.py',
  'python/parent_atlas_dspy_community.py',
  'python/tests/test_parent_atlas_dspy_repair.py',
  'python/tests/test_parent_atlas_dspy_community.py',
  'scripts/agent/prompt-generator.mjs',
  'scripts/agent/log-subagent.mjs',
  'sveltekit-frontend/src/lib/server/agents/trace-subagent-orchestrator.ts',
  'sveltekit-frontend/src/lib/server/features/ai/agents/trace-subagent-orchestrator.ts',
  'sveltekit-frontend/src/routes/api/trace/subagents/run/+server.ts',
  'packages/parent-atlas/src/core/agentic-workflow-control-plane.ts',
];

const exists = (relative) => fs.existsSync(path.join(root, relative));
const text = (relative) => {
  const file = path.join(root, relative);
  return exists(relative) ? fs.readFileSync(file, 'utf8') : '';
};
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const evidence = (relative, patterns) => {
  const content = text(relative);
  return patterns.filter((pattern) => content.includes(pattern));
};

const dspyRepair = text('python/parent_atlas_dspy_repair.py');
const subagentApi = text('sveltekit-frontend/src/routes/api/trace/subagents/run/+server.ts');
const orchestrator = [
  text('sveltekit-frontend/src/lib/server/agents/trace-subagent-orchestrator.ts'),
  text('sveltekit-frontend/src/lib/server/features/ai/agents/trace-subagent-orchestrator.ts'),
].join('\n');

const lanes = [
  {
    id: 'SUBPROMPT-CENSUS-01',
    title: 'Existing sub-agent/prompt inventory',
    status: files.every(exists) ? 'PROVEN_BOUNDED' : 'PARTIAL',
    evidence: files.filter(exists),
    next: 'Classify each prompt as orchestration, evidence acquisition, or model proposal.'
  },
  {
    id: 'SUBPROMPT-CONTRACT-01',
    title: 'Typed prompt inputs and evidence boundary',
    status: dspyRepair.includes('context_manifest') && dspyRepair.includes('constraints') ? 'CREATED' : 'OPEN',
    evidence: ['python/parent_atlas_dspy_repair.py'],
    next: 'Add a serialized request/response wrapper with manifest checksum and allowed evidence IDs.'
  },
  {
    id: 'SUBPROMPT-REPLAY-01',
    title: 'Deterministic prompt selection replay',
    status: 'OPEN',
    evidence: ['scripts/agent/prompt-generator.mjs', 'scripts/agent/log-subagent.mjs'],
    next: 'Replay the same frozen task/evidence packet and compare selected prompt and receipt checksums.'
  },
  {
    id: 'DSPY-SIDECAR-01',
    title: 'TypeScript-to-Python DSPy boundary',
    status: 'OPEN',
    evidence: ['python/parent_atlas_dspy_repair.py', 'sveltekit-frontend/src/routes/api/trace/subagents/run/+server.ts'],
    next: 'Expose a bounded worker/RPC call; Python must receive serialized promoted evidence only and must not query stores.'
  },
  {
    id: 'GEPA-VERSION-01',
    title: 'DSPy/GEPA runtime compatibility',
    status: 'BLOCKED',
    evidence: ['python/parent_atlas_dspy_repair.py', 'openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md'],
    next: 'Run an isolated WSL/container import and version smoke test; do not add dependencies to the app environment.'
  },
  {
    id: 'GEPA-SHADOW-01',
    title: 'Bounded GEPA shadow run',
    status: 'OPEN',
    evidence: ['python/parent_atlas_dspy_repair.py'],
    next: 'Use a frozen validation set, fixed seed, resumable log_dir, candidate checksum, and zero production writes.'
  },
  {
    id: 'GEPA-HELDOUT-01',
    title: 'Held-out evaluation isolation',
    status: 'OPEN',
    evidence: ['openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md'],
    next: 'Freeze train/validation/test IDs and forbid held-out observations from feeding optimization.'
  },
  {
    id: 'OAK-JUDGE-01',
    title: 'Execution receipt to judge feedback',
    status: 'PARTIAL',
    evidence: ['packages/parent-atlas/src/core/oak-judge-feedback-v1.ts', 'python/parent_atlas_dspy_repair.py'],
    next: 'Connect real bounded execution receipts to a repair suggestion; never auto-promote a kernel or program.'
  },
  {
    id: 'PROMOTION-01',
    title: 'Human-reviewed program promotion',
    status: 'OPEN',
    evidence: ['packages/parent-atlas/src/core/agentic-workflow-control-plane.ts'],
    next: 'Require review, held-out proof, hard-gate non-regression, and an immutable promotion receipt.'
  },
];

const report = {
  schema: 'atlas.dspy-gepa-subprompt-audit.v1',
  generatedAt: new Date().toISOString(),
  timestampMethod: 'AUDIT_EXECUTION_TIME',
  scope: 'repository-read-only',
  summary: {
    dspyContract: dspyRepair ? 'CREATED' : 'MISSING',
    dspyRuntime: 'NOT_PROVEN',
    gepaRuntime: 'NOT_PROVEN',
    subagentApi: subagentApi.includes('runTraceSubagentDag') ? 'WIRED' : 'NOT_PROVEN',
    typedEvidenceBoundary: dspyRepair.includes('context_manifest') ? 'PARTIAL' : 'OPEN',
    productionSelfModification: 'FORBIDDEN',
    canonicalWrites: false,
  },
  subpromptSurface: {
    apiValidation: evidence('sveltekit-frontend/src/routes/api/trace/subagents/run/+server.ts', ['safeParse', 'runTraceSubagentDag']),
    orchestratorEvidenceSignals: ['evidence', 'receipt', 'source'].filter((signal) => orchestrator.toLowerCase().includes(signal)),
    promptGeneratorSha256: sha(text('scripts/agent/prompt-generator.mjs')),
  },
  lanes,
  orderedNextSteps: [
    'SUBPROMPT-REPLAY-01',
    'DSPY-SIDECAR-01',
    'GEPA-VERSION-01',
    'GEPA-HELDOUT-01',
    'GEPA-SHADOW-01',
    'OAK-JUDGE-01',
    'PROMOTION-01',
  ],
  doNotDo: [
    'Do not run GEPA against the held-out set.',
    'Do not pass raw retrieval results directly to a model.',
    'Do not allow DSPy/GEPA to mint evidence refs, canonical IDs, or revisions.',
    'Do not connect the optimizer to production mutation or canonical stores.',
  ],
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: path.relative(root, reportPath), summary: report.summary, lanes: lanes.length }, null, 2));
