import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import { ATLAS_ROOT_NAMESPACE_V1 } from '../../atlas/identity/atlas-uuid-namespaces-v1.js';

const PROPOSAL_NAMESPACE = uuidv5('atlas.longform-town-hall-proposal.v1', ATLAS_ROOT_NAMESPACE_V1);

export type LongformPipelineStageV1 =
	| 'perception'
	| 'reasoning'
	| 'ocr'
	| 'depth'
	| 'segmentation'
	| 'asr'
	| 'alignment'
	| 'vad'
	| 'diarization'
	| 'synthetic_art';

export interface LongformModelLicenseEntryV1 {
	modelId: string;
	license: 'Apache-2.0' | 'MIT' | 'BSD-2-Clause' | 'CC-BY-4.0' | 'CC-BY-NC-4.0';
	commercialAllowed: boolean;
	requiresAttribution: boolean;
	stage: LongformPipelineStageV1;
	excludedFromFactualEvidence: boolean;
	notes: string;
}

export const LONGFORM_MODEL_LICENSE_REGISTRY_V1: Readonly<Record<string, LongformModelLicenseEntryV1>> = {
	'google/gemma-4-e2b': {
		modelId: 'google/gemma-4-e2b',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'perception',
		excludedFromFactualEvidence: false,
		notes: 'Multimodal perception (audio/visual/text) and QLoRA candidate.'
	},
	'google/gemma-4-e4b': {
		modelId: 'google/gemma-4-e4b',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'perception',
		excludedFromFactualEvidence: false,
		notes: 'Larger Gemma 4 perception variant.'
	},
	'ornith-1.5-9b': {
		modelId: 'ornith-1.5-9b',
		license: 'MIT',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'reasoning',
		excludedFromFactualEvidence: false,
		notes: 'Active synthesis/reasoning model; current HF model card lists MIT.'
	},
	'ibm-granite/granite-vision-3.3-2b': {
		modelId: 'ibm-granite/granite-vision-3.3-2b',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'ocr',
		excludedFromFactualEvidence: false,
		notes: 'Verified compact vision checkpoint for screenshots, tables, and OCR.'
	},
	'depth-anything/Depth-Anything-V2-Small-hf': {
		modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'depth',
		excludedFromFactualEvidence: false,
		notes: 'Only Small checkpoint is Apache-2.0; Base/Large/Giant are CC-BY-NC-4.0.'
	},
	'depth-anything/Depth-Anything-V2-Base-hf': {
		modelId: 'depth-anything/Depth-Anything-V2-Base-hf',
		license: 'CC-BY-NC-4.0',
		commercialAllowed: false,
		requiresAttribution: true,
		stage: 'depth',
		excludedFromFactualEvidence: false,
		notes: 'Non-commercial checkpoint; blocked for commercial Apache-2.0 deployment.'
	},
	'depth-anything/Depth-Anything-V2-Large-hf': {
		modelId: 'depth-anything/Depth-Anything-V2-Large-hf',
		license: 'CC-BY-NC-4.0',
		commercialAllowed: false,
		requiresAttribution: true,
		stage: 'depth',
		excludedFromFactualEvidence: false,
		notes: 'Non-commercial checkpoint; blocked for commercial Apache-2.0 deployment.'
	},
	'depth-anything/Depth-Anything-V2-Giant-hf': {
		modelId: 'depth-anything/Depth-Anything-V2-Giant-hf',
		license: 'CC-BY-NC-4.0',
		commercialAllowed: false,
		requiresAttribution: true,
		stage: 'depth',
		excludedFromFactualEvidence: false,
		notes: 'Non-commercial checkpoint; blocked for commercial Apache-2.0 deployment.'
	},
	'facebook/sam-vit-base': {
		modelId: 'facebook/sam-vit-base',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'segmentation',
		excludedFromFactualEvidence: false,
		notes: 'Original SAM segmentation masks.'
	},
	'facebook/sam2.1-hiera-small': {
		modelId: 'facebook/sam2.1-hiera-small',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'segmentation',
		excludedFromFactualEvidence: false,
		notes: 'Video object segmentation tracking.'
	},
	'facebook/sam3.1': {
		modelId: 'facebook/sam3.1',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'segmentation',
		excludedFromFactualEvidence: false,
		notes: 'Text-prompted mask tracking; object tracks never prove real identity.'
	},
	'Systran/faster-whisper-large-v3': {
		modelId: 'Systran/faster-whisper-large-v3',
		license: 'MIT',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'asr',
		excludedFromFactualEvidence: false,
		notes: 'CTranslate2 Whisper ASR.'
	},
	'm-bain/whisperX': {
		modelId: 'm-bain/whisperX',
		license: 'BSD-2-Clause',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'alignment',
		excludedFromFactualEvidence: false,
		notes: 'Forced phoneme word-level alignment.'
	},
	'snakers4/silero-vad': {
		modelId: 'snakers4/silero-vad',
		license: 'MIT',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'vad',
		excludedFromFactualEvidence: false,
		notes: 'Voice activity detection segmentation.'
	},
	'pyannote/speaker-diarization-community-1': {
		modelId: 'pyannote/speaker-diarization-community-1',
		license: 'CC-BY-4.0',
		commercialAllowed: true,
		requiresAttribution: true,
		stage: 'diarization',
		excludedFromFactualEvidence: false,
		notes: 'Commercial use permitted with attribution; pyannote.audio SDK itself is MIT.'
	},
	'wespeaker/wespeaker-voxceleb-resnet34-LM': {
		modelId: 'wespeaker/wespeaker-voxceleb-resnet34-LM',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'diarization',
		excludedFromFactualEvidence: false,
		notes: 'Apache-2.0 speaker embedding extractor without CC-BY attribution obligation.'
	},
	'speechbrain/spkrec-ecapa-voxceleb': {
		modelId: 'speechbrain/spkrec-ecapa-voxceleb',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'diarization',
		excludedFromFactualEvidence: false,
		notes: 'Apache-2.0 ECAPA-TDNN speaker embedding extractor.'
	},
	'nvidia/diar_sortformer_4spk-v1': {
		modelId: 'nvidia/diar_sortformer_4spk-v1',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'diarization',
		excludedFromFactualEvidence: false,
		notes: 'NeMo diarization model (NVIDIA Open Model License / Apache-2.0 code base).'
	},
	'chitra-tiny-212m': {
		modelId: 'chitra-tiny-212m',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'synthetic_art',
		excludedFromFactualEvidence: true,
		notes: 'Synthetic scene experimentation only; excluded from factual evidence extraction.'
	},
	'segmind/SSD-1B': {
		modelId: 'segmind/SSD-1B',
		license: 'Apache-2.0',
		commercialAllowed: true,
		requiresAttribution: false,
		stage: 'synthetic_art',
		excludedFromFactualEvidence: true,
		notes: 'Synthetic artwork only; excluded from factual evidence extraction.'
	}
};

