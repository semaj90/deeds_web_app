import { z } from 'zod';
import {
	evidenceCanvasCommandV1Schema,
	getRecentEvidenceCanvasCommandsV1,
	publishEvidenceCanvasCommandV1
} from '../evidence/evidence-canvas-command-bus-v1.js';
import {
	DEFAULT_SCENE_CUT_HAMMING_THRESHOLD_V1,
	computeFrameDhash64V1,
	searchKeyframesByBitsetTopKV1,
	selectSceneCutKeyframesV1,
	sliceRawGray9x8StreamV1
} from '../evidence/video/dhash-keyframe-filter-v1.js';
import {
	DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1,
	RawWindowUtteranceV1Schema,
	buildTownHallSimulationProposalsV1,
	checkModelLicenseAdmissionV1,
	planLongformMediaPartitionsV1,
	reconcileOverlappingUtteranceWindowsV1
} from '../evidence/video/longform-video-speaker-ledger-v1.js';

export type EvidenceCanvasDhashMcpToolName =
	| 'evidence:canvas_command'
	| 'evidence:dhash_hamming_search'
	| 'evidence:longform_video_town_hall';

const canvasCommandMcpInputSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('publish'),
		evidenceId: z.string().trim().min(1).max(128),
		command: evidenceCanvasCommandV1Schema
	}).strict(),
	z.object({
		action: z.literal('list_recent'),
		evidenceId: z.string().trim().min(1).max(128),
		limit: z.number().int().min(1).max(100).default(20)
	}).strict()
]);

const dhashFrameInputSchema = z.object({
	mode: z.literal('dhash_frame'),
	gray9x8Base64: z.string().min(1).optional(),
	gray9x8Bytes: z.array(z.number().int().min(0).max(255)).optional()
}).strict();

const sceneCutsInputSchema = z.object({
	mode: z.literal('scene_cuts'),
	rawGray9x8Base64: z.string().min(1).optional(),
	rawGray9x8Bytes: z.array(z.number().int().min(0).max(255)).optional(),
	intervalMs: z.number().finite().positive().default(1000),
	minHammingDistance: z
		.number()
		.int()
		.min(0)
		.max(64)
		.default(DEFAULT_SCENE_CUT_HAMMING_THRESHOLD_V1)
}).strict();

const bitsetTopKInputSchema = z.object({
	mode: z.literal('bitset_top_k'),
	queryWordsLeBase64: z.string().min(1).optional(),
	queryWordsHex: z.array(z.string().regex(/^(?:0x)?[0-9a-fA-F]{1,16}$/)).min(1).optional(),
	corpusFlatWordsLeBase64: z.string().min(1).optional(),
	corpusFlatWordsHex: z.array(z.string().regex(/^(?:0x)?[0-9a-fA-F]{1,16}$/)).optional(),
	wordsPerVec: z.number().int().min(1).max(1023).default(1),
	topK: z.number().int().min(1).max(1000).default(5)
}).strict();

const dhashHammingSearchMcpInputSchema = z.discriminatedUnion('mode', [
	dhashFrameInputSchema,
	sceneCutsInputSchema,
	bitsetTopKInputSchema
]);

const longformVideoTownHallMcpInputSchema = z.discriminatedUnion('mode', [
	z.object({
		mode: z.literal('default_stack')
	}).strict(),
	z.object({
		mode: z.literal('plan_partitions'),
		evidenceId: z.string().uuid(),
		sourceSha256: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/i),
		durationMs: z.number().int().positive().max(86_400_000),
		partitionDurationMs: z.number().int().positive().optional(),
		audioWindowMs: z.number().int().positive().optional(),
		overlapMs: z.number().int().min(0).optional()
	}).strict(),
	z.object({
		mode: z.literal('reconcile_windows'),
		utterances: z.array(RawWindowUtteranceV1Schema)
	}).strict(),
	z.object({
		mode: z.literal('build_town_hall_proposals'),
		extraction: z.unknown()
	}).strict()
]);

