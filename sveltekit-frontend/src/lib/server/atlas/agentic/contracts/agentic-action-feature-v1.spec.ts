import { describe, expect, it } from 'vitest';
import { AGENTIC_ACTION_REGISTRY_V1_SEED } from '../agentic-action-registry-v1.js';
import { projectAgenticActionFeaturesV1 } from './agentic-action-feature-v1.js';
import { AGENTIC_CAPABILITY_BITS_V1 } from './agentic-capability-mask-v1.js';

describe('agentic action feature v1', () => {
  it('projects registry actions into a deterministic derived feature sidecar', () => {
    const actions = AGENTIC_ACTION_REGISTRY_V1_SEED.filter((action) => ['SEARCH', 'MUTATE'].includes(action.kind));
    const feature = projectAgenticActionFeaturesV1({
      candidateOrdinal: 4,
      canonicalId: 'packet:4',
      featureRevision: 'agentic-actions:v1',
      actions: [...actions].reverse(),
      evidenceRefs: ['evidence:b', 'evidence:a', 'evidence:a'],
    });
    expect(feature.actionIds).toEqual([...actions].map((action) => action.actionId).sort());
    expect(feature.capabilityMask & (1 << AGENTIC_CAPABILITY_BITS_V1.SEARCH)).toBeTruthy();
    expect(feature.capabilityMask & (1 << AGENTIC_CAPABILITY_BITS_V1.MUTATE)).toBeTruthy();
    expect(feature.actionCount).toBe(actions.length);
    expect(feature.evidenceRefs).toEqual(['evidence:a', 'evidence:b']);
    expect(feature.canonicalAuthority).toBe(false);
    expect(feature.writesPerformed).toBe(false);
  });

  it('does not manufacture an action or identity for an empty candidate', () => {
    const feature = projectAgenticActionFeaturesV1({
      candidateOrdinal: 0,
      canonicalId: 'candidate:0',
      featureRevision: 'agentic-actions:v1',
      actions: [],
    });
    expect(feature.actionCount).toBe(0);
    expect(feature.capabilityMask).toBe(0);
    expect(feature.mutatingActionCount).toBe(0);
  });
});
