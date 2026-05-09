/**
 * scene-intent-prompt.ts
 *
 * The strict Gemma4 / Qwen extraction prompt. Produces JSON-only SceneIntent
 * matching scene-intent-schema.ts. The LLM never writes Blender, Three.js,
 * or WGSL — that boundary is what makes the reconstruction pipeline
 * legally auditable: same intent JSON → same render every time.
 *
 * Design rules baked into the prompt:
 *   - JSON only. No markdown, no prose, no code fences.
 *   - Allowed action enum is explicit so off-allowlist verbs get rejected
 *     by Zod (rather than silently mapped on the model side).
 *   - Confidence is required per-event so the viewer can render uncertainty.
 *   - Evidence IDs are required per-event so every animated beat traces
 *     back to a source artifact.
 *   - Disclaimer is fixed string.
 *   - Disputed and unknown facts must stay marked / unknown — no gap-filling.
 */
import { SCENE_INTENT_ACTION_ALLOWLIST } from './crime-scene-schema.js';

export const SCENE_INTENT_DISCLAIMER =
  'Demonstrative reconstruction — not original footage';

export const SCENE_INTENT_SYSTEM_PROMPT = `You are a legal scene-intent extraction model.

Your job:
Convert evidence-grounded case context into strict SceneIntent JSON.

You must output JSON only.

You must not write Blender code.
You must not write Three.js code.
You must not write WGSL code.
You must not invent facts.
You must not create photorealistic claims.
You must not create arbitrary animation names.
You must not create arbitrary asset paths.

Core rule:
The LLM writes intent.
The deterministic compiler writes render code.
The renderer renders.
The viewer annotates.

This is a demonstrative reconstruction, not original footage.

Every scene must include:
"${SCENE_INTENT_DISCLAIMER}"

Preserve uncertainty:
- high confidence only when evidence is strong
- medium confidence for partial support
- low confidence for weak or ambiguous support
- disputed facts must be marked disputed: true
- unknowns must remain unknown
- do not fill gaps with fictional details

Every event must include evidence_ids.
Every event must include confidence.
Every event must include disputed.
Every event must use an allowed action only.

Allowed actions:
${SCENE_INTENT_ACTION_ALLOWLIST.join(', ')}

Return valid JSON matching the SceneIntent schema.
No markdown.
No explanation.`;

/**
 * Build the user-side message with case context. Strips any markdown the
 * upstream might pass and quotes evidence ids verbatim.
 */
export function buildSceneIntentUserPrompt(input: {
  narrative:   string;
  caseId?:     string;
  evidenceIds?: string[];
  /** Optional: ACE-retrieved chunks summarized for the model. Each chunk
   *  should already include its evidence_id so the model can cite. */
  aceContext?: string;
  /** Optional aesthetic hint from the UI — model still picks the final value. */
  aestheticHint?: 'ps1' | 'n64' | 'modern-low-poly';
}): string {
  const lines: string[] = [];
  lines.push('# Case context');
  if (input.caseId) lines.push(`case_id: ${input.caseId}`);
  if (input.aestheticHint) lines.push(`aesthetic_hint: ${input.aestheticHint}`);
  lines.push('');
  lines.push('## Narrative');
  lines.push(input.narrative.trim());
  if (input.evidenceIds?.length) {
    lines.push('');
    lines.push('## Known evidence_ids');
    for (const id of input.evidenceIds) lines.push(`- ${id}`);
  }
  if (input.aceContext) {
    lines.push('');
    lines.push('## Retrieved context (ACE)');
    lines.push(input.aceContext.trim());
  }
  lines.push('');
  lines.push('# Output');
  lines.push(
    'Return one SceneIntent JSON object. Cite evidence_ids per event. ' +
    'Mark disputed/unknown facts honestly. Do not invent details. ' +
    'duration_s must be 1–60. Each event duration_s must be 0.1–30.',
  );
  return lines.join('\n');
}

/**
 * Lightweight grammar hint — appended to the system prompt when the model
 * supports it. Useful for Gemma4/Qwen to nudge JSON shape without a
 * full structured-output enforcement layer.
 */
export const SCENE_INTENT_SHAPE_HINT = `JSON shape (Zod-validated downstream):
{
  "scene_id":    "string",
  "case_id":     "string?",
  "title":      "string",
  "duration_s":  number,
  "aesthetic":  "ps1" | "n64" | "modern-low-poly",
  "environment": { "city": "string", "location"?: "string", "time_of_day"?: "...", "weather"?: "..." },
  "actors":      [ { "actor_id": "string", "role": "suspect|victim|witness|officer|unknown", "label": "string" } ],
  "events": [
    {
      "id":         "string",
      "time_s":     number,
      "duration_s": number,
      "who":        [ { "actor_id": "string", "role": "...", "label": "string" } ],
      "what":       "string",
      "why_hypothesis": "string?",
      "how":        "string",
      "action":     "<one of allowed actions>",
      "path":       [ { "t": number, "x": number, "y": number, "z": number } ],
      "evidence_ids": ["string"],
      "confidence": "high" | "medium" | "low",
      "disputed":   boolean,
      "annotations": [ { "t": number, "kind": "evidence_pin|uncertainty|note|trajectory", "text": "string", "evidence_id"?: "string" } ]
    }
  ],
  "evidence_links": [ { "evidence_id": "string", "label"?: "string", "anchor"?: [n,n,n], "status": "cited|placed|disputed" } ],
  "annotations":    [ { "t": 0, "kind": "note", "text": "string" } ],
  "disclaimer":     "${SCENE_INTENT_DISCLAIMER}"
}`;
