// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ANIMATION_TYPES, EMOTION_TO_COURTROOM_ANIM, courtroomAnimForEmotion } from './courtroom-types.js';

const FACE_EMOTIONS = ['happy', 'sad', 'angry', 'fear', 'surprise', 'disgust', 'neutral'];

describe('emotion to courtroom animation', () => {
  it('covers every FaceEmotion and only uses known animation types', () => {
    for (const e of FACE_EMOTIONS) {
      expect(ANIMATION_TYPES).toContain(courtroomAnimForEmotion(e));
    }
    expect(Object.keys(EMOTION_TO_COURTROOM_ANIM).sort()).toEqual([...FACE_EMOTIONS].sort());
  });

  it('falls back to idle for null, undefined and unknown values', () => {
    expect(courtroomAnimForEmotion(null)).toBe('idle');
    expect(courtroomAnimForEmotion(undefined)).toBe('idle');
    expect(courtroomAnimForEmotion('confused')).toBe('idle');
  });
});
