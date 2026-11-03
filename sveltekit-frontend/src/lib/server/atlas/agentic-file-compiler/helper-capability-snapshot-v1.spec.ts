import { describe, expect, it } from 'vitest';
import {
	assertHelperCapabilitySnapshotV1,
	buildHelperCapabilitySnapshotV1,
} from './helper-capability-snapshot-v1.js';
import { HELPER_REGISTRY_V1 } from './helper-registry-v1.js';

const base = {
	helperId: 'rg-exact',
	available: true,
	observedAt: '2026-11-02T18:00:00.000Z',
	evidenceRefs: ['probe:b', 'probe:a', 'probe:a'],
};

describe('HelperCapabilitySnapshotV1 (AFC-HELPER-02)', () => {
	it('binds to the static registry revision and checksum, dedupes and sorts evidence', () => {
		const snap = buildHelperCapabilitySnapshotV1(base);
		const entry = HELPER_REGISTRY_V1.entries.find((e) => e.helperId === 'rg-exact')!;
		expect(snap.helperRevision).toBe(entry.helperRevision);
		expect(snap.registryChecksum).toBe(HELPER_REGISTRY_V1.checksum);
		expect(snap.evidenceRefs).toEqual(['probe:a', 'probe:b']);
		expect(assertHelperCapabilitySnapshotV1(snap)).toEqual(snap);
	});

	it('is deterministic for identical observations', () => {
		expect(buildHelperCapabilitySnapshotV1(base).checksum).toBe(buildHelperCapabilitySnapshotV1(base).checksum);
	});

	it('does not change the static registry when availability flips', () => {
		const before = HELPER_REGISTRY_V1.checksum;
		const up = buildHelperCapabilitySnapshotV1({ ...base, available: true });
		const down = buildHelperCapabilitySnapshotV1({ ...base, available: false });
		expect(up.checksum).not.toBe(down.checksum);
		expect(HELPER_REGISTRY_V1.checksum).toBe(before);
	});

	it('rejects an unknown helper', () => {
		expect(() => buildHelperCapabilitySnapshotV1({ ...base, helperId: 'nope' })).toThrow('UNKNOWN_HELPER:nope');
	});

	it('rejects a tampered snapshot', () => {
		const snap = buildHelperCapabilitySnapshotV1(base);
		expect(() => assertHelperCapabilitySnapshotV1({ ...snap, available: false })).toThrow(
			'CAPABILITY_CHECKSUM_MISMATCH:rg-exact',
		);
	});

	it('requires at least one evidence ref and a timezone-qualified timestamp', () => {
		expect(() => buildHelperCapabilitySnapshotV1({ ...base, evidenceRefs: [] })).toThrow();
		expect(() => buildHelperCapabilitySnapshotV1({ ...base, observedAt: '2026-11-02 18:00' })).toThrow();
	});

	it('omits optional executor/service revisions when not supplied', () => {
		const snap = buildHelperCapabilitySnapshotV1(base);
		expect(snap).not.toHaveProperty('executorRevision');
		expect(snap).not.toHaveProperty('serviceRevision');
	});
});
