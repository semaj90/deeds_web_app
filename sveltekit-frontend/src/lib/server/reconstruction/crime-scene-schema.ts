/**
 * crime-scene-schema.ts
 *
 * Canonical Zod schemas for the deterministic crime-reconstruction pipeline.
 * The LLM emits `CrimeScenePlan`; the compiler turns it into a Blender script
 * + scene-metadata.json. No LLM in the compiler path — same intent → same
 * output, load-bearing for legal audit.
 *
 * License-safe action allowlist: every action must map to a Mixamo asset
 * we have a redistribution license for. The LLM picks from this enum;
 * arbitrary verbs are rejected.
 */
import { z } from 'zod';

export const ACTION_ALLOWLIST = [
  'idle', 'walk', 'run', 'fall', 'strike', 'turn', 'kneel',
] as const;

export const ROLE_ALLOWLIST = [
  'suspect', 'victim', 'witness', 'officer', 'unknown',
] as const;

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

export const ANNOTATION_KINDS = [
  'evidence_pin', 'uncertainty', 'note', 'trajectory',
] as const;

export const AESTHETIC_PRESETS = ['ps1', 'n64', 'modern-low-poly'] as const;

export const ActorSchema = z.object({
  actor_id: z.string().min(1),
  role:     z.enum(ROLE_ALLOWLIST),
  label:    z.string().min(1),
});
export type Actor = z.infer<typeof ActorSchema>;

