import crypto from 'node:crypto';

const readStdin = async () => {
  let value = '';
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const fail = (errorCode, message) => ({
  schema: 'parent-atlas.workstation-repair-stdio.v1',
  status: 'REJECTED',
  eventType: 'agent.repair.rejected',
  errorCode,
  message,
  repairCandidate: null,
  validationPlan: null,
  writesPerformed: false,
  canonicalAuthority: false,
});

const main = async () => {
  const raw = await readStdin();
  if (!raw) {
    process.stdout.write(`${JSON.stringify(fail('INPUT_REQUIRED', 'A JSON repair envelope is required.'))}\n`);
    process.exitCode = 1;
    return;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stdout.write(`${JSON.stringify(fail('INVALID_JSON', 'Input must be valid JSON.'))}\n`);
    process.exitCode = 1;
    return;
  }

  const required = ['errorId', 'errorMessage', 'sourceRef', 'workspaceRevision', 'sourceRevision', 'executionId'];
  const missing = required.filter((key) => typeof input[key] !== 'string' || input[key].trim() === '');
  if (missing.length > 0) {
    process.stdout.write(`${JSON.stringify(fail('LINEAGE_REQUIRED', `Missing required fields: ${missing.join(', ')}`))}\n`);
    process.exitCode = 1;
    return;
  }

  const repairCaseKey = `repair:${sha256([input.workspaceRevision, input.sourceRevision, input.sourceRef, input.errorId].join('|'))}`;
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter((value) => typeof value === 'string') : [];
  const result = {
    schema: 'parent-atlas.workstation-repair-stdio.v1',
    status: evidenceRefs.length > 0 ? 'REPAIR_CANDIDATE' : 'AUTHORITY_BLOCKED',
    eventType: evidenceRefs.length > 0 ? 'agent.repair.candidate' : 'agent.repair.blocked',
    repairCaseKey,
    errorId: input.errorId,
    errorMessage: input.errorMessage,
    sourceRef: input.sourceRef,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    executionId: input.executionId,
    evidenceRefs,
    repairCandidate: evidenceRefs.length > 0 ? {
      capability: typeof input.capability === 'string' ? input.capability : 'UNSELECTED',
      mode: 'DRY_RUN',
      authorized: false,
    } : null,
    validationPlan: {
      required: ['source-readback', 'focused-test', 'independent-replay'],
      writesPerformed: false,
    },
    replayChecksum: sha256(JSON.stringify({ repairCaseKey, evidenceRefs })),
    writesPerformed: false,
    canonicalAuthority: false,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

main().catch((error) => {
  process.stdout.write(`${JSON.stringify(fail('UNEXPECTED_ERROR', error instanceof Error ? error.message : String(error)))}\n`);
  process.exitCode = 1;
});
