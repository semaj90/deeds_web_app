/**
 * scene-intent-extractor.ts
 *
 * Calls Gemma4 (via bifrostChat → Bifrost L2 + L1 Redis exact-match cache,
 * falling back to direct Ollama) and validates the response against
 * SceneIntentSchema. Always returns a SceneIntent — on parse / model
 * failure it returns a degraded fixture so the caller never has to handle
 * `null`. This matches the Degraded Response Contract in CLAUDE.md.
 *
 * No tool calling here — pure JSON extraction. The 3-tier cache on top
 * of bifrostChat means re-running the same narrative is sub-second.
 */
import { z } from 'zod';
import {
  SceneIntentSchema,
  type SceneIntent,
  SCENE_INTENT_ACTION_ALLOWLIST,
} from './crime-scene-schema.js';
import {
  SCENE_INTENT_SYSTEM_PROMPT,
  SCENE_INTENT_SHAPE_HINT,
  SCENE_INTENT_DISCLAIMER,
  buildSceneIntentUserPrompt,
} from './scene-intent-prompt.js';
import { bifrostChat } from '$lib/server/ollama.js';

export interface SceneIntentExtractInput {
  narrative:     string;
  caseId?:       string;
  evidenceIds?:  string[];
  aceContext?:   string;
  aestheticHint?: 'ps1' | 'n64' | 'modern-low-poly';
  model?:        string;     // default: gemma4-legal-vlm
  temperature?:  number;     // default: 0.2 — deterministic intent extraction
}

export interface SceneIntentExtractResult {
  ok:          boolean;
  sceneIntent: SceneIntent;
  source:      'llm' | 'fixture-degraded';
  diagnostics: {
    durationMs:   number;
    model:        string;
    rawLength:    number;
    parseError?:  string;
    rawPreview?:  string;   // first 240 chars for debugging
  };
}

/** Strip any code-fence noise the model might still emit despite "JSON only". */
function stripJsonFences(s: string): string {
  let out = s.trim();
  // ```json … ``` or ``` … ```
  const fence = out.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) out = fence[1];
  // Some models prepend a single line of prose. If we see a leading '{'
  // anywhere, slice from there.
  const firstBrace = out.indexOf('{');
  const lastBrace  = out.lastIndexOf('}');
  if (firstBrace > 0 && lastBrace > firstBrace) {
    out = out.slice(firstBrace, lastBrace + 1);
  }
  return out;
}

/**
 * Hand-crafted minimal SceneIntent used when:
 *   - the LLM returns malformed JSON
 *   - Zod validation fails
 *   - the upstream model is unreachable
 *
 * The fixture is intentionally minimal but schema-valid: one actor, one
 * event, low confidence, disclaimer present. This lets the API surface
 * stay stable (clients can always destructure top-level keys) without
 * pretending we extracted real intent.
 */
export function buildDegradedFixture(input: {
  narrative?: string;
  caseId?:    string;
}): SceneIntent {
  const narrative = (input.narrative ?? '').trim().slice(0, 280);
  const fallbackTitle = narrative
    ? `Reconstruction (degraded) — ${narrative.slice(0, 60)}`
    : 'Reconstruction (degraded — extractor unavailable)';
  return {
    scene_id:   `degraded-${Date.now().toString(36)}`,
    case_id:    input.caseId,
    title:      fallbackTitle,
    duration_s: 8,
    aesthetic:  'ps1',
    environment: {
      city:  'unspecified',
      notes: 'Extraction failed or upstream model unreachable — degraded fixture returned.',
    },
    actors: [
      { actor_id: 'unknown-1', role: 'unknown', label: 'Unknown actor' },
    ],
    events: [
      {
        id:           'evt-degraded-1',
        time_s:       0,
        duration_s:   4,
        who:          [{ actor_id: 'unknown-1', role: 'unknown', label: 'Unknown actor' }],
        what:         narrative || 'Narrative not provided.',
        how:          'Insufficient evidence to reconstruct.',
        action:       'idle',
        path:         [],
        evidence_ids: [],
        confidence:   'low',
        disputed:     false,
        annotations:  [
          { t: 0, kind: 'uncertainty', text: 'Degraded fixture — re-run extraction with valid case context.' },
        ],
      },
    ],
    evidence_links: [],
    annotations:    [
      { t: 0, kind: 'note', text: 'Extraction degraded. This is not a model-generated reconstruction.' },
    ],
    disclaimer:     SCENE_INTENT_DISCLAIMER,
  };
}

