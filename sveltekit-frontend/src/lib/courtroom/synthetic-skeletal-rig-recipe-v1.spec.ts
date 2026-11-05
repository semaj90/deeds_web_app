import { describe, expect, it } from 'vitest';
import {
  toCourtroomRestRig,
  validateSyntheticSkeletalRigRecipeV1,
} from './synthetic-skeletal-rig-recipe-v1.js';

const IDENTITY = [0, 0, 0, 1] as const;

function originalFixture() {
  return {
    schema: 'atlas.synthetic-skeletal-rig-recipe.v1',
    assetKind: 'synthetic_fixture',
    authority: 'non_evidence',
    outputScope: 'isolated_scratch',
    units: 'meters',
    coordinateSystem: 'RIGHT_HANDED_Y_UP',
    framesPerSecond: 24,
    skeleton: {
      bones: [
        { name: 'root', parent: null, restTranslationMeters: [0, 0, 0], restLocalRotation: [...IDENTITY] },
        { name: 'torso', parent: 'root', restTranslationMeters: [0, 1, 0], restLocalRotation: [...IDENTITY] },
        { name: 'head', parent: 'torso', restTranslationMeters: [0, 0.5, 0], restLocalRotation: [...IDENTITY] },
      ],
    },
    clips: [{
      name: 'eight-second-inspection',
      durationSeconds: 8,
      loop: false,
      rootMotion: 'in_place',
      tracks: [{
        channel: 'rotation',
        bone: 'head',
        keyframes: [
          { timeSeconds: 0, value: [...IDENTITY] },
          { timeSeconds: 4, value: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
          { timeSeconds: 8, value: [...IDENTITY] },
        ],
      }],
    }],
  };
}

describe('synthetic skeletal rig recipe v1', () => {
  it('accepts a synthetic eight-second 24 fps fixture, not case evidence', () => {
    const parsed = validateSyntheticSkeletalRigRecipeV1(originalFixture());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.authority).toBe('non_evidence');
    expect(parsed.data.outputScope).toBe('isolated_scratch');
    expect(parsed.data.clips[0].durationSeconds * parsed.data.framesPerSecond).toBe(192);
    expect(toCourtroomRestRig(parsed.data)).toEqual([
      { name: 'root', parent: null, restLocal: [...IDENTITY] },
      { name: 'torso', parent: 'root', restLocal: [...IDENTITY] },
      { name: 'head', parent: 'torso', restLocal: [...IDENTITY] },
    ]);
  });

  it('rejects case IDs and evidence metadata at this synthetic-only boundary', () => {
    expect(validateSyntheticSkeletalRigRecipeV1({ ...originalFixture(), caseId: 'foreign' }).success).toBe(false);
    expect(validateSyntheticSkeletalRigRecipeV1({ ...originalFixture(), outputScope: 'case_storage' }).success).toBe(false);
  });

  it('rejects duplicate bones, missing parents, and cycles', () => {
    const duplicate = originalFixture();
    duplicate.skeleton.bones[2].name = 'root';
    expect(validateSyntheticSkeletalRigRecipeV1(duplicate).success).toBe(false);

    const unknownParent = originalFixture();
    unknownParent.skeleton.bones[1].parent = 'missing';
    expect(validateSyntheticSkeletalRigRecipeV1(unknownParent).success).toBe(false);

    const cycle = originalFixture();
    cycle.skeleton.bones[0].parent = 'head';
    expect(validateSyntheticSkeletalRigRecipeV1(cycle).success).toBe(false);
  });

  it('rejects unknown bones and duplicated tracks', () => {
    const unknown = originalFixture();
    unknown.clips[0].tracks[0].bone = 'not_a_bone';
    expect(validateSyntheticSkeletalRigRecipeV1(unknown).success).toBe(false);

    const duplicated = originalFixture();
    duplicated.clips[0].tracks.push({ ...duplicated.clips[0].tracks[0] });
    expect(validateSyntheticSkeletalRigRecipeV1(duplicated).success).toBe(false);
  });

  it('rejects unsorted, out-of-range and nonzero-start keyframes', () => {
    const unsorted = originalFixture();
    unsorted.clips[0].tracks[0].keyframes[1].timeSeconds = 0;
    expect(validateSyntheticSkeletalRigRecipeV1(unsorted).success).toBe(false);

    const outOfRange = originalFixture();
    outOfRange.clips[0].tracks[0].keyframes[2].timeSeconds = 10;
    expect(validateSyntheticSkeletalRigRecipeV1(outOfRange).success).toBe(false);

    const missingFirst = originalFixture();
    missingFirst.clips[0].tracks[0].keyframes[0].timeSeconds = 0.5;
    expect(validateSyntheticSkeletalRigRecipeV1(missingFirst).success).toBe(false);
  });

  it('rejects non-unit quaternions and nonfinite values', () => {
    const nonUnit = originalFixture();
    nonUnit.skeleton.bones[1].restLocalRotation = [0, 0, 0, 0];
    expect(validateSyntheticSkeletalRigRecipeV1(nonUnit).success).toBe(false);

    const nonFinite = originalFixture();
    nonFinite.clips[0].tracks[0].keyframes[1].value[0] = Number.NaN;
    expect(validateSyntheticSkeletalRigRecipeV1(nonFinite).success).toBe(false);
  });

  it('admits explicit root translation but rejects translation of child bones', () => {
    const moving = originalFixture();
    const clip: Record<string, unknown> = moving.clips[0];
    clip.rootMotion = 'explicit_root_translation';
    const movingClip = clip as { tracks: unknown[] };
    movingClip.tracks.push({
      channel: 'translation',
      bone: 'root',
      keyframes: [
        { timeSeconds: 0, value: [0, 0, 0] },
        { timeSeconds: 8, value: [1, 0, 0] },
      ],
    });
    expect(validateSyntheticSkeletalRigRecipeV1(moving).success).toBe(true);

    movingClip.tracks[1] = {
      channel: 'translation',
      bone: 'head',
      keyframes: [
        { timeSeconds: 0, value: [0, 0, 0] },
        { timeSeconds: 8, value: [1, 0, 0] },
      ],
    };
    expect(validateSyntheticSkeletalRigRecipeV1(moving).success).toBe(false);

    clip.rootMotion = 'in_place';
    movingClip.tracks[1] = {
      channel: 'translation',
      bone: 'root',
      keyframes: [
        { timeSeconds: 0, value: [0, 0, 0] },
        { timeSeconds: 8, value: [1, 0, 0] },
      ],
    };
    expect(validateSyntheticSkeletalRigRecipeV1(moving).success).toBe(false);
  });
});
