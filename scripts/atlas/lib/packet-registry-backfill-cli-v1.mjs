const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function parsePacketRegistryBackfillArgs(args) {
  let mode = 'dry-run';
  let modeSeen = false;
  let executionId;
  let workspaceRevision;

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '--apply') {
      if (modeSeen) throw new Error('Specify exactly one of --dry-run or --apply.');
      mode = arg === '--apply' ? 'apply' : 'dry-run';
      modeSeen = true;
    } else if (arg.startsWith('--execution-id=')) {
      if (executionId !== undefined) throw new Error('Duplicate --execution-id.');
      executionId = arg.slice('--execution-id='.length);
    } else if (arg.startsWith('--workspace-revision=')) {
      if (workspaceRevision !== undefined) throw new Error('Duplicate --workspace-revision.');
      workspaceRevision = arg.slice('--workspace-revision='.length);
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (mode === 'dry-run' && (executionId !== undefined || workspaceRevision !== undefined)) {
    throw new Error('Execution identity flags are accepted only with --apply.');
  }

  if (mode === 'apply') {
    if (!executionId || !UUID_PATTERN.test(executionId)) {
      throw new Error('--apply requires a valid --execution-id UUID.');
    }
    if (!workspaceRevision || !SHA256_REVISION_PATTERN.test(workspaceRevision)) {
      throw new Error('--apply requires a full --workspace-revision sha256 digest.');
    }
  }

  return { mode, executionId: executionId ?? null, workspaceRevision: workspaceRevision ?? null };
}

export function packetRegistryBackfillApplyBlocker() {
  return 'NO_CURRENT_PACKETKEYV2_EXECUTION_AUTHORITY';
}
