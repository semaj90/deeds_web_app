import { describe, expect, it } from 'vitest';
import {
  step,
  initialState,
  validateStory,
  sampleStory,
  type Story,
} from './engine.js';
import {
  COURTROOM_MUSIC_MANIFEST_V1,
  COURTROOM_MUSIC_TRACK_IDS,
} from '../courtroom-music-manifest-v1.js';

describe('CSP-11: Music cue kind and manifest validation', () => {
  it('exposes allowlisted music tracks from manifest v1', () => {
    expect(COURTROOM_MUSIC_MANIFEST_V1.tracks.length).toBeGreaterThanOrEqual(5);
    expect(COURTROOM_MUSIC_TRACK_IDS).toContain('trial-opening');
    expect(COURTROOM_MUSIC_TRACK_IDS).toContain('cross-examination');
    expect(COURTROOM_MUSIC_TRACK_IDS).toContain('silence');
  });

  it('sets state.music when a valid music cue is reached', () => {
    const story: Story = {
      ...sampleStory,
      id: 'music-test-001',
      cues: [
        { id: 'm1', tick: 5, actorId: 'alice', kind: 'music', value: 'trial-opening' },
        { id: 'm2', tick: 20, actorId: 'alice', kind: 'music', value: 'cross-examination' },
        { id: 'm3', tick: 35, actorId: 'alice', kind: 'music', value: 'silence' },
      ],
    };

    let s = initialState(story);
    expect(s.music).toBeNull();

    s = step(story, s, { type: 'TICK', steps: 5 });
    expect(s.music).toBe('trial-opening');
    expect(s.fired).toContain('m1');

    s = step(story, s, { type: 'TICK', steps: 15 });
    expect(s.music).toBe('cross-examination');
    expect(s.fired).toContain('m2');

    // Silence turns off active music
    s = step(story, s, { type: 'TICK', steps: 15 });
    expect(s.music).toBeNull();
    expect(s.fired).toContain('m3');
  });

  it('validateStory rejects stories with unknown music track IDs', () => {
    const invalidStory = {
      ...sampleStory,
      cues: [
        { id: 'm-bad', tick: 1, actorId: 'alice', kind: 'music', value: 'unregistered-pirated-track.mp3' },
      ],
    };
    expect(validateStory(invalidStory)).toBe(false);
  });

  it('validateStory accepts stories with allowlisted music track IDs', () => {
    const validStory: Story = {
      ...sampleStory,
      cues: [
        { id: 'm-good', tick: 1, actorId: 'alice', kind: 'music', value: 'testimony-moderato' },
      ],
    };
    expect(validateStory(validStory)).toBe(true);
  });
});
