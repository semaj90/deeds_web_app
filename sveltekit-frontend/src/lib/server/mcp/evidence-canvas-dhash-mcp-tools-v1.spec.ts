// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearEvidenceCanvasCommandsForTestV1,
	subscribeEvidenceCanvasCommandsV1
} from '../evidence/evidence-canvas-command-bus-v1.js';
import {
	EVIDENCE_CANVAS_DHASH_MCP_TOOL_DEFINITIONS,
	handleEvidenceCanvasDhashMcpToolCall,
	isEvidenceCanvasDhashMcpToolName
} from './evidence-canvas-dhash-mcp-tools-v1.js';

function makeFlatFrame(value = 10): Uint8Array {
	return new Uint8Array(72).fill(value);
}

function makeHorizontalRampFrame(): Uint8Array {
	const buf = new Uint8Array(72);
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 9; col += 1) {
			buf[row * 9 + col] = col * 16;
		}
	}
	return buf;
}

describe('evidence-canvas-dhash-mcp-tools-v1', () => {
	beforeEach(() => {
		clearEvidenceCanvasCommandsForTestV1();
	});

	it('exposes all MCP tool definitions and matches tool name guard', () => {
		expect(EVIDENCE_CANVAS_DHASH_MCP_TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
			'evidence:canvas_command',
			'evidence:dhash_hamming_search',
			'evidence:longform_video_town_hall'
		]);
		expect(isEvidenceCanvasDhashMcpToolName('evidence:canvas_command')).toBe(true);
		expect(isEvidenceCanvasDhashMcpToolName('evidence:dhash_hamming_search')).toBe(true);
		expect(isEvidenceCanvasDhashMcpToolName('evidence:longform_video_town_hall')).toBe(true);
		expect(isEvidenceCanvasDhashMcpToolName('other:tool')).toBe(false);
	});

	it('publishes validated canvas commands to SSE subscribers, lists recent items, and rejects bad geometry', async () => {
		const seen: Array<{ sequence: number; command: string }> = [];
		const unsubscribe = subscribeEvidenceCanvasCommandsV1('ev-100', (env) => {
			seen.push({ sequence: env.sequence, command: env.command.command });
		});

		try {
			const pub1 = await handleEvidenceCanvasDhashMcpToolCall('evidence:canvas_command', {
				evidenceId: 'ev-100',
				command: {
					command: 'evidence.add_rect',
					x: 0.1,
					y: 0.2,
					width: 0.3,
					height: 0.4,
					label: 'Exhibit A'
				}
			});
			expect(pub1.ok).toBe(true);
			expect(seen).toEqual([{ sequence: 1, command: 'evidence.add_rect' }]);

			const pub2 = await handleEvidenceCanvasDhashMcpToolCall('evidence:canvas_command', {
				action: 'publish',
				evidenceId: 'ev-100',
				command: {
					command: 'video.seek_keyframe',
					timestampMs: 12000,
					dhashHex: 'ffffffffffffffff'
				}
			});
			expect(pub2.ok).toBe(true);
			expect(seen).toHaveLength(2);

			const listed = await handleEvidenceCanvasDhashMcpToolCall('evidence:canvas_command', {
				action: 'list_recent',
				evidenceId: 'ev-100',
				limit: 1
			});
			expect(listed.ok).toBe(true);
			expect(listed.data?.count).toBe(1);
			expect((listed.data?.commands as Array<any>)[0].command).toEqual({
				command: 'video.seek_keyframe',
				timestampMs: 12000,
				dhashHex: 'ffffffffffffffff'
			});

			const invalid = await handleEvidenceCanvasDhashMcpToolCall('evidence:canvas_command', {
				evidenceId: 'ev-100',
				command: {
					command: 'evidence.add_rect',
					x: 0.8,
					y: 0.2,
					width: 0.5,
					height: 0.3
				}
			});
			expect(invalid.ok).toBe(false);
			expect(invalid.error).toContain('Rectangle bounds exceed normalized [0, 1] canvas');
		} finally {
			unsubscribe();
		}
	});

	it('executes dhash_frame, scene_cuts, and bitset_top_k (64-bit & 768-bit) using turbovec-napi', async () => {
		const ramp = makeHorizontalRampFrame();
		const single = await handleEvidenceCanvasDhashMcpToolCall('evidence:dhash_hamming_search', {
			mode: 'dhash_frame',
			gray9x8Base64: Buffer.from(ramp).toString('base64')
		});
		expect(single.ok).toBe(true);
		expect(single.data).toEqual({
			mode: 'dhash_frame',
			dhashHex: 'ffffffffffffffff',
			engine: 'turbovec-napi'
		});

		const baseFrame = makeFlatFrame(10);
		const nearDuplicate = makeFlatFrame(10);
		nearDuplicate[1] = 80;
		nearDuplicate[3] = 80;

		const stream = new Uint8Array(216);
		stream.set(baseFrame, 0);
		stream.set(nearDuplicate, 72);
		stream.set(ramp, 144);

		const cuts = await handleEvidenceCanvasDhashMcpToolCall('evidence:dhash_hamming_search', {
			mode: 'scene_cuts',
			rawGray9x8Base64: Buffer.from(stream).toString('base64'),
			intervalMs: 500
		});
		expect(cuts.ok).toBe(true);
		expect(cuts.data?.engine).toBe('turbovec-napi');
		expect(cuts.data?.candidateCount).toBe(3);
		expect(cuts.data?.keyframeCount).toBe(2);

		const search64 = await handleEvidenceCanvasDhashMcpToolCall('evidence:dhash_hamming_search', {
			mode: 'bitset_top_k',
			queryWordsHex: ['ffffffffffffffff'],
			corpusFlatWordsLeBase64: cuts.data?.corpusWordsLeBase64,
			wordsPerVec: 1,
			topK: 2
		});
		expect(search64.ok).toBe(true);
		expect(search64.data?.matches).toEqual([
			{ index: 1, distance: 0 },
			{ index: 0, distance: 64 }
		]);

		const wordsPerVec = 12;
		const q768 = new BigUint64Array(wordsPerVec);
		const c768 = new BigUint64Array(3 * wordsPerVec);
		c768[0] = 0b1111n; // idx 0 -> dist 4
		c768[wordsPerVec] = 0b11n; // idx 1 -> dist 2
		c768[2 * wordsPerVec] = 0b101n; // idx 2 -> dist 2

		const search768 = await handleEvidenceCanvasDhashMcpToolCall('evidence:dhash_hamming_search', {
			mode: 'bitset_top_k',
			queryWordsLeBase64: Buffer.from(q768.buffer).toString('base64'),
			corpusFlatWordsLeBase64: Buffer.from(c768.buffer).toString('base64'),
			wordsPerVec,
			topK: 2
		});
		expect(search768.ok).toBe(true);
		expect(search768.data?.matches).toEqual([
			{ index: 1, distance: 2 },
			{ index: 2, distance: 2 }
		]);
	});

	it('returns Apache-2.0/MIT default model stack and builds Town Hall proposals via evidence:longform_video_town_hall', async () => {
		const stackRes = await handleEvidenceCanvasDhashMcpToolCall('evidence:longform_video_town_hall', {
			mode: 'default_stack'
		});
		expect(stackRes.ok).toBe(true);
		expect(stackRes.data?.stack).toMatchObject({
			depth: 'depth-anything/Depth-Anything-V2-Small-hf',
			diarization: 'wespeaker/wespeaker-voxceleb-resnet34-LM'
		});
		expect(stackRes.data?.canonicalAuthority).toBe(false);
		expect(stackRes.data?.writesPerformed).toBe(false);

		const proposalsRes = await handleEvidenceCanvasDhashMcpToolCall('evidence:longform_video_town_hall', {
			mode: 'build_town_hall_proposals',
			extraction: {
				source: {
					evidence_id: '11111111-2222-4333-8444-555555555555',
					sha256: 'a'.repeat(64),
					duration_ms: 14_400_000
				},
				speakers: [{ speaker_id: 'spk_01', identity: null, identity_status: 'unverified' }],
				utterances: [
					{
						speaker_id: 'spk_01',
						start_ms: 723_000,
						end_ms: 730_000,
						text: 'We need to inspect the damaged gate before anyone enters.',
						source_segment_ids: ['seg_000401']
					}
				],
				summary: {
					sentences: ['Speaker 01 requested a damaged-gate inspection.'],
					source_segment_ids: ['seg_000401']
				},
				recommendations: [
					{
						action: 'Schedule gate inspection.',
						status: 'proposed',
						priority: 'requires_review',
						source_segment_ids: ['seg_000401']
					}
				]
			}
		});
		expect(proposalsRes.ok).toBe(true);
		expect(proposalsRes.data?.canonicalAuthority).toBe(false);
		expect(proposalsRes.data?.writesPerformed).toBe(false);
		expect((proposalsRes.data?.proposals as Array<any>)[0]).toMatchObject({
			arenaSlotIndex: 0,
			townHallBuilding: 'PUBLIC_WORKS',
			approvedBudgetUsd: null,
			fsmState: 'HOLD_FOR_HUMAN_REVIEW'
		});
	});
});
