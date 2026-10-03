import { z } from 'zod';
import {
	buildContextManifestV2,
	ContextManifestV2Schema,
	type ContextManifestV2,
} from '../graph/context-manifest-v2.js';

const sha256Prefixed = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const nonEmptyText = z.string().trim().min(1);

export const DspyRepairOutputV1Schema = z.object({
	schema: z.literal('atlas.dspy-repair-output.v1'),
	contextManifestChecksum: sha256Prefixed,
	diagnosis: nonEmptyText,
	targetCandidates: z.array(nonEmptyText).min(1),
	patchPlan: nonEmptyText,
	validationPlan: nonEmptyText,
	evidenceRefs: z.array(nonEmptyText).min(1),
}).strict();

export type DspyRepairOutputV1 = z.infer<typeof DspyRepairOutputV1Schema>;

/**
 * Parse a structured DSPy proposal against an already-admitted ContextManifest.
 * This is an application admission boundary only: it does not call DSPy,
 * authorize edits, or make proposal text canonical evidence.
 */
export function parseDspyRepairOutputV1(
	raw: string | unknown,
	manifestInput: ContextManifestV2,
): DspyRepairOutputV1 {
	const manifest = ContextManifestV2Schema.parse(manifestInput);
	const recomputedManifest = buildContextManifestV2(manifest.v1, manifest.identityInput);
	if (recomputedManifest.identityChecksum !== manifest.identityChecksum) {
		throw new Error('CONTEXT_MANIFEST_IDENTITY_CHECKSUM_INVALID');
	}
	let decoded: unknown = raw;
	if (typeof raw === 'string') {
		try {
			decoded = JSON.parse(raw) as unknown;
		} catch {
			throw new Error('DSPY_REPAIR_OUTPUT_INVALID_JSON');
		}
	}

	const parsed = DspyRepairOutputV1Schema.parse(decoded);
	const expectedChecksum = `sha256:${manifest.identityChecksum}`;
	if (parsed.contextManifestChecksum !== expectedChecksum) {
		throw new Error('CONTEXT_MANIFEST_CHECKSUM_MISMATCH');
	}

	const allowedEvidence = new Set(manifest.v1.evidenceRefs.map((ref) => ref.trim()));
	const allowedTargets = new Set(manifest.v1.selectedNodeKeys.map((key) => key.trim()));
	if (allowedEvidence.size !== manifest.v1.evidenceRefs.length || allowedEvidence.has('')) {
		throw new Error('CONTEXT_MANIFEST_EVIDENCE_ALLOWLIST_INVALID');
	}
	if (allowedTargets.size !== manifest.v1.selectedNodeKeys.length || allowedTargets.has('')) {
		throw new Error('CONTEXT_MANIFEST_TARGET_ALLOWLIST_INVALID');
	}

	const targets = parsed.targetCandidates.map((target) => target.trim());
	if (new Set(targets).size !== targets.length) {
		throw new Error('DUPLICATE_TARGET_ID');
	}
	const unauthorizedTarget = targets.find((target) => !allowedTargets.has(target));
	if (unauthorizedTarget !== undefined) {
		throw new Error(`UNAUTHORIZED_TARGET_ID:${unauthorizedTarget}`);
	}

	const evidenceRefs = parsed.evidenceRefs.map((ref) => ref.trim());
	if (new Set(evidenceRefs).size !== evidenceRefs.length) {
		throw new Error('DUPLICATE_EVIDENCE_REF');
	}
	const unauthorizedEvidence = evidenceRefs.find((ref) => !allowedEvidence.has(ref));
	if (unauthorizedEvidence !== undefined) {
		throw new Error(`UNAUTHORIZED_EVIDENCE_REF:${unauthorizedEvidence}`);
	}

	return {
		...parsed,
		diagnosis: parsed.diagnosis.trim(),
		targetCandidates: targets,
		patchPlan: parsed.patchPlan.trim(),
		validationPlan: parsed.validationPlan.trim(),
		evidenceRefs: [...evidenceRefs].sort(),
	};
}
