import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assembleParameterPlanV1 } from './parameter-assembly-plan-v1.js';
import { validatePacketAssemblyPlanV1 } from './packet-validator-v1.js';

function sha256Bytes(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function buildWellFormedPlanAndBuffer() {
	const sourceBytes = new TextEncoder().encode('hello'); // 5 bytes, valid UTF-8
	const tensorBytes = new Uint8Array(16); // 4 float32s = 16 bytes
	const plan = assembleParameterPlanV1({
		planId: 'plan-well-formed',
		packetKeys: ['pkt-a'],
		revisions: { 'pkt-a': 'rev-1' },
		alignmentBytes: 16,
		sections: [
			{ kind: 'TENSOR_REF', name: 'feat', byteLength: 16, dimensions: [4], checksum: sha256Bytes(tensorBytes) },
			{ kind: 'SOURCE_SPAN', name: 'src', byteLength: 5, checksum: sha256Bytes(sourceBytes) },
		],
	});
	const buffer = new Uint8Array(plan.totalByteLength);
	buffer.set(tensorBytes, plan.sections[0]!.offset);
	buffer.set(sourceBytes, plan.sections[1]!.offset);
	return { plan, buffer };
}

describe('PacketValidatorV1 (proof gate item 7.4)', () => {
	it('passes a genuinely well-formed plan + resolved buffer with all 9 checks engaged', () => {
		const { plan, buffer } = buildWellFormedPlanAndBuffer();
		const result = validatePacketAssemblyPlanV1(plan, {
			resolvedBuffer: buffer,
			expectedRevisions: { 'pkt-a': 'rev-1' },
			expectedOrdinalMap: [0, 1, 2],
			actualOrdinalMap: [0, 1, 2],
			requiredRepresentations: ['feat', 'src'],
		});
		expect(result).toEqual({ valid: true, failures: [] });
	});

	it('rejects a bad checksum (deliberately malformed plan) before it would reach an executor', () => {
		const { plan, buffer } = buildWellFormedPlanAndBuffer();
		const corrupted = {
			...plan,
			sections: plan.sections.map((s, i) => (i === 0 ? { ...s, checksum: 'deadbeef'.repeat(8) } : s)),
		};
		const result = validatePacketAssemblyPlanV1(corrupted, { resolvedBuffer: buffer });
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('CHECKSUM_MISMATCH');
	});

	it('rejects an out-of-bounds section offset', () => {
		const { plan, buffer } = buildWellFormedPlanAndBuffer();
		const corrupted = {
			...plan,
			sections: plan.sections.map((s, i) => (i === 1 ? { ...s, offset: plan.totalByteLength + 100 } : s)),
		};
		const result = validatePacketAssemblyPlanV1(corrupted, { resolvedBuffer: buffer });
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('OUT_OF_BOUNDS');
	});

	it('rejects a misaligned section offset', () => {
		const { plan, buffer } = buildWellFormedPlanAndBuffer();
		const corrupted = { ...plan, sections: plan.sections.map((s, i) => (i === 1 ? { ...s, offset: s.offset + 1 } : s)) };
		const result = validatePacketAssemblyPlanV1(corrupted, { resolvedBuffer: buffer });
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('MISALIGNED_OFFSET');
	});

	it('rejects a shape/stride mismatch (declared dimensions do not match byteLength)', () => {
		const { plan, buffer } = buildWellFormedPlanAndBuffer();
		const corrupted = { ...plan, sections: plan.sections.map((s, i) => (i === 0 ? { ...s, dimensions: [999] } : s)) };
		const result = validatePacketAssemblyPlanV1(corrupted, { resolvedBuffer: buffer });
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('SHAPE_STRIDE_MISMATCH');
	});

	it('rejects invalid UTF-8 in a SOURCE_SPAN section', () => {
		const { plan, buffer } = buildWellFormedPlanAndBuffer();
		// Corrupt the source-span bytes into an invalid UTF-8 sequence (lone continuation byte).
		const badBuffer = buffer.slice();
		badBuffer[plan.sections[1]!.offset] = 0x80;
		// Recompute the section's checksum so only the UTF-8 check (not checksum) fails here.
		const patchedChecksum = sha256Bytes(badBuffer.subarray(plan.sections[1]!.offset, plan.sections[1]!.offset + plan.sections[1]!.byteLength));
		const patchedPlan = { ...plan, sections: plan.sections.map((s, i) => (i === 1 ? { ...s, checksum: patchedChecksum } : s)) };
		const result = validatePacketAssemblyPlanV1(patchedPlan, { resolvedBuffer: badBuffer });
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('INVALID_UTF8');
	});

	it('rejects duplicate packetKeys (identity)', () => {
		const { plan } = buildWellFormedPlanAndBuffer();
		const corrupted = { ...plan, packetKeys: ['pkt-a', 'pkt-a'] };
		const result = validatePacketAssemblyPlanV1(corrupted);
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('DUPLICATE_OR_EMPTY_IDENTITY');
	});

	it('rejects a revision mismatch against caller expectations', () => {
		const { plan } = buildWellFormedPlanAndBuffer();
		const result = validatePacketAssemblyPlanV1(plan, { expectedRevisions: { 'pkt-a': 'rev-2' } });
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('REVISION_MISMATCH');
	});

	it('rejects an ordinal-map mismatch', () => {
		const { plan } = buildWellFormedPlanAndBuffer();
		const result = validatePacketAssemblyPlanV1(plan, {
			expectedOrdinalMap: [0, 1, 2],
			actualOrdinalMap: [0, 1, 3],
		});
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('ORDINAL_MAP_MISMATCH');
	});

	it('rejects a missing required representation', () => {
		const { plan } = buildWellFormedPlanAndBuffer();
		const result = validatePacketAssemblyPlanV1(plan, { requiredRepresentations: ['feat', 'missing-rep'] });
		expect(result.valid).toBe(false);
		expect(result.failures).toContain('MISSING_REQUIRED_REPRESENTATION');
	});

	it('skips (does not fail) byte-level checks when no resolvedBuffer is provided', () => {
		const { plan } = buildWellFormedPlanAndBuffer();
		const result = validatePacketAssemblyPlanV1(plan, {});
		expect(result.valid).toBe(true);
	});
});