export const DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1 = {
	perception: 'google/gemma-4-e2b', // Apache-2.0
	reasoning: 'ornith-1.5-9b', // MIT
	ocr: 'ibm-granite/granite-vision-3.3-2b', // Apache-2.0
	depth: 'depth-anything/Depth-Anything-V2-Small-hf', // Apache-2.0
	segmentation: 'facebook/sam2.1-hiera-small', // Apache-2.0
	vad: 'snakers4/silero-vad', // MIT
	asr: 'Systran/faster-whisper-large-v3', // MIT
	alignment: 'm-bain/whisperX', // BSD-2-Clause
	diarization: 'wespeaker/wespeaker-voxceleb-resnet34-LM' // Apache-2.0
} as const;

export function checkModelLicenseAdmissionV1(input: {
	modelId: string;
	claimedLicense?: LongformModelLicenseEntryV1['license'];
	purpose: 'factual_evidence' | 'synthetic_art';
	allowCcByAttribution?: boolean;
}):
	| { ok: true; entry: LongformModelLicenseEntryV1 }
	| {
			ok: false;
			reason:
				| 'MODEL_PROVENANCE_UNVERIFIED'
				| 'MODEL_LICENSE_CLAIM_MISMATCH'
				| 'NON_COMMERCIAL_LICENSE_BLOCKED'
				| 'CC_BY_ATTRIBUTION_LICENSE_DISALLOWED_BY_DEFAULT'
				| 'SYNTHETIC_IMAGE_MODEL_EXCLUDED_FROM_EVIDENCE';
			entry?: LongformModelLicenseEntryV1;
	  } {
	const entry = LONGFORM_MODEL_LICENSE_REGISTRY_V1[input.modelId];
	if (!entry) {
		return { ok: false, reason: 'MODEL_PROVENANCE_UNVERIFIED' };
	}
	if (input.claimedLicense && entry.license !== input.claimedLicense) {
		return { ok: false, reason: 'MODEL_LICENSE_CLAIM_MISMATCH', entry };
	}
	if (!entry.commercialAllowed) {
		return { ok: false, reason: 'NON_COMMERCIAL_LICENSE_BLOCKED', entry };
	}
	if (entry.requiresAttribution && !input.allowCcByAttribution) {
		return {
			ok: false,
			reason: 'CC_BY_ATTRIBUTION_LICENSE_DISALLOWED_BY_DEFAULT',
			entry
		};
	}
	if (input.purpose === 'factual_evidence' && entry.excludedFromFactualEvidence) {
		return { ok: false, reason: 'SYNTHETIC_IMAGE_MODEL_EXCLUDED_FROM_EVIDENCE', entry };
	}
	return { ok: true, entry };
}

