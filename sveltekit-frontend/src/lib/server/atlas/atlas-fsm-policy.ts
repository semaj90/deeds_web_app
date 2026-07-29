/**
 * Atlas Finite State Machine Policy — rule-based state transitions.
 * This is the HMM replacement until we have empirical transition data.
 * Each transition checks preconditions and gates tools allowed in the next state.
 */

import { AtlasState, AtlasRuntimeContext, RuntimeObservation, HMMInference } from './atlas-runtime-context';

type StatePolicy = {
  [key in AtlasState]: {
    allowedTools: string[];
    preconditions?: (obs: RuntimeObservation) => boolean;
    nextStates: {
      [nextState in AtlasState]?: (obs: RuntimeObservation) => boolean;
    };
  };
};

const ATLAS_STATE_POLICY: StatePolicy = {
  // DISCOVER: Identify packets, resolve identity
  [AtlasState.DISCOVER]: {
    allowedTools: ['atlas.discover', 'atlas.inspect_runtime'],
    nextStates: {
      [AtlasState.RETRIEVE]: (obs) => obs.evidenceCount > 0,
      [AtlasState.RECOVER]: (obs) => obs.authFailure || obs.validationStatus === 'FAIL',
    },
  },

  // RETRIEVE: Query Qdrant, Redis, Neo4j, Go Retrieval
  [AtlasState.RETRIEVE]: {
    allowedTools: [
      'atlas.retrieve',
      'atlas.embedding_neighbors',
      'atlas.graph_traversal',
      'atlas.inspect_runtime',
    ],
    preconditions: (obs) => !obs.revisionMismatch,
    nextStates: {
      [AtlasState.VERIFY]: (obs) => obs.retrievalConfidence > 0.6 && obs.evidenceCount > 0,
      [AtlasState.DISCOVER]: (obs) => obs.evidenceCount === 0, // Try more specific query
      [AtlasState.RECOVER]: (obs) => obs.validationStatus === 'FAIL' || obs.tokenPressure > 0.9,
    },
  },

  // VERIFY: Validate packets against Postgres canonical
  [AtlasState.VERIFY]: {
    allowedTools: ['atlas.validate_change', 'atlas.inspect_runtime'],
    nextStates: {
      [AtlasState.SYNTHESIZE]: (obs) => obs.validationStatus === 'PASS',
      [AtlasState.RETRIEVE]: (obs) => obs.validationStatus === 'WARN', // Weak evidence, try again
      [AtlasState.RECOVER]: (obs) => obs.validationStatus === 'FAIL',
    },
  },

  // SYNTHESIZE: LLM generation
  [AtlasState.SYNTHESIZE]: {
    allowedTools: ['atlas.build_context'],
    nextStates: {
      [AtlasState.VALIDATE]: (obs) => true, // Always validate after synthesis
      [AtlasState.RECOVER]: (obs) => obs.tokenPressure > 0.95,
    },
  },

  // MUTATE: Apply changes (write Postgres, invalidate cache)
  [AtlasState.MUTATE]: {
    allowedTools: ['atlas.apply_change'],
    preconditions: (obs) => obs.lastToolSucceeded, // Only mutate after validated change
    nextStates: {
      [AtlasState.VALIDATE]: (obs) => true, // Always validate after mutation
      [AtlasState.RECOVER]: (obs) => obs.lastToolError !== undefined,
    },
  },

  // VALIDATE: Deterministic proof gates
  [AtlasState.VALIDATE]: {
    allowedTools: ['atlas.validate_change', 'atlas.inspect_runtime'],
    nextStates: {
      [AtlasState.COMPLETE]: (obs) => obs.validationStatus === 'PASS',
      [AtlasState.MUTATE]: (obs) =>
        obs.validationStatus === 'PASS' && obs.lastTool === 'atlas.build_context',
      [AtlasState.RECOVER]: (obs) => obs.validationStatus === 'FAIL',
    },
  },

  // WAIT_EXTERNAL: Awaiting user input or async task
  [AtlasState.WAIT_EXTERNAL]: {
    allowedTools: ['atlas.delegate'],
    nextStates: {
      [AtlasState.VERIFY]: (obs) => obs.lastToolSucceeded,
      [AtlasState.RECOVER]: (obs) => !obs.lastToolSucceeded,
    },
  },

  // RECOVER: Error recovery, retry logic
  [AtlasState.RECOVER]: {
    allowedTools: ['atlas.inspect_runtime', 'atlas.discover'],
    nextStates: {
      [AtlasState.DISCOVER]: (obs) => true, // Restart discovery
      [AtlasState.COMPLETE]: (obs) => obs.iterationNumber > 5, // Give up after 5 retries
    },
  },

  // COMPLETE: Task done
  [AtlasState.COMPLETE]: {
    allowedTools: [],
    nextStates: {},
  },
};

/**
 * Estimate the next state based on observations.
 * This is a deterministic FSM (not probabilistic) until we have empirical data.
 */
export function estimateExecutionState(
  previous: AtlasState,
  observation: RuntimeObservation
): HMMInference {
  const policy = ATLAS_STATE_POLICY[previous];

  // Check preconditions
  if (policy.preconditions && !policy.preconditions(observation)) {
    return {
      state: AtlasState.RECOVER,
      confidence: 0.9,
      allowedTools: ATLAS_STATE_POLICY[AtlasState.RECOVER].allowedTools,
      allowMutation: false,
      recoveryAction: `Precondition failed for state ${previous}`,
    };
  }

  // Find the highest-priority transition
  let nextState = previous; // Default: stay in current state
  let confidence = 0.5;

  for (const [candidate, condition] of Object.entries(policy.nextStates)) {
    if (condition(observation)) {
      nextState = candidate as AtlasState;
      confidence = 0.85; // High confidence if condition passes
      break;
    }
  }

  const nextPolicy = ATLAS_STATE_POLICY[nextState];
  const allowMutation =
    nextState === AtlasState.MUTATE && observation.lastToolSucceeded && !observation.authFailure;

  return {
    state: nextState,
    confidence,
    allowedTools: nextPolicy.allowedTools,
    allowMutation,
  };
}

/**
 * Validate a state transition against policy.
 * Returns true if the transition is allowed, false otherwise.
 */
export function isTransitionAllowed(from: AtlasState, to: AtlasState, obs: RuntimeObservation): boolean {
  const policy = ATLAS_STATE_POLICY[from];
  if (!policy) return false;

  const condition = policy.nextStates[to];
  if (!condition) return false;

  return condition(obs);
}
