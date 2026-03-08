/**
 * Legal Reasoning Chain — 4-Step Sequential Analysis
 *
 * Generates a structured legal reasoning chain through 4 sequential LLM calls:
 *   1. Foundational Framework — Applicable legal framework identification
 *   2. Fact Pattern Analysis — Facts → framework mapping with strength scores
 *   3. Precedent Hierarchy — Supporting/opposing case assessment
 *   4. Policy Considerations — Policy-level implications and broader context
 *
 * Each step produces:
 *   - analysis: string
 *   - strengthScore: number [0, 1]
 *   - vulnerabilities: string[]
 *   - counterarguments: string[]
 *
 * Usage:
 *   const chain = await generateReasoningChain({
 *     summary: "Employment discrimination case...",
 *     keyFacts: ["Plaintiff terminated after FMLA request"],
 *     charges: ["Title VII violation"],
 *     jurisdiction: "Federal - 9th Circuit"
 *   });
 */

import { generateCompletion } from '$lib/server/ai/ollama-client.js';

export interface ReasoningStepInput {
	summary: string;
	keyFacts?: string[];
	charges?: string[];
	jurisdiction?: string;
}

export interface ReasoningStep {
	name: string;
	analysis: string;
	strengthScore: number;
	vulnerabilities: string[];
	counterarguments: string[];
	durationMs: number;
}

export interface ReasoningChainResult {
	steps: ReasoningStep[];
	overallConfidence: number;
	totalDurationMs: number;
}

const MODEL = 'gemma3-legal:latest';
const TIMEOUT_MS = 60_000;

function buildStepPrompt(stepName: string, context: string): string {
	return `Analyze the following legal case from the perspective of "${stepName}".

${context}

Respond ONLY with valid JSON:
{
  "analysis": "Your detailed analysis (2-4 paragraphs)",
  "strengthScore": 0.75,
  "vulnerabilities": ["Vulnerability 1", "Vulnerability 2"],
  "counterarguments": ["Counterargument 1"]
}`;
}

function parseStepResponse(raw: string): Omit<ReasoningStep, 'name' | 'durationMs'> | null {
	try {
		const parsed = JSON.parse(raw);
		return {
			analysis: parsed.analysis ?? '',
			strengthScore: Math.max(0, Math.min(1, parsed.strengthScore ?? 0.5)),
			vulnerabilities: Array.isArray(parsed.vulnerabilities) ? parsed.vulnerabilities : [],
			counterarguments: Array.isArray(parsed.counterarguments) ? parsed.counterarguments : []
		};
	} catch {
		// Try JSON extraction from mixed content
		const start = raw.indexOf('{');
		const end = raw.lastIndexOf('}');
		if (start !== -1 && end > start) {
			try {
				const parsed = JSON.parse(raw.slice(start, end + 1));
				return {
					analysis: parsed.analysis ?? '',
					strengthScore: Math.max(0, Math.min(1, parsed.strengthScore ?? 0.5)),
					vulnerabilities: Array.isArray(parsed.vulnerabilities) ? parsed.vulnerabilities : [],
					counterarguments: Array.isArray(parsed.counterarguments) ? parsed.counterarguments : []
				};
			} catch {
				return null;
			}
		}
		return null;
	}
}

function buildContext(input: ReasoningStepInput, priorSteps: ReasoningStep[]): string {
	const parts: string[] = [];
	parts.push(`Case Summary: ${input.summary}`);
	if (input.keyFacts?.length) parts.push(`Key Facts:\n- ${input.keyFacts.join('\n- ')}`);
	if (input.charges?.length) parts.push(`Charges: ${input.charges.join(', ')}`);
	if (input.jurisdiction) parts.push(`Jurisdiction: ${input.jurisdiction}`);

	if (priorSteps.length > 0) {
		parts.push('\n--- Prior Analysis Steps ---');
		for (const step of priorSteps) {
			parts.push(`[${step.name}] (Strength: ${(step.strengthScore * 100).toFixed(0)}%): ${step.analysis.slice(0, 300)}...`);
		}
	}

	return parts.join('\n\n');
}

const STEP_DEFINITIONS = [
	{
		name: 'Foundational Framework',
		systemPrompt: 'You are a legal analyst identifying the applicable legal framework. Determine which statutes, regulations, common law principles, and constitutional provisions apply. Identify the burden of proof and standards of review.'
	},
	{
		name: 'Fact Pattern Analysis',
		systemPrompt: 'You are a legal analyst mapping facts to the legal framework. For each key fact, assess whether it supports or weakens the legal theory. Identify gaps in the factual record and what additional evidence would strengthen the case.'
	},
	{
		name: 'Precedent Hierarchy',
		systemPrompt: 'You are a legal analyst assessing case precedent. Identify the most relevant supporting and opposing precedent. Rank precedent by jurisdiction authority (binding vs persuasive) and factual similarity. Note any circuit splits or evolving doctrine.'
	},
	{
		name: 'Policy Considerations',
		systemPrompt: 'You are a legal analyst evaluating policy implications. Consider the broader policy goals of the applicable law, potential unintended consequences of the legal theory, and how the case fits within larger legal trends. Assess jury/judge receptivity.'
	}
];

/**
 * Generate a 4-step legal reasoning chain
 * Each step builds on prior analysis for deeper reasoning
 */
export async function generateReasoningChain(
	input: ReasoningStepInput
): Promise<ReasoningChainResult> {
	const steps: ReasoningStep[] = [];
	const overallStart = Date.now();

	for (const stepDef of STEP_DEFINITIONS) {
		const stepStart = Date.now();
		const context = buildContext(input, steps);
		const prompt = buildStepPrompt(stepDef.name, context);

		try {
			const result = await generateCompletion({
				prompt,
				model: MODEL,
				systemPrompt: stepDef.systemPrompt,
				temperature: 0.3,
				maxTokens: 2048,
				timeoutMs: TIMEOUT_MS
			});

			const parsed = parseStepResponse(result.response);
			const durationMs = Date.now() - stepStart;

			if (parsed) {
				steps.push({ name: stepDef.name, ...parsed, durationMs });
			} else {
				// Fallback: use raw response as analysis
				steps.push({
					name: stepDef.name,
					analysis: result.response.slice(0, 2000),
					strengthScore: 0.5,
					vulnerabilities: ['Could not parse structured response'],
					counterarguments: [],
					durationMs
				});
			}
		} catch (err) {
			const durationMs = Date.now() - stepStart;
			console.error(`[reasoning-chain] Step "${stepDef.name}" failed:`, err);
			steps.push({
				name: stepDef.name,
				analysis: `Analysis unavailable: ${err instanceof Error ? err.message : 'Unknown error'}`,
				strengthScore: 0,
				vulnerabilities: ['Step failed — LLM unavailable'],
				counterarguments: [],
				durationMs
			});
		}
	}

	// Overall confidence = weighted average of step scores (later steps weighted more)
	const weights = [0.15, 0.25, 0.30, 0.30];
	let overallConfidence = 0;
	for (let i = 0; i < steps.length && i < weights.length; i++) {
		overallConfidence += weights[i] * steps[i].strengthScore;
	}

	return {
		steps,
		overallConfidence,
		totalDurationMs: Date.now() - overallStart
	};
}