const partitionPlannerInputSchema = z
	.object({
		evidenceId: z.string().uuid(),
		sourceSha256: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/i),
		durationMs: z.number().int().positive().max(86_400_000),
		partitionDurationMs: z.number().int().positive().default(900_000),
		audioWindowMs: z.number().int().positive().default(30_000),
		overlapMs: z.number().int().min(0).default(2_000)
	})
	.strict()
	.superRefine((val, ctx) => {
		if (val.overlapMs >= val.audioWindowMs) {
			ctx.addIssue({
				code: 'custom',
				path: ['overlapMs'],
				message: 'OVERLAP_MUST_BE_LESS_THAN_AUDIO_WINDOW'
			});
		}
	});

export interface LongformMediaPartitionV1 {
	partitionIndex: number;
	partitionId: string;
	startMs: number;
	endMs: number;
}

export interface LongformAudioWindowV1 {
	windowIndex: number;
	partitionIndex: number;
	coreStartMs: number;
	coreEndMs: number;
	decodeStartMs: number;
	decodeEndMs: number;
	crossesPartitionBoundary: boolean;
}

export interface LongformMediaPartitionPlanV1 {
	schema: 'atlas.longform-media-partition-plan.v1';
	evidenceId: string;
	sourceSha256: string;
	durationMs: number;
	partitionDurationMs: number;
	audioWindowMs: number;
	overlapMs: number;
	partitionCount: number;
	baselineWindowCount: number;
	partitions: LongformMediaPartitionV1[];
	audioWindows: LongformAudioWindowV1[];
	canonicalAuthority: false;
	writesPerformed: false;
}

