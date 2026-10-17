import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  type RankedFunctionReceiptV1,
  RankedFunctionReceiptV1Schema,
} from '../ranking/ranked-function-receipt-v1.js';
import {
  type ActionKind,
  type ActionPermission,
  type AtlasActionV1,
  ACTION_PERMISSION_VALUES,
  AtlasActionV1Schema,
} from '../contracts/atlas-action-dag-v1.js';

export const SYNTHESIZED_WORKFLOW_DAG_SCHEMA = 'atlas.synthesized-workflow-dag.v1' as const;

export const SynthesizedWorkflowDagV1Schema = z
  .object({
    schema: z.literal(SYNTHESIZED_WORKFLOW_DAG_SCHEMA),
    dagId: z.string().min(1),
    dagChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    taskGoal: z.string().min(1),
    rankedReceiptId: z.string().min(1),
    rankedReceiptChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    workspaceRevision: z.string().min(1),
    actions: z.array(AtlasActionV1Schema),
    topologicalOrder: z.array(z.string().min(1)),
    requiredPermissions: z.array(z.enum(ACTION_PERMISSION_VALUES)),
    // Architectural invariants
    writesPerformed: z.literal(false),
    canonicalAuthority: z.literal(false),
  })
  .strict();
export type SynthesizedWorkflowDagV1 = z.infer<typeof SynthesizedWorkflowDagV1Schema>;

export type WorkflowSynthesisRejectionReason =
  | 'EMPTY_CANDIDATE_LIST'
  | 'PERMISSION_DENIED'
  | 'STALE_WORKSPACE_REVISION'
  | 'CYCLE_DETECTED'
  | 'UNRESOLVED_DEPENDENCY';

export type SynthesizedWorkflowDagResultV1 =
  | {
      decision: 'ACCEPT';
      dag: SynthesizedWorkflowDagV1;
    }
  | {
      decision: 'REJECT';
      rejectionReason: WorkflowSynthesisRejectionReason;
      message: string;
    };

export interface SynthesizeWorkflowDagInputV1 {
  taskGoal: string;
  rankedReceipt: RankedFunctionReceiptV1;
  targetWorkspaceRevision: string;
  grantedPermissions: readonly ActionPermission[];
  includeVerificationStep?: boolean;
}

/**
 * DAG-01: Typed Workflow Synthesis and Capability Checks.
 * Translates a RankedFunctionReceiptV1 into an executable, topologically sorted action DAG
 * with hard capability, boundary, and acyclicity verification.
 */
