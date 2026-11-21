import { createHash } from 'node:crypto';
import { SceneGenerationPlanV1BodySchema, SceneGenerationPlanV1Schema, type SceneGenerationPlanV1 } from '$lib/reconstruction/scene-generation-plan-v1.js';

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/** Parse and normalize a plan, then bind its complete canonical bytes with SHA-256. */
export function buildSceneGenerationPlanV1(input: unknown): SceneGenerationPlanV1 {
	const body = SceneGenerationPlanV1BodySchema.parse(input);
	const planHash = createHash('sha256').update(canonicalJson(body), 'utf8').digest('hex');
	return SceneGenerationPlanV1Schema.parse({ ...body, planHash });
}
