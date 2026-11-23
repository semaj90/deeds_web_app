/**
 * Parent Atlas Typed Scene Model Adapter & 8095/FastAPI Alignment (v1)
 *
 * Defines the typed interface for generative scene proposals and connects
 * to the live OAK/NLP sidecar on port 8095.
 *
 * Invariants:
 * - The returned proposed plan stays unknown until validated by Zod and case-authorized.
 * - Model proposals never establish real-world 3D coordinates, personal identities,
 *   or criminal culpability.
 * - Heavy or long-running work belongs to PostgreSQL analysis_jobs, not in-process background tasks.
 * - Privileged case material is strictly excluded from QLoRA training datasets.
 */

import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { SceneGenerationPlanV1Schema, type SceneGenerationPlanV1 } from '$lib/reconstruction/scene-generation-plan-v1.js';

// ============================================================================
// 1. Model Adapter Contract
// ============================================================================

export interface SceneModelInferInputV1 {
	prompt: string;
	ontologyRevision: string;
	allowedConceptIds: string[];
	sourceRefs: string[];
	maxOutputTokens: number;
}

export interface SceneModelInferResultV1 {
	proposedPlan: unknown;
	diagnostics: {
		latencyMs: number;
		inputTokenCount?: number;
		outputTokenCount?: number;
	};
}

export interface SceneModelAdapterV1 {
	readonly modelId: string;
	readonly modelRevision: string;
	infer(input: SceneModelInferInputV1): Promise<SceneModelInferResultV1>;
}

// ============================================================================
// 2. FastAPI / 8095 Sidecar Adapter Implementation
// ============================================================================

export class FastApiOakSceneModelAdapterV1 implements SceneModelAdapterV1 {
	readonly modelId = 'gemma4-legal-iq4xs-direct';
	readonly modelRevision = 'atlas.nlp-sidecar-8095.v1';

	constructor(
		private readonly baseUrl: string = ENV.LANGEXTRACT_BASE_URL ?? 'http://127.0.0.1:8095',
		private readonly timeoutMs: number = 10_000
	) {}

	async infer(input: SceneModelInferInputV1): Promise<SceneModelInferResultV1> {
		const start = performance.now();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			// Query the 8095 sidecar for concept normalization / entity proposal
			const response = await fetch(`${this.baseUrl}/extract`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: input.prompt,
					options: {
						allowed_concepts: input.allowedConceptIds,
						ontology_revision: input.ontologyRevision,
						source_refs: input.sourceRefs
					}
				}),
				signal: controller.signal
			});

			const latencyMs = Math.round(performance.now() - start);

			if (!response.ok) {
				// Graceful fail-closed proposal fallback
				return {
					proposedPlan: null,
					diagnostics: { latencyMs }
				};
			}

			const payload = await response.json();

			return {
				proposedPlan: payload.scene_proposal ?? payload,
				diagnostics: {
					latencyMs,
					inputTokenCount: payload.input_tokens,
					outputTokenCount: payload.output_tokens
				}
			};
		} catch (error) {
			const latencyMs = Math.round(performance.now() - start);
			return {
				proposedPlan: null,
				diagnostics: { latencyMs }
			};
		} finally {
			clearTimeout(timer);
		}
	}
}

// ============================================================================
// 3. Validated Scene Plan Admission Gate
// ============================================================================

export interface ValidateModelPlanResultV1 {
	valid: boolean;
	plan?: SceneGenerationPlanV1;
	error?: string;
}

/**
 * Admits an unknown model proposal only if it strictly matches SceneGenerationPlanV1Schema.
 */
export function validateProposedScenePlanV1(rawPlan: unknown): ValidateModelPlanResultV1 {
	if (!rawPlan || typeof rawPlan !== 'object') {
		return { valid: false, error: 'PROPOSED_PLAN_NOT_AN_OBJECT' };
	}

	const parsed = SceneGenerationPlanV1Schema.safeParse(rawPlan);
	if (!parsed.success) {
		return {
			valid: false,
			error: `SCHEMA_VALIDATION_FAILED: ${parsed.error.issues[0]?.message ?? 'invalid structure'}`
		};
	}

	// Invariant: Model outputs must not claim measured status without human review
	const plan = parsed.data;
	if (plan.environment.coordinateStatus === 'calibrated_metric') {
		return { valid: false, error: 'UNVERIFIED_MODEL_OUTPUT_CANNOT_CLAIM_CALIBRATED_COORDINATES' };
	}

	return {
		valid: true,
		plan
	};
}

// ============================================================================
// 4. QLoRA Training Dataset Contract
// ============================================================================

export const scenePlanQloraExampleV1Schema = z.object({
	schema: z.literal('parent-atlas.qlora-scene-example.v1'),
	exampleId: z.string().uuid(),
	prompt: z.string().min(1).max(2000),
	supervisionTarget: SceneGenerationPlanV1Schema,
	allowedConcepts: z.array(z.string()).min(1),
	evaluationSplit: z.enum(['train', 'validation', 'test']),
	dataLineage: z.object({
		datasetRevision: z.string().min(1),
		rightsStatus: z.enum(['PERMITTED_SYNTHETIC', 'AUTHORIZED_BENCHMARK']),
		containsPrivilegedCaseData: z.literal(false) // Hard block on privileged leakage
	}).strict()
}).strict();

export type ScenePlanQloraExampleV1 = z.infer<typeof scenePlanQloraExampleV1Schema>;
