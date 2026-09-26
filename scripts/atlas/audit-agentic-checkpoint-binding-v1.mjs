import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(process.argv[2] ?? process.cwd());
const reportPath = resolve(process.argv[3] ?? 'docs/reports/agentic-checkpoint-binding-audit-v1.json');

async function read(path) {
  try {
    return await readFile(resolve(repoRoot, path), 'utf8');
  } catch {
    return null;
  }
}

const localEvent = await read('sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts');
const canonicalEvent = await read('packages/parent-atlas/src/core/workflow-action-event.ts');
const coordinates = await read('packages/parent-atlas/src/core/workflow-execution-coordinates-v1.ts');
const replayProof = await read('scripts/atlas/prove-langgraph-failure-retry-replay-v1.mjs');

const has = (text, pattern) => Boolean(text && text.includes(pattern));
const checksum = (value) => `sha256:${createHash('sha256').update(value ?? '', 'utf8').digest('hex')}`;

const report = {
  schema: 'atlas.agentic-checkpoint-binding-audit.v1',
  sourceChecksums: {
    localWorkflowEvent: checksum(localEvent),
    canonicalWorkflowEvent: checksum(canonicalEvent),
    executionCoordinates: checksum(coordinates),
    replayProof: checksum(replayProof),
  },
  identityOwner: {
    workflowActionEvent: has(localEvent, 'WorkflowActionEventV1') && has(canonicalEvent, 'workflowActionEventSchema'),
    canonicalIdentityOwner: 'workflow_action_event',
    identityFields: ['workflowId', 'workflowRevision', 'actionId', 'sequence', 'attempt', 'parentActionId'],
  },
  coordinateOwner: {
    present: has(coordinates, 'workflowExecutionCoordinatesSchema'),
    fields: ['framework', 'orchestrationRuntime', 'checkpointProvider', 'actionExecutor', 'transport'],
    checksumField: 'coordinatesChecksum',
  },
  evidenceBinding: {
    evidenceRefsPresent: has(localEvent, 'evidenceRefs') && has(canonicalEvent, 'evidenceRefs'),
    artifactRefsPresent: has(localEvent, 'artifactRefs') && has(canonicalEvent, 'artifactRefs'),
    checkpointReferenceFieldPresent: has(localEvent, 'checkpointId') || has(canonicalEvent, 'checkpointId'),
    checkpointChecksumFieldPresent: has(localEvent, 'checkpointChecksum') || has(canonicalEvent, 'checkpointChecksum'),
  },
  proofStatus: {
    resumeRetryFixtureExists: Boolean(replayProof),
    sameWorkflowActionIdentityAcrossCheckpointResume: 'NOT_PROVEN',
    mismatchedCheckpointCoordinateRejection: 'NOT_PROVEN',
    mutationAuthorizationPreserved: 'NOT_PROVEN',
    status: 'NOT_PROVEN',
  },
  decision: {
    newRunSchemaIntroduced: false,
    canonicalWritesAllowed: false,
    databaseWrites: false,
    nextGate: 'DEFINE_ADDITIVE_CHECKPOINT_BINDING_ON_EXISTING_WORKFLOW_EVENT',
  },
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
