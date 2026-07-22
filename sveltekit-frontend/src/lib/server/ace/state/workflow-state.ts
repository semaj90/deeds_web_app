import { z } from 'zod';

export const WorkflowStateSchema = z.enum([
  'OBSERVE',
  'DIAGNOSE',
  'RETRIEVE',
  'PROPOSE',
  'VALIDATE',
  'EXECUTE',
  'VERIFY',
  'RECOVER',
  'COMPLETE'
]);

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const StateTransitionSchema = z.object({
  from: WorkflowStateSchema,
  to: WorkflowStateSchema,
  condition: z.string(),
  requiresApproval: z.boolean().default(false)
});

export type StateTransition = z.infer<typeof StateTransitionSchema>;

export class WorkflowStateMachine {
  private currentState: WorkflowState = 'OBSERVE';
  private transitions: Map<string, StateTransition[]> = new Map();

  constructor() {
    this.registerTransitions();
  }

  private registerTransitions(): void {
    // OBSERVE → DIAGNOSE: Always proceed after query received
    this.addTransition({
      from: 'OBSERVE',
      to: 'DIAGNOSE',
      condition: 'query_received',
      requiresApproval: false
    });

    // DIAGNOSE → RETRIEVE: If query intent clear
    this.addTransition({
      from: 'DIAGNOSE',
      to: 'RETRIEVE',
      condition: 'intent_classified',
      requiresApproval: false
    });

    // RETRIEVE → PROPOSE: If evidence sufficient
    this.addTransition({
      from: 'RETRIEVE',
      to: 'PROPOSE',
      condition: 'evidence_sufficient',
      requiresApproval: false
    });

    // RETRIEVE → RECOVER: If evidence insufficient
    this.addTransition({
      from: 'RETRIEVE',
      to: 'RECOVER',
      condition: 'evidence_insufficient',
      requiresApproval: false
    });

    // PROPOSE → VALIDATE: Always after proposal generation
    this.addTransition({
      from: 'PROPOSE',
      to: 'VALIDATE',
      condition: 'proposal_generated',
      requiresApproval: false
    });

    // VALIDATE → EXECUTE: If validation passes
    this.addTransition({
      from: 'VALIDATE',
      to: 'EXECUTE',
      condition: 'validation_passed',
      requiresApproval: true // Policy engine decides
    });

    // VALIDATE → RECOVER: If validation fails
    this.addTransition({
      from: 'VALIDATE',
      to: 'RECOVER',
      condition: 'validation_failed',
      requiresApproval: false
    });

    // EXECUTE → VERIFY: After action execution
    this.addTransition({
      from: 'EXECUTE',
      to: 'VERIFY',
      condition: 'action_executed',
      requiresApproval: false
    });

    // VERIFY → COMPLETE: If outcome successful
    this.addTransition({
      from: 'VERIFY',
      to: 'COMPLETE',
      condition: 'outcome_verified',
      requiresApproval: false
    });

    // VERIFY → RECOVER: If outcome uncertain
    this.addTransition({
      from: 'VERIFY',
      to: 'RECOVER',
      condition: 'outcome_uncertain',
      requiresApproval: false
    });

    // RECOVER → RETRIEVE: Retry with different strategy
    this.addTransition({
      from: 'RECOVER',
      to: 'RETRIEVE',
      condition: 'recovery_strategy_selected',
      requiresApproval: true
    });

    // RECOVER → COMPLETE: Give up gracefully
    this.addTransition({
      from: 'RECOVER',
      to: 'COMPLETE',
      condition: 'recovery_exhausted',
      requiresApproval: false
    });

    // COMPLETE: Terminal state, no transitions
  }

  private addTransition(transition: StateTransition): void {
    const key = transition.from;
    if (!this.transitions.has(key)) {
      this.transitions.set(key, []);
    }
    this.transitions.get(key)!.push(transition);
  }

  getCurrentState(): WorkflowState {
    return this.currentState;
  }

  canTransitionTo(targetState: WorkflowState, condition: string): boolean {
    const possibleTransitions = this.transitions.get(this.currentState) || [];
    return possibleTransitions.some(
      t => t.to === targetState && t.condition === condition
    );
  }

  getTransition(condition: string): StateTransition | null {
    const possibleTransitions = this.transitions.get(this.currentState) || [];
    return possibleTransitions.find(t => t.condition === condition) || null;
  }

  transitionTo(targetState: WorkflowState, condition: string): boolean {
    const transition = this.getTransition(condition);

    if (!transition) {
      return false;
    }

    if (transition.to !== targetState) {
      return false;
    }

    this.currentState = targetState;
    return true;
  }

  getAllPossibleTransitions(): StateTransition[] {
    return this.transitions.get(this.currentState) || [];
  }

  reset(): void {
    this.currentState = 'OBSERVE';
  }
}
