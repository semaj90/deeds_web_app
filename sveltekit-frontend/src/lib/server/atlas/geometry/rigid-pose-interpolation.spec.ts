import { describe, expect, it } from 'vitest';
import {
  buildPoseInterpolationReceipt,
  interpolateRigidPose,
  normalizeRotationQuaternion,
  nlerpRotationQuaternion,
  rotationAngularDistance,
  slerpRotationQuaternion,
} from './rigid-pose-interpolation.js';

describe('rigid-pose interpolation', () => {
  it('normalizes quaternions', () => {
    expect(normalizeRotationQuaternion([2, 0, 0, 0])).toEqual([1, 0, 0, 0]);
  });

  it('treats q and -q as the same physical orientation', () => {
    expect(rotationAngularDistance([1, 0, 0, 0], [-1, 0, 0, 0])).toBeCloseTo(0, 12);
  });

  it('uses the shortest antipodal SLERP path', () => {
    const mid = slerpRotationQuaternion([1, 0, 0, 0], [-1, 0, 0, 0], 0.5);
    expect(rotationAngularDistance([1, 0, 0, 0], mid)).toBeCloseTo(0, 12);
  });

  it('falls back safely for tiny angular separation', () => {
    const q = slerpRotationQuaternion([1, 0, 0, 0], [0.999999, 0.001, 0, 0], 0.5);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
  });

  it('keeps NLERP normalized as the cheap approximation', () => {
    const q = nlerpRotationQuaternion([1, 0, 0, 0], [0, 1, 0, 0], 0.5);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
  });

  it('LERPs translation and SLERPs orientation independently', () => {
    const pose = interpolateRigidPose(
      { translation: [0, 0, 0], rotation: [1, 0, 0, 0] },
      { translation: [10, 4, -2], rotation: [0, 1, 0, 0] },
      0.5,
    );
    expect(pose.translation).toEqual([5, 2, -1]);
    expect(Math.hypot(...pose.rotation)).toBeCloseTo(1, 12);
    expect(rotationAngularDistance([1, 0, 0, 0], pose.rotation)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('records physical-pose semantics separately from retrieval manifold4', () => {
    expect(buildPoseInterpolationReceipt('test')).toMatchObject({
      translationMethod: 'LERP_R3',
      rotationMethod: 'SLERP_S3',
      physicalPoseSemantics: true,
      manifold4RetrievalSemantics: false,
    });
  });
});
