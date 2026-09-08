import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assembleParameterPlanV1, expectedTensorByteLength } from './parameter-assembly-plan-v1.js';

function sha256Hex(s: string): string {
	return createHash('sha256').update(s).digest('hex');
}

describe('ParameterAssemblyPlanV1 assembler', () => {
	it('lays out sections sequentially, aligning each offset up to alignmentBytes', () => {
		const plan = assembleParameterPlanV1({
			planId: 'plan-1',
			packetKeys: ['pkt-a', 'pkt-b'],
			revisions: { 'pkt-a': 'rev-1', 'pkt-b': 'rev-1' },
			alignmentBytes: 16,
			sections: [
				{ kind: 'TENSOR_REF', name: 'semantic768', byteLength: expectedTensorByteLength([768]), dimensions: [768], checksum: sha256Hex('tensor') },
				{ kind: 'SOURCE_SPAN', name: 'src-span-1', byteLength: 5, checksum: sha256Hex('hello') },
			],
		});

		expect(plan.sections[0]!.offset).toBe(0);
		// 768 floats * 4 bytes = 3072, already a multiple of 16, so section 2 starts right after.
		expect(plan.sections[1]!.offset).toBe(3072);
		// totalByteLength is the end of the last section rounded UP to alignment (3072+5=3077 -> 3088)
		expect(plan.totalByteLength).toBe(3088);
		expect(plan.totalByteLength % 16).toBe(0);
	});

	it('is deterministic: same input produces the same planChecksum', () => {
		const build = () =>
			assembleParameterPlanV1({
				planId: 'plan-1',
				packetKeys: ['pkt-a'],
				revisions: { 'pkt-a': 'rev-1' },
				alignmentBytes: 8,
				sections: [{ kind: 'FEATURE_COLUMN', name: 'col-1', byteLength: 16, dimensions: [4], checksum: sha256Hex('x') }],
			});
		expect(build().planChecksum).toBe(build().planChecksum);
	});

	it('rejects an empty packetKeys array at the schema boundary', () => {
		expect(() =>
			assembleParameterPlanV1({
				planId: 'plan-1',
				packetKeys: [],
				revisions: {},
				alignmentBytes: 8,
				sections: [{ kind: 'GRAPH_SLICE', name: 'g1', byteLength: 8, checksum: sha256Hex('x') }],
			}),
		).toThrow();
	});
});