export function synthesizeWorkflowDagV1(
  input: SynthesizeWorkflowDagInputV1
): SynthesizedWorkflowDagResultV1 {
  const receipt = RankedFunctionReceiptV1Schema.parse(input.rankedReceipt);
  const granted = new Set(input.grantedPermissions);

  // 1. Candidate check
  if (receipt.rankedCandidates.length === 0) {
    return {
      decision: 'REJECT',
      rejectionReason: 'EMPTY_CANDIDATE_LIST',
      message: 'Ranked function receipt contains zero eligible candidates',
    };
  }

  // 2. Workspace revision alignment check
  if (receipt.workspaceRevision !== input.targetWorkspaceRevision) {
    return {
      decision: 'REJECT',
      rejectionReason: 'STALE_WORKSPACE_REVISION',
      message: `Receipt workspaceRevision '${receipt.workspaceRevision}' does not match target '${input.targetWorkspaceRevision}'`,
    };
  }

  const actions: AtlasActionV1[] = [];
  const requiredPermissions = new Set<ActionPermission>();
  const actionIds = new Set<string>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  let previousActionId: string | null = null;

  // 3. Synthesize candidate function execution actions
  for (const candidate of receipt.rankedCandidates) {
    const actionId = `act_${createHash('sha256').update(`${candidate.canonicalId}:${candidate.rank}`).digest('hex').slice(0, 16)}`;
    actionIds.add(actionId);

    // Determine required permission based on action intent
    const permission: ActionPermission = 'READ_ONLY';
    requiredPermissions.add(permission);

    // Check capability
    if (!granted.has(permission)) {
      return {
        decision: 'REJECT',
        rejectionReason: 'PERMISSION_DENIED',
        message: `Action '${actionId}' requires '${permission}' which is not in granted permissions: [${[...granted].join(', ')}]`,
      };
    }

    const dependsOn: string[] = previousActionId ? [previousActionId] : [];

    const action: AtlasActionV1 = {
      schema: 'atlas.action.v1',
      actionId,
      requestId: receipt.receiptId,
      kind: 'EDIT_FILES',
      dependsOn,
      evidenceRefs: [
        `symbol:${candidate.canonicalId}`,
        `receipt:${receipt.receiptId}#rank_${candidate.rank}`,
      ],
      expectedSourceRevision: candidate.sourceRevision,
      permission,
      idempotencyKey: `idem_${actionId}`,
      state: 'PROPOSED',
      history: [
        {
          from: 'PROPOSED',
          to: 'PROPOSED',
          timestamp: new Date().toISOString(),
          reason: `Synthesized from function rank ${candidate.rank}: ${candidate.symbolName}`,
        },
      ],
      canonicalAuthority: false,
    };

    actions.push(action);
    previousActionId = actionId;
  }

  // 4. Optionally append verification step (RUN_TESTS)
  if (input.includeVerificationStep !== false && previousActionId) {
    const verifyActionId = `act_verify_${createHash('sha256').update(receipt.receiptId).digest('hex').slice(0, 16)}`;
    const verifyPermission: ActionPermission = 'EXECUTE_TESTS';
    requiredPermissions.add(verifyPermission);

    if (!granted.has(verifyPermission)) {
      return {
        decision: 'REJECT',
        rejectionReason: 'PERMISSION_DENIED',
        message: `Verification step requires '${verifyPermission}' which was not granted`,
      };
    }

    actionIds.add(verifyActionId);
    actions.push({
      schema: 'atlas.action.v1',
      actionId: verifyActionId,
      requestId: receipt.receiptId,
      kind: 'RUN_TESTS',
      dependsOn: [previousActionId],
      evidenceRefs: [`receipt:${receipt.receiptId}#verification_gate`],
      expectedSourceRevision: input.targetWorkspaceRevision,
      permission: verifyPermission,
      idempotencyKey: `idem_${verifyActionId}`,
      state: 'PROPOSED',
      history: [
        {
          from: 'PROPOSED',
          to: 'PROPOSED',
          timestamp: new Date().toISOString(),
          reason: 'Post-synthesis test verification gate',
        },
      ],
      canonicalAuthority: false,
    });
  }

  // 5. Build Graph and Kahn's algorithm for topological sorting & cycle detection
  for (const act of actions) {
    inDegree.set(act.actionId, act.dependsOn.length);
    for (const dep of act.dependsOn) {
      if (!actionIds.has(dep)) {
        return {
          decision: 'REJECT',
          rejectionReason: 'UNRESOLVED_DEPENDENCY',
          message: `Action '${act.actionId}' depends on unknown action '${dep}'`,
        };
      }
      const adj = adjacency.get(dep) ?? [];
      adj.push(act.actionId);
      adjacency.set(dep, adj);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topologicalOrder.push(curr);
    for (const neighbor of adjacency.get(curr) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (topologicalOrder.length !== actions.length) {
    return {
      decision: 'REJECT',
      rejectionReason: 'CYCLE_DETECTED',
      message: 'Dependency cycle detected in synthesized workflow actions',
    };
  }

  // Re-order actions strictly by topological order
  const actionMap = new Map(actions.map((a) => [a.actionId, a]));
  const sortedActions = topologicalOrder.map((id) => actionMap.get(id)!);

  // 6. Compute deterministic DAG checksum
  const dagPayload = JSON.stringify({
    taskGoal: input.taskGoal,
    rankedReceiptChecksum: receipt.receiptChecksum,
    workspaceRevision: input.targetWorkspaceRevision,
    topologicalOrder,
  });
  const hash = createHash('sha256').update(dagPayload, 'utf8').digest('hex');
  const dagChecksum = `sha256:${hash}`;
  const dagId = `dag_${hash.slice(0, 16)}`;

  return {
    decision: 'ACCEPT',
    dag: SynthesizedWorkflowDagV1Schema.parse({
      schema: SYNTHESIZED_WORKFLOW_DAG_SCHEMA,
      dagId,
      dagChecksum,
      taskGoal: input.taskGoal,
      rankedReceiptId: receipt.receiptId,
      rankedReceiptChecksum: receipt.receiptChecksum,
      workspaceRevision: input.targetWorkspaceRevision,
      actions: sortedActions,
      topologicalOrder,
      requiredPermissions: [...requiredPermissions],
      writesPerformed: false,
      canonicalAuthority: false,
    }),
  };
}
