import { describe, expect, it } from 'vitest';
import {
  step,
  initialState,
  sampleStory,
  getCueIndex,
  type Story,
  type Cue,
  type Input,
  type State,
} from './engine.js';

describe('CSP-10: Cue indexing by tick', () => {
  it('indexes cues into byTick Map preserving arrival and evidence subsets', () => {
    const index = getCueIndex(sampleStory);
    expect(index.byTick instanceof Map).toBe(true);

    // Verify tick 1 has opening and animation cues
    const tick1 = index.byTick.get(1);
    expect(tick1).toBeDefined();
    expect(tick1?.map((c) => c.id)).toEqual(['opening', 'alice-idle']);

    // Verify arrival cues are isolated
    expect(index.arrivalCues.map((c) => c.id)).toEqual(['cross']);

    // Verify evidence cues are isolated
    expect(index.evidenceCues.map((c) => c.id)).toEqual(['closing']);
  });

  it('produces identical deterministic trajectory under multi-step progression', () => {
    let s1 = initialState(sampleStory);
    s1 = step(sampleStory, s1, { type: 'TICK', steps: 180 });
    expect(s1.tick).toBe(180);
    expect(s1.phase).toBe('testimony');
    expect(s1.evidence).toContain('ledger-photo');

    // Cross-examination arrival wait
    s1 = step(sampleStory, s1, { type: 'TICK', steps: 60 });
    expect(s1.tick).toBe(239); // Pauses before 240 waiting for jester arrival
    expect(s1.phase).toBe('testimony');

    // Settle move
    s1 = step(sampleStory, s1, {
      type: 'MOVE_SETTLED',
      actorId: 'jester',
      station: 'witness',
      outcome: 'finished',
    });

    // Advance to closing verdict
    s1 = step(sampleStory, s1, { type: 'TICK', steps: 211 });
    expect(s1.tick).toBe(450);
    expect(s1.phase).toBe('verdict');
    expect(s1.fired).toContain('closing');
  });

  it('property: indexing handles dense synthetic stories without regression', () => {
    const denseCues: Cue[] = [];
    for (let t = 1; t <= 500; t++) {
      if (t % 10 === 0) {
        denseCues.push({
          id: `cue-${t}`,
          tick: t,
          actorId: 'alice',
          kind: 'animation',
          value: 'talk',
        });
      }
    }

    const denseStory: Story = {
      version: 1,
      id: 'dense-test-story',
      title: 'Dense Story',
      actors: sampleStory.actors,
      cues: denseCues,
    };

    const index = getCueIndex(denseStory);
    expect(index.byTick.size).toBe(50); // 500 / 10

    let state = initialState(denseStory);
    state = step(denseStory, state, { type: 'TICK', steps: 250 });
    expect(state.tick).toBe(250);
    expect(state.fired.length).toBe(25);
  });
});