export interface EvidenceCanvasDhashMcpToolDefinition {
	name: EvidenceCanvasDhashMcpToolName;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface EvidenceCanvasDhashMcpToolResult {
	ok: boolean;
	tool: EvidenceCanvasDhashMcpToolName;
	data?: Record<string, unknown>;
	error?: string;
}

export const EVIDENCE_CANVAS_DHASH_MCP_TOOL_DEFINITIONS: readonly EvidenceCanvasDhashMcpToolDefinition[] = [
	{
		name: 'evidence:canvas_command',
		description:
			'Publish a validated markup/navigation command onto an evidence item SSE canvas stream (evidence.add_pin, evidence.add_rect, evidence.add_arrow, evidence.add_text, video.seek_keyframe, evidence.clear_markup) or list recent commands.',
		inputSchema: {
			type: 'object',
			properties: {
				action: {
					type: 'string',
					enum: ['publish', 'list_recent'],
					default: 'publish'
				},
				evidenceId: {
					type: 'string',
					description: 'Target evidence UUID or identifier.'
				},
				command: {
					type: 'object',
					description: 'Validated EvidenceCanvasCommandV1 payload (required when action=publish).'
				},
				limit: {
					type: 'integer',
					minimum: 1,
					maximum: 100,
					default: 20
				}
			},
			required: ['evidenceId']
		}
	},
	{
		name: 'evidence:dhash_hamming_search',
		description:
			'Execute 64-bit dHash computation (dhash_frame), FFmpeg 9x8 raw grayscale stream scene-cut deduplication (scene_cuts), or turbovec-napi SIMD POPCNT Hamming Top-K search (bitset_top_k).',
		inputSchema: {
			type: 'object',
			properties: {
				mode: {
					type: 'string',
					enum: ['dhash_frame', 'scene_cuts', 'bitset_top_k']
				},
				gray9x8Base64: { type: 'string' },
				gray9x8Bytes: { type: 'array', items: { type: 'integer' } },
				rawGray9x8Base64: { type: 'string' },
				rawGray9x8Bytes: { type: 'array', items: { type: 'integer' } },
				intervalMs: { type: 'number', default: 1000 },
				minHammingDistance: { type: 'integer', minimum: 0, maximum: 64, default: 12 },
				queryWordsLeBase64: { type: 'string' },
				queryWordsHex: { type: 'array', items: { type: 'string' } },
				corpusFlatWordsLeBase64: { type: 'string' },
				corpusFlatWordsHex: { type: 'array', items: { type: 'string' } },
				wordsPerVec: { type: 'integer', minimum: 1, maximum: 1023, default: 1 },
				topK: { type: 'integer', minimum: 1, maximum: 1000, default: 5 }
			},
			required: ['mode']
		}
	},
	{
		name: 'evidence:longform_video_town_hall',
		description:
			'Return the default Apache-2.0/MIT permissive model stack (default_stack), plan 4-hour 15-min/30-sec media partitions (plan_partitions), reconcile overlapping window utterances (reconcile_windows), or build Town Hall simulation proposals (build_town_hall_proposals).',
		inputSchema: {
			type: 'object',
			properties: {
				mode: {
					type: 'string',
					enum: [
						'default_stack',
						'plan_partitions',
						'reconcile_windows',
						'build_town_hall_proposals'
					]
				},
				evidenceId: { type: 'string' },
				sourceSha256: { type: 'string' },
				durationMs: { type: 'integer' },
				partitionDurationMs: { type: 'integer' },
				audioWindowMs: { type: 'integer' },
				overlapMs: { type: 'integer' },
				utterances: { type: 'array', items: { type: 'object' } },
				extraction: { type: 'object' }
			},
			required: ['mode']
		}
	}
] as const;

export function isEvidenceCanvasDhashMcpToolName(
	name: string
): name is EvidenceCanvasDhashMcpToolName {
	return (
		name === 'evidence:canvas_command' ||
		name === 'evidence:dhash_hamming_search' ||
		name === 'evidence:longform_video_town_hall'
	);
}

function decodeBytesInput(base64?: string, bytes?: number[]): Uint8Array {
	if (base64 !== undefined) {
		return new Uint8Array(Buffer.from(base64, 'base64'));
	}
	if (bytes !== undefined) {
		return Uint8Array.from(bytes);
	}
	throw new Error('MISSING_GRAY9X8_BYTE_INPUT');
}

function decodeU64WordsLeInput(leBase64?: string, hexWords?: string[]): Uint8Array {
	if (leBase64 !== undefined) {
		return new Uint8Array(Buffer.from(leBase64, 'base64'));
	}
	if (hexWords !== undefined) {
		const out = new Uint8Array(hexWords.length * 8);
		const view = new DataView(out.buffer);
		for (let i = 0; i < hexWords.length; i += 1) {
			const raw = hexWords[i].startsWith('0x') ? hexWords[i] : `0x${hexWords[i]}`;
			view.setBigUint64(i * 8, BigInt(raw), true);
		}
		return out;
	}
	throw new Error('MISSING_BITSET_WORDS_INPUT');
}

export async function handleEvidenceCanvasDhashMcpToolCall(
	name: EvidenceCanvasDhashMcpToolName,
	rawArgs: Record<string, unknown> = {}
): Promise<EvidenceCanvasDhashMcpToolResult> {
	try {
		if (name === 'evidence:canvas_command') {
			const normalized = {
				action: rawArgs.action ?? 'publish',
				...rawArgs
			};
			const parsed = canvasCommandMcpInputSchema.safeParse(normalized);
			if (!parsed.success) {
				return {
					ok: false,
					tool: name,
					error: parsed.error.issues[0]?.message ?? 'Invalid canvas command input'
				};
			}

			if (parsed.data.action === 'list_recent') {
				const all = getRecentEvidenceCanvasCommandsV1(parsed.data.evidenceId);
				const recent = all.slice(-parsed.data.limit);
				return {
					ok: true,
					tool: name,
					data: {
						evidenceId: parsed.data.evidenceId,
						count: recent.length,
						commands: recent
					}
				};
			}

			const envelope = publishEvidenceCanvasCommandV1(
				parsed.data.evidenceId,
				parsed.data.command
			);
			return {
				ok: true,
				tool: name,
				data: {
					envelope
				}
			};
		}

		if (name === 'evidence:longform_video_town_hall') {
			const parsed = longformVideoTownHallMcpInputSchema.safeParse(rawArgs);
			if (!parsed.success) {
				return {
					ok: false,
					tool: name,
					error: parsed.error.issues[0]?.message ?? 'Invalid longform video / Town Hall input'
				};
			}

			const input = parsed.data;
			if (input.mode === 'default_stack') {
				const entries = Object.entries(DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1).map(
					([stage, modelId]) => {
						const check = checkModelLicenseAdmissionV1({
							modelId,
							purpose: 'factual_evidence'
						});
						return {
							stage,
							modelId,
							admitted: check.ok,
							license: check.entry?.license ?? null,
							requiresAttribution: check.entry?.requiresAttribution ?? null
						};
					}
				);
				return {
					ok: true,
					tool: name,
					data: {
						mode: 'default_stack',
						stack: DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1,
						entries,
						canonicalAuthority: false,
						writesPerformed: false
					}
				};
			}

			if (input.mode === 'plan_partitions') {
				const plan = planLongformMediaPartitionsV1({
					evidenceId: input.evidenceId,
					sourceSha256: input.sourceSha256,
					durationMs: input.durationMs,
					...(input.partitionDurationMs !== undefined
						? { partitionDurationMs: input.partitionDurationMs }
						: {}),
					...(input.audioWindowMs !== undefined ? { audioWindowMs: input.audioWindowMs } : {}),
					...(input.overlapMs !== undefined ? { overlapMs: input.overlapMs } : {})
				});
				return {
					ok: true,
					tool: name,
					data: {
						mode: 'plan_partitions',
						...plan
					}
				};
			}

			if (input.mode === 'reconcile_windows') {
				const utterances = reconcileOverlappingUtteranceWindowsV1(input.utterances);
				return {
					ok: true,
					tool: name,
					data: {
						mode: 'reconcile_windows',
						count: utterances.length,
						utterances,
						canonicalAuthority: false,
						writesPerformed: false
					}
				};
			}

			const proposalsResult = buildTownHallSimulationProposalsV1(input.extraction);
			if (!proposalsResult.ok) {
				return {
					ok: false,
					tool: name,
					error: proposalsResult.errors.join('; ')
				};
			}
			return {
				ok: true,
				tool: name,
				data: {
					mode: 'build_town_hall_proposals',
					...proposalsResult
				}
			};
		}

		const parsed = dhashHammingSearchMcpInputSchema.safeParse(rawArgs);
		if (!parsed.success) {
			return {
				ok: false,
				tool: name,
				error: parsed.error.issues[0]?.message ?? 'Invalid dHash/Hamming search input'
			};
		}

		const input = parsed.data;
		if (input.mode === 'dhash_frame') {
			const gray9x8 = decodeBytesInput(input.gray9x8Base64, input.gray9x8Bytes);
			const result = computeFrameDhash64V1(gray9x8);
			return {
				ok: true,
				tool: name,
				data: {
					mode: 'dhash_frame',
					dhashHex: result.dhashHex,
					engine: result.engine
				}
			};
		}

		if (input.mode === 'scene_cuts') {
			const rawBytes = decodeBytesInput(input.rawGray9x8Base64, input.rawGray9x8Bytes);
			const candidates = sliceRawGray9x8StreamV1(rawBytes, { intervalMs: input.intervalMs });
			const result = selectSceneCutKeyframesV1(candidates, {
				minHammingDistance: input.minHammingDistance
			});
			return {
				ok: true,
				tool: name,
				data: {
					mode: 'scene_cuts',
					engine: result.engine,
					candidateCount: candidates.length,
					keyframeCount: result.keyframes.length,
					keyframes: result.keyframes.map((kf) => ({
						frameIndex: kf.frameIndex,
						timestampMs: kf.timestampMs,
						dhashHex: kf.dhashHex,
						hammingFromPrev: kf.hammingFromPrev
					})),
					corpusWordsLeBase64: Buffer.from(result.corpusWordsLe).toString('base64')
				}
			};
		}

		const queryLe = decodeU64WordsLeInput(input.queryWordsLeBase64, input.queryWordsHex);
		const corpusLe = decodeU64WordsLeInput(
			input.corpusFlatWordsLeBase64,
			input.corpusFlatWordsHex
		);
		const matches = searchKeyframesByBitsetTopKV1(
			queryLe,
			corpusLe,
			input.wordsPerVec,
			input.topK
		);
		return {
			ok: true,
			tool: name,
			data: {
				mode: 'bitset_top_k',
				wordsPerVec: input.wordsPerVec,
				topK: input.topK,
				matches
			}
		};
	} catch (error) {
		return {
			ok: false,
			tool: name,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