export function planLongformMediaPartitionsV1(
	input: z.input<typeof partitionPlannerInputSchema>
): LongformMediaPartitionPlanV1 {
	const parsed = partitionPlannerInputSchema.parse(input);
	const normalizedSha = parsed.sourceSha256.toLowerCase().startsWith('sha256:')
		? parsed.sourceSha256.toLowerCase()
		: `sha256:${parsed.sourceSha256.toLowerCase()}`;

	const partitions: LongformMediaPartitionV1[] = [];
	for (
		let startMs = 0, idx = 0;
		startMs < parsed.durationMs;
		startMs += parsed.partitionDurationMs, idx += 1
	) {
		const endMs = Math.min(parsed.durationMs, startMs + parsed.partitionDurationMs);
		partitions.push({
			partitionIndex: idx,
			partitionId: `part_${String(idx).padStart(4, '0')}`,
			startMs,
			endMs
		});
	}

	const audioWindows: LongformAudioWindowV1[] = [];
	for (
		let coreStartMs = 0, wIdx = 0;
		coreStartMs < parsed.durationMs;
		coreStartMs += parsed.audioWindowMs, wIdx += 1
	) {
		const coreEndMs = Math.min(parsed.durationMs, coreStartMs + parsed.audioWindowMs);
		const partitionIndex = Math.floor(coreStartMs / parsed.partitionDurationMs);
		const decodeStartMs = Math.max(0, coreStartMs - (coreStartMs > 0 ? parsed.overlapMs : 0));
		const decodeEndMs = Math.min(
			parsed.durationMs,
			coreEndMs + (coreEndMs < parsed.durationMs ? parsed.overlapMs : 0)
		);
		const startPart = Math.floor(decodeStartMs / parsed.partitionDurationMs);
		const endPart = Math.floor(Math.max(0, decodeEndMs - 1) / parsed.partitionDurationMs);
		audioWindows.push({
			windowIndex: wIdx,
			partitionIndex,
			coreStartMs,
			coreEndMs,
			decodeStartMs,
			decodeEndMs,
			crossesPartitionBoundary: startPart !== endPart
		});
	}

	return {
		schema: 'atlas.longform-media-partition-plan.v1',
		evidenceId: parsed.evidenceId,
		sourceSha256: normalizedSha,
		durationMs: parsed.durationMs,
		partitionDurationMs: parsed.partitionDurationMs,
		audioWindowMs: parsed.audioWindowMs,
		overlapMs: parsed.overlapMs,
		partitionCount: partitions.length,
		baselineWindowCount: audioWindows.length,
		partitions,
		audioWindows,
		canonicalAuthority: false,
		writesPerformed: false
	};
}

export const SlmTaskLabelV1Schema = z.enum([
	'observation',
	'claim',
	'action_request',
	'question',
	'decision',
	'commitment',
	'disagreement',
	'recommendation',
	'unresolved'
]);

export type SlmTaskLabelV1 = z.infer<typeof SlmTaskLabelV1Schema>;

export const RawWindowUtteranceV1Schema = z
	.object({
		windowIndex: z.number().int().nonnegative(),
		speaker_id: z.string().regex(/^spk_[a-z0-9_]+$/),
		start_ms: z.number().int().nonnegative(),
		end_ms: z.number().int().positive(),
		text: z.string().trim().min(1),
		source_segment_ids: z.array(z.string().min(1)).min(1),
		claim_label: SlmTaskLabelV1Schema.optional()
	})
	.strict()
	.refine((u) => u.start_ms < u.end_ms, { message: 'UTTERANCE_START_MUST_PRECEDE_END' });

const rawWindowUtteranceSchema = RawWindowUtteranceV1Schema;

export interface ReconciledUtteranceV1 {
	speaker_id: string;
	start_ms: number;
	end_ms: number;
	text: string;
	source_segment_ids: string[];
	claim_label?: SlmTaskLabelV1;
}

