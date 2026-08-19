export interface TangWorkflowNodeCandidate {
  nodeId: string;
  dependsOn: string[];
  completed: boolean;
  blocked: boolean;
  authorizationRequired: boolean;
  authorizationGranted: boolean;
  exactPromotionRequired: boolean;
  exactPromotionSatisfied: boolean;
  validationRequired: boolean;
  priorExecutionSuccess?: number | null;
  estimatedLatencyMs?: number | null;
  estimatedGpuBytes?: number | null;
}

function finite01(value: number | null | undefined, fallback = 0.5): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : fallback;
}

/**
 * Orders only workflow nodes that are already eligible under canonical DAG rules.
 * It cannot bypass dependencies, authorization, exact promotion, or validation.
 */
export function prioritizeReadyWorkflowNodes(input: {
  nodes: TangWorkflowNodeCandidate[];
  completedNodeIds: Iterable<string>;
}): TangWorkflowNodeCandidate[] {
  const completed = new Set(input.completedNodeIds);
  return input.nodes
    .filter((node) => !node.completed && !node.blocked)
    .filter((node) => node.dependsOn.every((dep) => completed.has(dep)))
    .filter((node) => !node.authorizationRequired || node.authorizationGranted)
    .filter((node) => !node.exactPromotionRequired || node.exactPromotionSatisfied)
    .sort((a, b) => {
      const utility = (node: TangWorkflowNodeCandidate) => {
        const execution = finite01(node.priorExecutionSuccess, 0.5);
        const latencyPenalty = Math.min(1, (node.estimatedLatencyMs ?? 0) / 1000);
        const gpuPenalty = Math.min(1, (node.estimatedGpuBytes ?? 0) / (1024 * 1024 * 1024));
        return 0.7 * execution - 0.2 * latencyPenalty - 0.1 * gpuPenalty;
      };
      return utility(b) - utility(a) || a.nodeId.localeCompare(b.nodeId);
    });
}
