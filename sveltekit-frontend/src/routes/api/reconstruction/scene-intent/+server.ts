/**
 * POST /api/reconstruction/scene-intent
 *
 * Phase 1 of the Detective Mode 3D Reconstruction track. Converts a case
 * narrative + optional evidence IDs + optional ACE retrieval into a
 * Zod-validated SceneIntent JSON. The LLM never writes Blender / Three.js /
 * WGSL — that boundary is the legal-audit hedge.
 *
 * Degraded contract (per CLAUDE.md): on every failure path the response
 * has the same top-level keys (`ok`, `sceneIntent`, `source`, `diagnostics`)
 * with `sceneIntent` populated by `buildDegradedFixture()`. Clients can
 * always destructure without `?.` chains.
 *
 * No DB writes. No tool calls. No model writes. Cache key handled
 * automatically by the bifrostChat 3-tier cache (L1 Redis exact +
 * L2 Bifrost semantic + L3 Ollama fallback).
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';
import { buildVideoStorybookCoverageV1 } from '$lib/server/features/evidence/video/video-storybook-coverage-v1.js';
import { storybookImageObservationScopeV1Schema } from '$lib/shared/storybook-image-observations-v1.js';
import type { SceneIntent } from '$lib/server/reconstruction/crime-scene-schema.js';
import { acceptsStorybookFrameIntentV1, buildStorybookFramePrefillV1, storybookFrameLocatorV1Schema } from '$lib/server/reconstruction/storybook-frame-prefill-v1.js';
import { acceptsStorybookImageIntentV1, buildStorybookImagePrefillV1 } from '$lib/server/reconstruction/storybook-image-prefill-v1.js';
import {
  extractSceneIntent,
  buildDegradedFixture,
} from '$lib/server/reconstruction/scene-intent-extractor.js';

const RequestSchema = z.object({
  narrative:     z.string().min(1).max(8000),
  caseId:        z.string().uuid().optional(),
  evidenceIds:   z.array(z.string().min(1)).max(50).optional(),
  aestheticHint: z.enum(['ps1', 'n64', 'modern-low-poly']).optional(),
  /** Lift ACE retrieval over caseId. Off by default in Phase 1 — clients
   *  pass `useAce: true` once the dev server + retrieval stack are warm. */
  useAce:        z.boolean().default(false),
  /** Optional override; defaults to ornith-1.5-9b in the extractor. */
  model:         z.string().min(1).max(100).optional(),
  temperature:   z.number().min(0).max(1.5).optional(),
  storybookFrame: storybookFrameLocatorV1Schema.optional(),
  storybookImage: storybookImageObservationScopeV1Schema.optional(),
}).refine((input) => !input.storybookFrame || !input.storybookImage, 'Select one source for a storybook draft.');

function storybookError(code: string, status: number) {
  return json({ ok: false, sceneIntent: null, source: 'storybook', diagnostics: { parseError: code }, prefillSha256: null },
    { status, headers: { 'Cache-Control': 'private, no-store' } });
}

