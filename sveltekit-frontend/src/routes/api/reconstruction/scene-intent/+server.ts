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
  /** Optional override; defaults to gemma4-rotorquant:latest in the extractor. */
  model:         z.string().min(1).max(100).optional(),
  temperature:   z.number().min(0).max(1.5).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
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
