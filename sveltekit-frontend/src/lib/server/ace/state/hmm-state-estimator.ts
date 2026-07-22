import type { WorkflowState } from './workflow-state.js';

export interface HmmStateEstimate {
  likelyCurrentPhase: WorkflowState;
  likelyNextState: WorkflowState;
  anomalyProbability: number;
  confidence: number;
  advisory: string;
}

export class HmmStateEstimator {
  private transitionMatrix: Map<string, Map<string, number>> = new Map();
  private emissionMatrix: Map<string, Map<string, number>> = new Map();
  private initialStateProbs: Map<string, number> = new Map();

  constructor() {
    this.initializeMatrices();
  }

  private initializeMatrices(): void {
    // Transition probabilities (learned from data or expert domain knowledge)
    // For now, use hand-coded priors until empirical data available

    const states = ['OBSERVE', 'DIAGNOSE', 'RETRIEVE', 'PROPOSE', 'VALIDATE', 'EXECUTE', 'VERIFY', 'RECOVER', 'COMPLETE'];

    for (const state of states) {
      this.transitionMatrix.set(state, new Map());
      this.emissionMatrix.set(state, new Map());
    }

    // Transition probabilities (Advisory — NOT for authorization)
    this.transitionMatrix.get('OBSERVE')?.set('DIAGNOSE', 0.95);
    this.transitionMatrix.get('OBSERVE')?.set('RECOVER', 0.05);

    this.transitionMatrix.get('DIAGNOSE')?.set('RETRIEVE', 0.90);
    this.transitionMatrix.get('DIAGNOSE')?.set('RECOVER', 0.10);

    this.transitionMatrix.get('RETRIEVE')?.set('PROPOSE', 0.80);
    this.transitionMatrix.get('RETRIEVE')?.set('RECOVER', 0.20);

    this.transitionMatrix.get('PROPOSE')?.set('VALIDATE', 0.95);
    this.transitionMatrix.get('PROPOSE')?.set('RECOVER', 0.05);

    this.transitionMatrix.get('VALIDATE')?.set('EXECUTE', 0.70);
    this.transitionMatrix.get('VALIDATE')?.set('RECOVER', 0.30);

    this.transitionMatrix.get('EXECUTE')?.set('VERIFY', 0.90);
    this.transitionMatrix.get('EXECUTE')?.set('RECOVER', 0.10);

    this.transitionMatrix.get('VERIFY')?.set('COMPLETE', 0.75);
    this.transitionMatrix.get('VERIFY')?.set('RECOVER', 0.25);

    this.transitionMatrix.get('RECOVER')?.set('RETRIEVE', 0.50);
    this.transitionMatrix.get('RECOVER')?.set('COMPLETE', 0.50);

    this.transitionMatrix.get('COMPLETE')?.set('COMPLETE', 1.0);

    // Initial state probabilities
    this.initialStateProbs.set('OBSERVE', 1.0);
    for (const state of states) {
      if (state !== 'OBSERVE') {
        this.initialStateProbs.set(state, 0.0);
      }
    }
  }

  estimate(
    currentState: WorkflowState,
    observedEvents: Array<{ event: string; confidence: number }>
  ): HmmStateEstimate {
    // Get transition probabilities from current state
    const transitionsFromCurrent = this.transitionMatrix.get(currentState);
    if (!transitionsFromCurrent) {
      return {
        likelyCurrentPhase: currentState,
        likelyNextState: currentState,
        anomalyProbability: 1.0,
        confidence: 0.0,
        advisory: 'Unknown state'
      };
    }

    // Find most likely next state
    let likelyNextState = currentState;
    let maxTransitionProb = 0.0;

    for (const [nextState, prob] of transitionsFromCurrent.entries()) {
      if (prob > maxTransitionProb) {
        maxTransitionProb = prob;
        likelyNextState = nextState as WorkflowState;
      }
    }

    // Calculate anomaly probability based on observed events
    let anomalyScore = 0.0;
    for (const obs of observedEvents) {
      // Events that don't align with expected transitions increase anomaly score
      const expectedTransition = transitionsFromCurrent.has(obs.event);
      if (!expectedTransition) {
        anomalyScore += (1.0 - obs.confidence) * 0.2;
      }
    }

    anomalyScore = Math.min(1.0, anomalyScore);

    // Confidence is inverse of anomaly
    const confidence = 1.0 - anomalyScore;

    const advisory =
      anomalyScore > 0.5
        ? `High anomaly detected (${(anomalyScore * 100).toFixed(1)}%). Policy engine should decide on proceed/abort.`
        : anomalyScore > 0.3
          ? `Moderate anomaly (${(anomalyScore * 100).toFixed(1)}%). Proceed with caution.`
          : `Low anomaly. Proceed as normal.`;

    return {
      likelyCurrentPhase: currentState,
      likelyNextState,
      anomalyProbability: anomalyScore,
      confidence,
      advisory
    };
  }

  getTransitionProbability(from: WorkflowState, to: WorkflowState): number {
    return this.transitionMatrix.get(from)?.get(to) ?? 0.0;
  }
}
