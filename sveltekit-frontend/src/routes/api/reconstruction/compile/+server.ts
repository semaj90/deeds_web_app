// @vitest-environment node
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
  SceneIntentSchema,
  sceneIntentToPlan,
} from '$lib/server/reconstruction/crime-scene-schema.js';
import { compileCrimeScene } from '$lib/server/reconstruction/scene-compiler.js';

/**
 * POST /api/reconstruction/compile
 *
 * Accepts a SceneIntent JSON body, projects it to CrimeScenePlan via
 * sceneIntentToPlan(), then runs the deterministic compileCrimeScene().
 * Returns scene metadata + plan_hash + any projection warnings (so the
 * UI can show which 17-action verbs were collapsed to the 7-action
 * Mixamo subset).
 *
 * Pure function endpoint — no I/O, no DB, no model calls, no network
 * fan-out. Same SceneIntent → same response, byte-identical except the
 * `compiled_at` timestamp embedded in scene metadata.
 *
 * Auth: requires session.
 *
 * Success:   200 { ok: true, plan_hash, sceneMetadata, projectionWarnings, blenderScriptBytes }
 *            (we return the byte length of blenderScript, not the script
 *            itself, to keep the response small — clients that need the
 *            script call the compiler-runner script directly)
 * Bad input: 400 — Zod validation failure
 * Auth:      401
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  let body: unknown;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const parsed = SceneIntentSchema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.message);

  const projection = sceneIntentToPlan(parsed.data);
  const compiled   = compileCrimeScene(projection.plan);

  return json({
    ok:                  true,
    plan_hash:           compiled.planHash,
    sceneMetadata:       compiled.sceneMetadata,
    projectionWarnings:  projection.warnings,
    blenderScriptBytes:  compiled.blenderScript.length,
  });
};