function normalizeUtteranceText(text: string): string {
	return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function reconcileOverlappingUtteranceWindowsV1(
	rawUtterances: readonly z.input<typeof rawWindowUtteranceSchema>[]
): ReconciledUtteranceV1[] {
	const parsed = z.array(rawWindowUtteranceSchema).parse(rawUtterances);
	const sorted = [...parsed].sort(
		(a, b) =>
			a.start_ms - b.start_ms ||
			a.end_ms - b.end_ms ||
			a.speaker_id.localeCompare(b.speaker_id) ||
			a.windowIndex - b.windowIndex
	);

	const merged: ReconciledUtteranceV1[] = [];
	for (const curr of sorted) {
		const currNorm = normalizeUtteranceText(curr.text);
		const match = merged.find((existing) => {
			if (existing.speaker_id !== curr.speaker_id) return false;
			const overlaps = curr.start_ms < existing.end_ms && curr.end_ms > existing.start_ms;
			if (!overlaps) return false;
			const existingNorm = normalizeUtteranceText(existing.text);
			return (
				existingNorm === currNorm ||
				existingNorm.includes(currNorm) ||
				currNorm.includes(existingNorm)
			);
		});

		if (match) {
			match.start_ms = Math.min(match.start_ms, curr.start_ms);
			match.end_ms = Math.max(match.end_ms, curr.end_ms);
			if (curr.text.trim().length > match.text.trim().length) {
				match.text = curr.text.trim();
			}
			const segSet = new Set([...match.source_segment_ids, ...curr.source_segment_ids]);
			match.source_segment_ids = [...segSet].sort();
			if (!match.claim_label && curr.claim_label) {
				match.claim_label = curr.claim_label;
			}
		} else {
			merged.push({
				speaker_id: curr.speaker_id,
				start_ms: curr.start_ms,
				end_ms: curr.end_ms,
				text: curr.text.trim(),
				source_segment_ids: [...new Set(curr.source_segment_ids)].sort(),
				...(curr.claim_label ? { claim_label: curr.claim_label } : {})
			});
		}
	}

	return merged;
}

export const LongformVideoExtractionV1Schema = z
	.object({
		source: z
			.object({
				evidence_id: z.string().uuid(),
				sha256: z.string().min(8),
				duration_ms: z.number().int().positive().max(86_400_000)
			})
			.strict(),
		speakers: z
			.array(
				z
					.object({
						speaker_id: z.string().regex(/^spk_[a-z0-9_]+$/),
						identity: z.null(),
						identity_status: z.literal('unverified')
					})
					.strict()
			)
			.min(1),
		utterances: z
			.array(
				z
					.object({
						speaker_id: z.string().regex(/^spk_[a-z0-9_]+$/),
						start_ms: z.number().int().nonnegative(),
						end_ms: z.number().int().positive(),
						text: z.string().trim().min(1),
						source_segment_ids: z.array(z.string().min(1)).min(1),
						claim_label: SlmTaskLabelV1Schema.optional()
					})
					.strict()
			)
			.min(1),
		summary: z
			.object({
				sentences: z.array(z.string().trim().min(1)).min(1).max(3),
				source_segment_ids: z.array(z.string().min(1)).min(1)
			})
			.strict(),
		recommendations: z.array(
			z
				.object({
					action: z.string().trim().min(1),
					status: z.enum(['proposed', 'reported_approved', 'unverified', 'unanswered']),
					priority: z.enum(['requires_review', 'low', 'medium', 'high']),
					estimated_budget_usd: z.number().nonnegative().finite().optional(),
					approved_budget_usd: z.null().optional(),
					proposed_by_speaker_id: z.string().regex(/^spk_[a-z0-9_]+$/).optional(),
					source_segment_ids: z.array(z.string().min(1)).min(1)
				})
				.strict()
		)
	})
	.strict()
	.superRefine((doc, ctx) => {
		const speakerIds = new Set<string>();
		doc.speakers.forEach((speaker, idx) => {
			if (speakerIds.has(speaker.speaker_id)) {
				ctx.addIssue({
					code: 'custom',
					path: ['speakers', idx, 'speaker_id'],
					message: 'DUPLICATE_SPEAKER_ID'
				});
			}
			speakerIds.add(speaker.speaker_id);
		});

		const knownSegmentIds = new Set<string>();
		doc.utterances.forEach((utterance, idx) => {
			if (!speakerIds.has(utterance.speaker_id)) {
				ctx.addIssue({
					code: 'custom',
					path: ['utterances', idx, 'speaker_id'],
					message: `UNKNOWN_SPEAKER_REF:${utterance.speaker_id}`
				});
			}
			if (utterance.start_ms >= utterance.end_ms) {
				ctx.addIssue({
					code: 'custom',
					path: ['utterances', idx, 'start_ms'],
					message: 'UTTERANCE_START_MUST_PRECEDE_END'
				});
			}
			if (utterance.end_ms > doc.source.duration_ms) {
				ctx.addIssue({
					code: 'custom',
					path: ['utterances', idx, 'end_ms'],
					message: 'UTTERANCE_EXCEEDS_SOURCE_DURATION'
				});
			}
			for (const segId of utterance.source_segment_ids) {
				knownSegmentIds.add(segId);
			}
		});

		doc.summary.source_segment_ids.forEach((segId, idx) => {
			if (!knownSegmentIds.has(segId)) {
				ctx.addIssue({
					code: 'custom',
					path: ['summary', 'source_segment_ids', idx],
					message: `UNKNOWN_SUMMARY_SEGMENT_REF:${segId}`
				});
			}
		});

		doc.recommendations.forEach((rec, recIdx) => {
			if (rec.proposed_by_speaker_id && !speakerIds.has(rec.proposed_by_speaker_id)) {
				ctx.addIssue({
					code: 'custom',
					path: ['recommendations', recIdx, 'proposed_by_speaker_id'],
					message: `UNKNOWN_SPEAKER_REF:${rec.proposed_by_speaker_id}`
				});
			}
			rec.source_segment_ids.forEach((segId, segIdx) => {
				if (!knownSegmentIds.has(segId)) {
					ctx.addIssue({
						code: 'custom',
						path: ['recommendations', recIdx, 'source_segment_ids', segIdx],
						message: `UNKNOWN_RECOMMENDATION_SEGMENT_REF:${segId}`
					});
				}
			});
		});
	});

export type LongformVideoExtractionV1 = z.infer<typeof LongformVideoExtractionV1Schema>;

export function validateLongformVideoExtractionV1(input: unknown):
	| {
			ok: true;
			data: LongformVideoExtractionV1;
			canonicalAuthority: false;
			writesPerformed: false;
	  }
	| {
			ok: false;
			errors: string[];
			canonicalAuthority: false;
			writesPerformed: false;
	  } {
	const parsed = LongformVideoExtractionV1Schema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map(
				(issue) => `${issue.path.join('.') || 'root'}:${issue.message}`
			),
			canonicalAuthority: false,
			writesPerformed: false
		};
	}
	return {
		ok: true,
		data: parsed.data,
		canonicalAuthority: false,
		writesPerformed: false
	};
}

