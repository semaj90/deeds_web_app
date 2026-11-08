/**
 * Synthetic-only Blender/MCP skeletal animation input contract.
 *
 * This is not the primitive object-transform recipe, a GLB importer, a Blender
 * executor, a forensic measurement, or an admitted case-scene write surface.
 * It is a strict interchange contract for a *new* original synthetic fixture.
 * A skinned GLB still requires independent verification of mesh weights,
 * inverse bind matrices, animation bindings, and coordinate conversion.
 *
 * Existing Babylon/courtroom rig types own runtime retargeting. This contract
 * does not implement a parallel retarget engine.
 */
import { z } from 'zod';
import type { Rig } from './rest-pose-retarget-v1.js';

const boundedMeters = z.number().finite().min(-50).max(50);
const vec3 = z.tuple([boundedMeters, boundedMeters, boundedMeters]);
const quaternion = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine((q) => Math.abs(q.reduce((sum, n) => sum + n * n, 0) - 1) <= 0.01, {
    message: 'Quaternion must have unit length (x, y, z, w)',
  });
const boneName = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
const seconds = z.number().finite().nonnegative().max(60);

const boneSchema = z.strictObject({
  name: boneName,
  parent: boneName.nullable(),
  restTranslationMeters: vec3,
  restLocalRotation: quaternion,
});

const rotationTrack = z.strictObject({
  channel: z.literal('rotation'),
  bone: boneName,
  keyframes: z.array(z.strictObject({
    timeSeconds: seconds,
    value: quaternion,
  })).min(2).max(256),
});
const translationTrack = z.strictObject({
  channel: z.literal('translation'),
  bone: boneName,
  keyframes: z.array(z.strictObject({
    timeSeconds: seconds,
    value: vec3,
  })).min(2).max(256),
});
const trackSchema = z.discriminatedUnion('channel', [rotationTrack, translationTrack]);

const clipSchema = z.strictObject({
  name: z.string().min(1).max(100),
  durationSeconds: z.number().finite().positive().max(60),
  loop: z.boolean(),
  rootMotion: z.enum(['in_place', 'explicit_root_translation']),
  tracks: z.array(trackSchema).min(1).max(256),
});

export const SyntheticSkeletalRigRecipeV1Schema = z.strictObject({
  schema: z.literal('atlas.synthetic-skeletal-rig-recipe.v1'),
  assetKind: z.literal('synthetic_fixture'),
  authority: z.literal('non_evidence'),
  outputScope: z.literal('isolated_scratch'),
  units: z.literal('meters'),
  coordinateSystem: z.literal('RIGHT_HANDED_Y_UP'),
  framesPerSecond: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  skeleton: z.strictObject({
    bones: z.array(boneSchema).min(1).max(128),
  }),
  clips: z.array(clipSchema).min(1).max(16),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  let rootName: string | null = null;
  let roots = 0;
  data.skeleton.bones.forEach((bone, index) => {
    if (seen.has(bone.name)) {
      ctx.addIssue({ code: 'custom', path: ['skeleton', 'bones', index, 'name'], message: 'Duplicate bone' });
    }
    if (bone.parent === null) {
      roots++;
      rootName = bone.name;
    } else if (!seen.has(bone.parent)) {
      ctx.addIssue({
        code: 'custom',
        path: ['skeleton', 'bones', index, 'parent'],
        message: 'Bones must be parents-first, have a known parent, and contain no cycles',
      });
    }
    seen.add(bone.name);
  });
  if (roots !== 1) {
    ctx.addIssue({ code: 'custom', path: ['skeleton'], message: 'Exactly one root bone is required' });
  }

  const clipNames = new Set<string>();
  data.clips.forEach((clip, ci) => {
    if (clipNames.has(clip.name)) {
      ctx.addIssue({ code: 'custom', path: ['clips', ci, 'name'], message: 'Duplicate clip name' });
    }
    clipNames.add(clip.name);
    const trackNames = new Set<string>();
    let rootTranslationTracks = 0;
    clip.tracks.forEach((track, ti) => {
      const path = ['clips', ci, 'tracks', ti];
      if (!seen.has(track.bone)) {
        ctx.addIssue({ code: 'custom', path: [...path, 'bone'], message: 'Animation targets unknown bone' });
      }
      const key = track.channel + ':' + track.bone;
      if (trackNames.has(key)) {
        ctx.addIssue({ code: 'custom', path, message: 'Duplicate animation channel on one bone' });
      }
      trackNames.add(key);
      if (track.channel === 'translation') {
        if (track.bone !== rootName) {
          ctx.addIssue({ code: 'custom', path, message: 'Translation is restricted to the root bone' });
        } else rootTranslationTracks++;
      }

      let previousTime = -1;
      track.keyframes.forEach((frame, fi) => {
        if (frame.timeSeconds <= previousTime || frame.timeSeconds > clip.durationSeconds) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'keyframes', fi, 'timeSeconds'],
            message: 'Keyframes must be strictly increasing within clip duration',
          });
        }
        previousTime = frame.timeSeconds;
      });
      if (track.keyframes[0]?.timeSeconds !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'keyframes', 0, 'timeSeconds'],
          message: 'A track must define the pose at t=0',
        });
      }
    });
    if (clip.rootMotion === 'in_place' && rootTranslationTracks !== 0) {
      ctx.addIssue({ code: 'custom', path: ['clips', ci, 'rootMotion'], message: 'In-place clip cannot translate the root' });
    }
    if (clip.rootMotion === 'explicit_root_translation' && rootTranslationTracks !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['clips', ci, 'rootMotion'],
        message: 'Explicit root motion requires exactly one root translation track',
      });
    }
  });
});

export type SyntheticSkeletalRigRecipeV1 = z.infer<typeof SyntheticSkeletalRigRecipeV1Schema>;

/** A safe adapter to the EXISTING rotation-only courtroom rig math. */
export function toCourtroomRestRig(recipe: SyntheticSkeletalRigRecipeV1): Rig {
  return recipe.skeleton.bones.map((bone) => ({
    name: bone.name,
    parent: bone.parent,
    restLocal: bone.restLocalRotation,
  }));
}

/** All consumers, including MCP tools, must parse before executing anything. */
export function validateSyntheticSkeletalRigRecipeV1(input: unknown) {
  return SyntheticSkeletalRigRecipeV1Schema.safeParse(input);
}