export const PathPointSchema = z.object({
  t: z.number().min(0),
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type PathPoint = z.infer<typeof PathPointSchema>;

export const AnnotationSchema = z.object({
  t:           z.number().min(0),
  kind:        z.enum(ANNOTATION_KINDS),
  text:        z.string().min(1),
  evidence_id: z.string().optional(),
  position:    z.tuple([z.number(), z.number(), z.number()]).optional(),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

export const CrimeSceneEventSchema = z.object({
  id:               z.string().min(1),
  time_s:           z.number().min(0),
  duration_s:       z.number().min(0.1).max(30),
  location:         z.string().optional(),
  who:              z.array(ActorSchema).min(1),
  what:             z.string().min(1),
  why_hypothesis:   z.string().optional(),
  how:              z.string().min(1),
  action:           z.enum(ACTION_ALLOWLIST),
  path:             z.array(PathPointSchema).default([]),
  evidence_ids:     z.array(z.string()).default([]),
  confidence:       z.enum(CONFIDENCE_LEVELS),
  disputed:         z.boolean().default(false),
  reconstruction_notes: z.array(z.string()).default([]),
  annotations:      z.array(AnnotationSchema).default([]),
});
export type CrimeSceneEvent = z.infer<typeof CrimeSceneEventSchema>;

export const CrimeScenePlanSchema = z.object({
  scene_id:    z.string().min(1),
  case_id:     z.string().optional(),
  title:       z.string().min(1),
  city:        z.string().min(1),
  aesthetic:   z.enum(AESTHETIC_PRESETS).default('ps1'),
  duration_s:  z.number().min(1).max(60),
  events:      z.array(CrimeSceneEventSchema).min(1),
  disclaimer:  z.string().default('Demonstrative reconstruction — not original footage'),
});
export type CrimeScenePlan = z.infer<typeof CrimeScenePlanSchema>;

/**
 * Mixamo action ID mapping. Action verbs from the allowlist resolve to a
 * fixed asset filename. The LLM never picks an arbitrary Mixamo asset —
 * it picks an action verb, the compiler picks the asset.
 */
export const MIXAMO_ACTION_MAP: Record<typeof ACTION_ALLOWLIST[number], string> = {
  idle:   'mixamo_idle_01',
  walk:   'mixamo_walk_forward_01',
  run:    'mixamo_run_01',
  fall:   'mixamo_fall_backward_01',
  strike: 'mixamo_punch_01',
  turn:   'mixamo_turn_left_01',
  kneel:  'mixamo_kneel_01',
};

// ──────────────────────────────────────────────────────────────────────────
// SceneIntent — the LLM-facing schema (Phase 1 — 2026-05-08).
//
// `CrimeScenePlanSchema` (above) is the deterministic compiler input — it
// constrains actions to the 7-item Mixamo-mapped subset so the compiler
// always emits valid Blender. `SceneIntentSchema` (below) is what the LLM
// emits; richer (top-level actors[], structured environment, evidence_links,
// scene-level annotations) and uses the broader 17-item action allowlist
// that subsumes the courtroom_anim_type Postgres enum + the existing
// 7-action Mixamo-mapped set.
//
// Pipeline:
//   Gemma4/Qwen → SceneIntent (LLM, 17 actions)
//     ↓ sceneIntentToPlan() — drop scene-level metadata, project actions
//   CrimeScenePlan (compiler input, 7 Mixamo actions)
//     ↓ scene-compiler.ts
//   Blender script + SceneMetadata (renderer input)
//
// Actions outside ACTION_ALLOWLIST get coerced to 'idle' on projection;
// the projection step logs a warning so we know which intents lost
// information passing through the compiler.
// ──────────────────────────────────────────────────────────────────────────

/** Broader action set the LLM may pick from. Subsumes the 7-action compiler
 *  vocabulary AND the courtroom_anim_type Postgres enum. */
export const SCENE_INTENT_ACTION_ALLOWLIST = [
  // Compiler-mapped (7) — render via Mixamo today
  'idle', 'walk', 'run', 'fall', 'strike', 'turn', 'kneel',
  // Courtroom + dialogue actions — supported by courtroom_anim_type enum
  'point', 'present_evidence', 'speaking', 'objection', 'sit', 'stand', 'gesture',
  // Investigation actions — not yet Mixamo-mapped, projected to compiler subset
  'search', 'flee', 'conceal',
] as const;

/** Subset projection: SceneIntent action → CrimeScenePlan ACTION_ALLOWLIST. */
const SCENE_INTENT_TO_COMPILER_ACTION: Record<
  typeof SCENE_INTENT_ACTION_ALLOWLIST[number],
  typeof ACTION_ALLOWLIST[number]
> = {
  // Identity for the 7 already-mapped
  idle: 'idle', walk: 'walk', run: 'run', fall: 'fall',
  strike: 'strike', turn: 'turn', kneel: 'kneel',
  // Courtroom verbs → closest Mixamo cousin (more nuance lives in scene metadata)
  point:            'idle',
  present_evidence: 'idle',
  speaking:         'idle',
  objection:        'strike',
  sit:              'kneel',
  stand:            'idle',
  gesture:          'idle',
  // Investigation verbs
  search: 'walk',
  flee:   'run',
  conceal: 'kneel',
};

export const EnvironmentSchema = z.object({
  city:        z.string().min(1).default('unspecified'),
  location:    z.string().optional(),
  time_of_day: z.enum(['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night']).optional(),
  weather:     z.enum(['clear', 'overcast', 'rain', 'fog', 'snow']).optional(),
  notes:       z.string().optional(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const EvidenceLinkSchema = z.object({
  evidence_id: z.string().min(1),
  label:       z.string().optional(),
  // Where in the scene this piece of evidence is anchored, if known.
  anchor:      z.tuple([z.number(), z.number(), z.number()]).optional(),
  // 'cited' = referenced but not placed; 'placed' = anchored in the scene;
  // 'disputed' = referenced and the placement is contested.
  status:      z.enum(['cited', 'placed', 'disputed']).default('cited'),
});
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;

export const SceneIntentEventSchema = z.object({
  id:               z.string().min(1),
  time_s:           z.number().min(0),
  duration_s:       z.number().min(0.1).max(30),
  location:         z.string().optional(),
  who:              z.array(ActorSchema).min(1),
  what:             z.string().min(1),
  why_hypothesis:   z.string().optional(),
  how:              z.string().min(1),
  action:           z.enum(SCENE_INTENT_ACTION_ALLOWLIST),
  path:             z.array(PathPointSchema).default([]),
  evidence_ids:     z.array(z.string()).default([]),
  confidence:       z.enum(CONFIDENCE_LEVELS),
  disputed:         z.boolean().default(false),
  annotations:      z.array(AnnotationSchema).default([]),
});
export type SceneIntentEvent = z.infer<typeof SceneIntentEventSchema>;

export const SceneIntentSchema = z.object({
  scene_id:    z.string().min(1),
  case_id:     z.string().optional(),
  title:       z.string().min(1),
  duration_s:  z.number().min(1).max(60),
  aesthetic:   z.enum(AESTHETIC_PRESETS).default('ps1'),
  environment: EnvironmentSchema,
  actors:      z.array(ActorSchema).min(1),
  events:      z.array(SceneIntentEventSchema).min(1),
  evidence_links: z.array(EvidenceLinkSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
  disclaimer:  z.string().default('Demonstrative reconstruction — not original footage'),
});
export type SceneIntent = z.infer<typeof SceneIntentSchema>;

/** Project a SceneIntent to a CrimeScenePlan the existing compiler accepts. */
export function sceneIntentToPlan(intent: SceneIntent): {
  plan: CrimeScenePlan;
  warnings: string[];
} {
  const warnings: string[] = [];
  const events = intent.events.map((ev) => {
    const projectedAction = SCENE_INTENT_TO_COMPILER_ACTION[ev.action];
    if (projectedAction !== ev.action) {
      warnings.push(
        `event ${ev.id}: action '${ev.action}' projected to compiler action '${projectedAction}' — Mixamo asset gap`,
      );
    }
    return {
      id:                  ev.id,
      time_s:              ev.time_s,
      duration_s:          ev.duration_s,
      location:            ev.location,
      who:                 ev.who,
      what:                ev.what,
      why_hypothesis:      ev.why_hypothesis,
      how:                 ev.how,
      action:              projectedAction,
      path:                ev.path,
      evidence_ids:        ev.evidence_ids,
      confidence:          ev.confidence,
      disputed:            ev.disputed,
      reconstruction_notes: [],
      annotations:         ev.annotations,
    };
  });
  const plan: CrimeScenePlan = CrimeScenePlanSchema.parse({
    scene_id:   intent.scene_id,
    case_id:    intent.case_id,
    title:      intent.title,
    city:       intent.environment.city,
    aesthetic:  intent.aesthetic,
    duration_s: intent.duration_s,
    events,
    disclaimer: intent.disclaimer,
  });
  return { plan, warnings };
}

/**
 * Output of the compiler — paired with a generated Blender script string.
 * Stored alongside the script as scene-metadata.json so the WebGPU viewer
 * can replay annotations without re-rendering the MP4.
 */
export const SceneMetadataSchema = z.object({
  scene_id:        z.string(),
  case_id:         z.string().optional(),
  title:           z.string(),
  city:            z.string(),
  aesthetic:       z.enum(AESTHETIC_PRESETS),
  duration_s:      z.number(),
  disclaimer:      z.string(),
  actors:          z.array(z.object({
    actor_id: z.string(),
    role:     z.enum(ROLE_ALLOWLIST),
    label:    z.string(),
  })),
  events: z.array(z.object({
    id:           z.string(),
    time_s:       z.number(),
    duration_s:   z.number(),
    action:       z.enum(ACTION_ALLOWLIST),
    mixamo_id:    z.string(),
    actor_ids:    z.array(z.string()),
    path:         z.array(PathPointSchema),
    confidence:   z.enum(CONFIDENCE_LEVELS),
    disputed:     z.boolean(),
    evidence_ids: z.array(z.string()),
  })),
  annotations:     z.array(AnnotationSchema),
  evidence_ids:    z.array(z.string()),
  generator: z.object({
    version:     z.string(),
    compiled_at: z.string(),
    plan_hash:   z.string(),
  }),
});
export type SceneMetadata = z.infer<typeof SceneMetadataSchema>;