export type TownHallBuildingV1 = 'TOWN_HALL' | 'PUBLIC_WORKS' | 'TREASURY' | 'ARCHIVE';

export interface TownHallProposalV1 {
	proposalId: string;
	evidenceId: string;
	arenaSlotIndex: number;
	townHallBuilding: TownHallBuildingV1;
	citizenSpeakerId: string;
	action: string;
	claimStatus: LongformVideoExtractionV1['recommendations'][number]['status'];
	priority: LongformVideoExtractionV1['recommendations'][number]['priority'];
	sourceTimestampRangeMs: [number, number];
	sourceSegmentIds: string[];
	simulatedBudgetRangeUsd: [number, number];
	estimatedBudgetUsd: number;
	approvedBudgetUsd: null;
	fsmState: 'HOLD_FOR_HUMAN_REVIEW';
	allowedSimulationDecisions: readonly [
		'HOLD_FOR_HUMAN_REVIEW',
		'SIMULATE_APPROVAL',
		'SIMULATE_REJECTION'
	];
	canonicalAuthority: false;
	writesPerformed: false;
}

function classifyTownHallBuilding(
	action: string,
	estimatedBudgetUsd?: number
): TownHallBuildingV1 {
	const lower = action.toLowerCase();
	if (
		estimatedBudgetUsd !== undefined ||
		/\b(budget|quote|cost|estimate|fund|allocat)\b/.test(lower)
	) {
		return 'TREASURY';
	}
	if (/\b(inspect|repair|gate|entrance|maintenance|fix|clear)\b/.test(lower)) {
		return 'PUBLIC_WORKS';
	}
	if (/\b(document|photograph|record|archive|evidence|transcript)\b/.test(lower)) {
		return 'ARCHIVE';
	}
	return 'TOWN_HALL';
}

