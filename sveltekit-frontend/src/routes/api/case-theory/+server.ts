/**
 * POST /api/case-theory
 * Generate a structured case theory plan using Ollama LLM
 *
 * Called by: CaseTheoryConstructor.svelte, ContextualEvidenceChatModal.svelte
 * Returns: { success, plan: CaseTheoryPlan, raw? }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { CaseTheoryRequestPayload, CaseTheoryPlan } from '$lib/types/case-theory.js';
import { generateCompletion } from '$lib/server/ai/ollama-client.js';
import { requireAuth } from '$lib/server/auth-helpers.js';

const SYSTEM_PROMPT = `You are a senior legal strategist. Given case facts, charges, and evidence, produce a structured case theory plan as JSON.

Output ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "masterTheory": "One-sentence core theory of the case",
  "prosecutionFrame": "How the prosecution frames the narrative",
  "supportingPillars": [{ "title": "...", "summary": "...", "proofPoints": ["..."] }],
  "themes": ["Theme 1", "Theme 2"],
  "storyBeats": [{ "phase": "Opening|Discovery|Trial|Closing", "objective": "...", "leverage": "...", "proof": ["..."] }],
  "evidencePlan": [{ "id": "ev-1", "title": "...", "usage": "...", "admissibility": "..." }],
  "witnessPlan": [{ "name": "...", "role": "...", "purpose": "...", "hooks": ["..."] }],
  "riskMatrix": [{ "risk": "...", "severity": "low|medium|high", "mitigation": "..." }],
  "defenseCounters": ["Counter 1"],
  "actionItems": ["Action 1"],
  "deliverables": { "closingOutline": "...", "storyAngles": "...", "juryFocus": "...", "investigativeGaps": "...", "pressTalkingPoints": "..." }
}`;

function buildUserPrompt(payload: CaseTheoryRequestPayload): string {
	const parts: string[] = [];

	parts.push(`Case Summary: ${payload.summary}`);

	if (payload.caseName) parts.push(`Case Name: ${payload.caseName}`);
	if (payload.prosecutionGoals) parts.push(`Prosecution Goals: ${payload.prosecutionGoals}`);
	if (payload.charges?.length) parts.push(`Charges: ${payload.charges.join(', ')}`);
	if (payload.keyFacts?.length) parts.push(`Key Facts:\n- ${payload.keyFacts.join('\n- ')}`);
	if (payload.contestedFacts?.length) parts.push(`Contested Facts:\n- ${payload.contestedFacts.join('\n- ')}`);
	if (payload.defenseAngles?.length) parts.push(`Known Defense Angles:\n- ${payload.defenseAngles.join('\n- ')}`);
	if (payload.narrativeBeats?.length) parts.push(`Narrative Beats:\n- ${payload.narrativeBeats.join('\n- ')}`);
	if (payload.keyEvidence?.length) {
		const evidenceList = payload.keyEvidence.map(e => `${e.label}${e.purpose ? ` (${e.purpose})` : ''}`);
		parts.push(`Key Evidence:\n- ${evidenceList.join('\n- ')}`);
	}
	if (payload.witnessProfiles?.length) {
		const witnessList = payload.witnessProfiles.map(w => `${w.name}${w.angle ? ` — ${w.angle}` : ''}`);
		parts.push(`Witnesses:\n- ${witnessList.join('\n- ')}`);
	}
	if (payload.legalIssues?.length) parts.push(`Legal Issues:\n- ${payload.legalIssues.join('\n- ')}`);
	if (payload.tone) parts.push(`Tone: ${payload.tone}`);
	if (payload.preferredAudience) parts.push(`Audience: ${payload.preferredAudience}`);
	if (payload.deliverables?.length) parts.push(`Requested Deliverables: ${payload.deliverables.join(', ')}`);

	return parts.join('\n\n');
}

function extractJSON(text: string): CaseTheoryPlan | null {
	// Try direct parse first
	try {
		return JSON.parse(text) as CaseTheoryPlan;
	} catch {
		// Find JSON object boundaries
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
		if (start !== -1 && end > start) {
			try {
				return JSON.parse(text.slice(start, end + 1)) as CaseTheoryPlan;
			} catch {
				return null;
			}
		}
		return null;
	}
}

export const POST: RequestHandler = async (event) => {
	await requireAuth(event);
	const startTime = Date.now();

	try {
		const payload = (await event.request.json()) as CaseTheoryRequestPayload;

		if (!payload.summary || payload.summary.trim().length < 10) {
			return json(
				{ success: false, error: 'Case summary is required (minimum 10 characters)' },
				{ status: 400 }
			);
		}

		const userPrompt = buildUserPrompt(payload);

		console.log(`[case-theory] Generating theory for case: ${payload.caseName || payload.caseId || 'unnamed'}`);

		const result = await generateCompletion({
			prompt: userPrompt,
			model: 'gemma3-legal:latest',
			systemPrompt: SYSTEM_PROMPT,
			temperature: 0.4,
			maxTokens: 4096,
			timeoutMs: 90_000
		});

		const raw = result.response;
		const plan = extractJSON(raw);

		if (!plan) {
			console.error('[case-theory] Failed to parse LLM response as JSON');
			return json(
				{ success: false, error: 'AI response was not valid JSON. Please try again.', raw },
				{ status: 422 }
			);
		}

		// Ensure required fields have defaults
		plan.supportingPillars ??= [];
		plan.themes ??= [];
		plan.storyBeats ??= [];
		plan.evidencePlan ??= [];
		plan.witnessPlan ??= [];
		plan.riskMatrix ??= [];
		plan.defenseCounters ??= [];
		plan.actionItems ??= [];
		plan.deliverables ??= {};

		const processingTime = Date.now() - startTime;
		console.log(`[case-theory] Generated in ${processingTime}ms`);

		return json({
			success: true,
			plan,
			raw,
			metadata: {
				timestamp: new Date().toISOString(),
				processingTime,
				model: 'gemma3-legal:latest'
			}
		});
	} catch (err) {
		console.error('[case-theory] Error:', err);
		const message = err instanceof Error ? err.message : String(err);
		return json(
			{ success: false, error: `Case theory generation failed: ${message}` },
			{ status: 500 }
		);
	}
};