async function resolveStorybookPrefill(caseId: string, frame: z.infer<typeof storybookFrameLocatorV1Schema>) {
  const [item] = await db.select({ hash: evidence.hash, aiAnalysis: evidence.aiAnalysis })
    .from(evidence).where(and(eq(evidence.caseId, caseId), eq(evidence.id, frame.evidenceId), isNull(evidence.deletedAt))).limit(1);
  if (!item?.hash) return null;
  const sourceRevision = formatEvidenceSourceRevisionV1(item.hash);
  const root = item.aiAnalysis as { videoAnalysis?: unknown } | null;
  const coverage = buildVideoStorybookCoverageV1({ evidenceId: frame.evidenceId, caseId, sourceRevision, videoAnalysis: root?.videoAnalysis });
  return coverage ? buildStorybookFramePrefillV1(coverage, frame) : null;
}

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  if (!locals.user?.id) {
    // Auth-required, but degraded shape on auth fail too — keeps client
    // destructuring stable. Status 401 still signals the actual problem.
    return json(
      {
        ok: false,
        sceneIntent: buildDegradedFixture({}),
        source: 'fixture-degraded' as const,
        diagnostics: { durationMs: 0, model: 'unauthenticated', rawLength: 0,
                       parseError: 'unauthorized' },
      },
      { status: 401 },
    );
  }

  // Body parse + Zod validation. On invalid input return 400 + degraded.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        sceneIntent: buildDegradedFixture({}),
        source: 'fixture-degraded' as const,
        diagnostics: { durationMs: 0, model: 'no-input', rawLength: 0,
                       parseError: 'invalid JSON body' },
      },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        sceneIntent: buildDegradedFixture({}),
        source: 'fixture-degraded' as const,
        diagnostics: {
          durationMs: 0,
          model:      'no-input',
          rawLength:  0,
          parseError: parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        },
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  if (input.storybookFrame || input.storybookImage) {
    const { caseId, storybookFrame, storybookImage } = input;
    if (!caseId) return storybookError('Case is required for a storybook proposal.', 400);
    const actorId = Number(locals.user.id);
    if (!Number.isSafeInteger(actorId) || actorId <= 0) return storybookError('Unauthorized', 401);
    const resolveDraft = async () => {
      if (storybookImage) {
        const response = await fetch(`/api/evidence/${encodeURIComponent(storybookImage.evidenceId)}/multimodal-analysis`, {
          cache: 'no-store', redirect: 'error',
        });
        if (!response.ok) return null;
        const packet = buildStorybookImagePrefillV1(await response.json(), caseId, storybookImage);
        return packet && { packet, accepts: (intent: SceneIntent) => acceptsStorybookImageIntentV1(intent, packet) };
      }
      const packet = storybookFrame && await resolveStorybookPrefill(caseId, storybookFrame);
      return packet ? { packet, accepts: (intent: SceneIntent) => acceptsStorybookFrameIntentV1(intent, caseId, packet) } : null;
    };
    try {
      if (!await getAuthorizedCase(caseId, actorId)) return storybookError('Case not found.', 404);
      const resolved = await resolveDraft();
      if (!resolved) return storybookError('The selected source is stale or unavailable. Reload the chapter.', 409);
      const { packet, accepts } = resolved;
      if (!packet.observations.length) return storybookError('The selected source has no current observations to cite.', 422);
      const result = await extractSceneIntent({
        narrative: 'Draft a visual review storyboard. Describe the observations and questions the source leaves open.',
        caseId, evidenceIds: [packet.source.evidenceId],
        aestheticHint: input.aestheticHint, temperature: 0,
        ...(packet.schema === 'atlas.storybook-image-prefill.v1'
          ? { storybookImagePrefill: packet } : { storybookPrefill: JSON.stringify(packet) }) });
      if (!result.ok || !accepts(result.sceneIntent)) {
        return storybookError('The storyboard model did not return a proposal with valid observation citations.', 422);
      }
      if (!await getAuthorizedCase(caseId, actorId)) return storybookError('Case not found.', 404);
      const current = await resolveDraft();
      if (current?.packet.prefillSha256 !== packet.prefillSha256) return storybookError('The analysis changed while drafting. Reload the chapter.', 409);
      const cited = new Set(result.sceneIntent.events.flatMap((event) => event.citations.map((citation) =>
        citation.source === 'image_observation' ? citation.observation_id : undefined)));
      const spatialReviews = packet.schema === 'atlas.storybook-image-prefill.v1' ? packet.observations.flatMap((observation) =>
        (observation.kind === 'detection' || observation.kind === 'segmentation_mask') &&
        observation.reviewerDecision === 'ACCEPTED' && observation.reviewVersionId && cited.has(observation.observationId)
          ? [{ observationId: observation.observationId, versionId: observation.reviewVersionId, decision: 'ACCEPTED' as const }] : []) : [];
      return json({ ...result, prefillSha256: packet.prefillSha256, ...(spatialReviews.length ? { spatialReviews } : {}) },
        { headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
      return storybookError('The storyboard proposal could not be prepared.', 503);
    }
  }

  // Optional ACE retrieval. Lazy import so a failing ACE module never
  // blocks the route from booting (per current import-resilience pattern).
  let aceContext: string | undefined;
  if (input.useAce && input.caseId) {
    try {
      const ace = await import('$lib/server/ace/context-assembler.js');
      const ctx = await ace.assembleACEContext({
        query:   input.narrative.slice(0, 1000),
        userId:  locals.user.id,
        caseId:  input.caseId,
        maxTokens: 1500,
      });
      // Compact to ~1.5KB of plain prose so the extraction prompt stays small.
      const chunks = [...(ctx.kbChunks ?? []).slice(0, 3), ...(ctx.ragChunks ?? []).slice(0, 3)];
      aceContext = chunks
        .map((c, i) => `[${i + 1}] ${(c.content ?? '').slice(0, 240)}`)
        .filter((s) => s.length > 4)
        .join('\n');
      if (aceContext.length > 1800) aceContext = aceContext.slice(0, 1800);
    } catch (err) {
      // Non-fatal — fall back to extraction without ACE.
      aceContext = undefined;
    }
  }

  const result = await extractSceneIntent({
    narrative:     input.narrative,
    caseId:        input.caseId,
    evidenceIds:   input.evidenceIds,
    aceContext,
    aestheticHint: input.aestheticHint,
    model:         input.model,
    temperature:   input.temperature,
  });

  return json(result);
};

export const GET: RequestHandler = async () => {
  // Tiny GET: return the demo fixture so the 2D viewer can prove out the
  // schema without making any model call. Always status 200.
  return json({
    ok: true,
    sceneIntent: buildDegradedFixture({
      narrative: 'GET endpoint returns the degraded fixture for schema introspection.',
    }),
    source: 'fixture-degraded' as const,
    diagnostics: { durationMs: 0, model: 'fixture', rawLength: 0 },
  });
};