export function buildTownHallSimulationProposalsV1(
	extractionInput: unknown
): {
	schema: 'atlas.town-hall-simulation-proposals.v1';
	ok: boolean;
	errors: string[];
	proposals: TownHallProposalV1[];
	canonicalAuthority: false;
	writesPerformed: false;
} {
	const validated = validateLongformVideoExtractionV1(extractionInput);
	if ('errors' in validated) {
		return {
			schema: 'atlas.town-hall-simulation-proposals.v1',
			ok: false,
			errors: validated.errors,
			proposals: [],
			canonicalAuthority: false,
			writesPerformed: false
		};
	}

	const { data } = validated;
	if (data.recommendations.length > 256) {
		return {
			schema: 'atlas.town-hall-simulation-proposals.v1',
			ok: false,
			errors: ['RECOMMENDATION_COUNT_EXCEEDS_256_ARENA_SLOTS'],
			proposals: [],
			canonicalAuthority: false,
			writesPerformed: false
		};
	}

	const proposals: TownHallProposalV1[] = data.recommendations.map((rec, index) => {
		const citedSegSet = new Set(rec.source_segment_ids);
		const matchingUtterances = data.utterances.filter((u) =>
			u.source_segment_ids.some((segId) => citedSegSet.has(segId))
		);

		const minStart = matchingUtterances.reduce(
			(min, u) => Math.min(min, u.start_ms),
			matchingUtterances[0]?.start_ms ?? 0
		);
		const maxEnd = matchingUtterances.reduce(
			(max, u) => Math.max(max, u.end_ms),
			matchingUtterances[0]?.end_ms ?? 0
		);
		const citizenSpeakerId =
			rec.proposed_by_speaker_id ?? matchingUtterances[0]?.speaker_id ?? data.speakers[0].speaker_id;

		return {
			proposalId: uuidv5(
				`${data.source.evidence_id}\u0000${index}\u0000${rec.action}`,
				PROPOSAL_NAMESPACE
			),
			evidenceId: data.source.evidence_id,
			arenaSlotIndex: index,
			townHallBuilding: classifyTownHallBuilding(rec.action, rec.estimated_budget_usd),
			citizenSpeakerId,
			action: rec.action,
			claimStatus: rec.status,
			priority: rec.priority,
			sourceTimestampRangeMs: [minStart, maxEnd],
			sourceSegmentIds: [...rec.source_segment_ids],
			simulatedBudgetRangeUsd: [0, 2000],
			estimatedBudgetUsd: rec.estimated_budget_usd ?? 0,
			approvedBudgetUsd: null,
			fsmState: 'HOLD_FOR_HUMAN_REVIEW',
			allowedSimulationDecisions: [
				'HOLD_FOR_HUMAN_REVIEW',
				'SIMULATE_APPROVAL',
				'SIMULATE_REJECTION'
			],
			canonicalAuthority: false,
			writesPerformed: false
		};
	});

	return {
		schema: 'atlas.town-hall-simulation-proposals.v1',
		ok: true,
		errors: [],
		proposals,
		canonicalAuthority: false,
		writesPerformed: false
	};
}
