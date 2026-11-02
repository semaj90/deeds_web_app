import { HmmStateEstimator } from '../ace/state/hmm-state-estimator.js';
import { WorkflowStateSchema, type WorkflowState } from '../ace/state/workflow-state.js';
import { z } from 'zod';

export const EvidenceNextStepInputSchema = z.object({
  currentState: WorkflowStateSchema,
  extractedFactCount: z.number().int().min(0).max(60),
});

export type EvidenceNextStepV1 = {
  state: WorkflowState;
  transitionPrior: number;
  extractionStatus: 'FACTS_RETURNED' | 'NO_FACTS_RETURNED';
  admission: 'PROPOSAL_ONLY';
};

const estimator = new HmmStateEstimator();

export function rankEvidenceNextStepsV1(input: unknown): EvidenceNextStepV1[] {
  const parsed = EvidenceNextStepInputSchema.safeParse(input);
  if (!parsed.success) return [];

  const { currentState, extractedFactCount } = parsed.data;
  const allowedStates: WorkflowState[] = ['DIAGNOSE', 'RETRIEVE', 'PROPOSE', 'VALIDATE', 'RECOVER'];

  return allowedStates
    .map((state) => ({
      state,
      transitionPrior: estimator.getTransitionProbability(currentState, state),
      extractionStatus: extractedFactCount > 0 ? 'FACTS_RETURNED' as const : 'NO_FACTS_RETURNED' as const,
      admission: 'PROPOSAL_ONLY' as const,
    }))
    .filter((candidate) => candidate.transitionPrior > 0)
    .sort((left, right) => {
      if (extractedFactCount === 0 && left.state !== right.state) {
        if (left.state === 'RECOVER') return -1;
        if (right.state === 'RECOVER') return 1;
      }
      return right.transitionPrior - left.transitionPrior || left.state.localeCompare(right.state);
    });
}