/**
 * Extract SceneIntent from narrative + optional ACE context. Always
 * returns a result — never throws. Falls back to a minimal fixture on
 * any failure path.
 */
export async function extractSceneIntent(
  input: SceneIntentExtractInput,
): Promise<SceneIntentExtractResult> {
  const startedAt = Date.now();
  const model = input.model ?? 'gemma4-legal-vlm:latest';

  const messages = [
    { role: 'system' as const, content: `${SCENE_INTENT_SYSTEM_PROMPT}\n\n${SCENE_INTENT_SHAPE_HINT}` },
    { role: 'user'   as const, content: buildSceneIntentUserPrompt(input) },
  ];

  let raw = '';
  try {
    raw = await bifrostChat(messages, model, {
      temperature: input.temperature ?? 0.2,
      maxTokens:   2048,
      taskType:    'scene-intent-extraction',
    }) as string;
  } catch (err) {
    return {
      ok: false,
      sceneIntent: buildDegradedFixture({ narrative: input.narrative, caseId: input.caseId }),
      source: 'fixture-degraded',
      diagnostics: {
        durationMs: Date.now() - startedAt,
        model,
        rawLength:  0,
        parseError: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const cleaned = stripJsonFences(raw);

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      sceneIntent: buildDegradedFixture({ narrative: input.narrative, caseId: input.caseId }),
      source: 'fixture-degraded',
      diagnostics: {
        durationMs: Date.now() - startedAt,
        model,
        rawLength:  raw.length,
        parseError: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
        rawPreview: raw.slice(0, 240),
      },
    };
  }

  const validated = SceneIntentSchema.safeParse(parsedUnknown);
  if (!validated.success) {
    return {
      ok: false,
      sceneIntent: buildDegradedFixture({ narrative: input.narrative, caseId: input.caseId }),
      source: 'fixture-degraded',
      diagnostics: {
        durationMs: Date.now() - startedAt,
        model,
        rawLength:  raw.length,
        parseError: `Zod validation failed: ${validated.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
        rawPreview: raw.slice(0, 240),
      },
    };
  }

  // Final guards: action allowlist is enforced by Zod, but double-check
  // every event because off-allowlist values would have been caught above
  // and the failure would already have routed to degraded.
  const intent = validated.data;
  for (const ev of intent.events) {
    if (!SCENE_INTENT_ACTION_ALLOWLIST.includes(ev.action)) {
      // Unreachable in practice (Zod enum gate), but defensive.
      return {
        ok: false,
        sceneIntent: buildDegradedFixture({ narrative: input.narrative, caseId: input.caseId }),
        source: 'fixture-degraded',
        diagnostics: {
          durationMs: Date.now() - startedAt,
          model,
          rawLength:  raw.length,
          parseError: `Defense-in-depth: action '${ev.action}' not in allowlist`,
        },
      };
    }
  }

  // Force-correct the disclaimer in case the model paraphrased it.
  if (intent.disclaimer !== SCENE_INTENT_DISCLAIMER) {
    intent.disclaimer = SCENE_INTENT_DISCLAIMER;
  }

  return {
    ok: true,
    sceneIntent: intent,
    source: 'llm',
    diagnostics: {
      durationMs: Date.now() - startedAt,
      model,
      rawLength:  raw.length,
    },
  };
}
