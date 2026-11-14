import { describe, expect, it } from 'vitest';
import {
	createSyntheticCourtroomProjectV1,
	frameBoundaryToTicksV1,
	sealCourtroomReconstructionV1,
	verifyCourtroomReconstructionChecksumV1,
	validateCourtroomVideoProjectV1,
	type CourtroomVideoProjectV1,
} from './courtroom-video-project-v1.js';

describe('courtroom video project v1', () => {
	it('covers exactly 240 frames as four ordered 60-frame story beats', () => {
		const project = createSyntheticCourtroomProjectV1();
		expect(validateCourtroomVideoProjectV1(project)).toEqual([]);
		expect(project.segments.map(({ startFrame, endFrameExclusive }) => [startFrame, endFrameExclusive])).toEqual([
			[0, 60], [60, 120], [120, 180], [180, 240],
		]);
		expect(project).toMatchObject({ fps: 30, frameCount: 240, width: 1280, height: 720 });
		expect(project.caseId).toBe('fixture:synthetic-courtroom-v1');
		expect(project.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
		for (const segment of project.segments) {
			expect(segment.sourceRefs).toHaveLength(1);
			expect(segment.sourceRefs[0]).toMatchObject({
				sourceRevision: project.sourceRevision,
				fixtureOnly: true,
			});
		}
	});

	it('rejects project/source revision drift and a real-world case id in the synthetic fixture', () => {
		const project = createSyntheticCourtroomProjectV1();
		const bad = {
			...project,
			caseId: 'case:real-case-id',
			segments: project.segments.map((segment, index) => index === 0
				? { ...segment, sourceRefs: [{ ...segment.sourceRefs[0], sourceRevision: 'sha256:' + '0'.repeat(64) }] }
				: segment),
		} as CourtroomVideoProjectV1;
		expect(validateCourtroomVideoProjectV1(bad)).toEqual(expect.arrayContaining([
			'CASE_ID_NOT_FIXTURE_SCOPED', 'SOURCE_REVISION_MISMATCH_0',
		]));
	});

	it('requires disclosure, source-qualified fixture references, and rejects unsourced documented motive', () => {
		const project = createSyntheticCourtroomProjectV1();
		const bad = {
			...project,
			disclosure: 'Courtroom simulation',
			segments: project.segments.map((segment, index) => index === 2
				? { ...segment, status: 'DOCUMENTED' as const }
				: segment),
		} as unknown as CourtroomVideoProjectV1;
		expect(validateCourtroomVideoProjectV1(bad)).toEqual([
			'DISCLOSURE_REQUIRED',
			'UNSOURCED_MOTIVE_CANNOT_BE_DOCUMENTED',
			'FACTUAL_CLAIM_WITHOUT_OBSERVATION_2',
		]);
	});

	it('requires source observations for disputed factual claims too', () => {
		const project = createSyntheticCourtroomProjectV1();
		const disputed = {
			...project,
			segments: project.segments.map((segment, index) => index === 1
				? { ...segment, status: 'DISPUTED' as const }
				: segment),
		} as CourtroomVideoProjectV1;
		expect(validateCourtroomVideoProjectV1(disputed)).toContain('FACTUAL_CLAIM_WITHOUT_OBSERVATION_1');
	});

	it('rejects source observations that do not bind to a source or point outside the source', () => {
		const project = createSyntheticCourtroomProjectV1();
		const first = project.segments[0];
		const bad = {
			...project,
			segments: project.segments.map((segment, index) => index === 0
				? { ...segment, observations: [{
					observationId: 'fixture-observation-1',
					sourceId: first.sourceRefs[0].sourceId,
					sourceRevision: first.sourceRefs[0].sourceRevision,
					sha256: first.sourceRefs[0].sha256,
					fixtureOnly: true,
					locator: { kind: 'image_region' as const, x: 0.9, y: 0.2, width: 0.2, height: 0.2 },
				}] }
				: segment),
		} as CourtroomVideoProjectV1;
		expect(validateCourtroomVideoProjectV1(bad)).toContain('OBSERVATION_LOCATOR_INVALID_0');
	});

	it('rejects frame gaps, reordered beats, malformed hashes, and non-fixture sources', () => {
		const project = createSyntheticCourtroomProjectV1();
		const bad = {
			...project,
			segments: project.segments.map((segment, index) => index === 0
				? { ...segment, endFrameExclusive: 59, beat: 'WHAT' as const }
				: index === 1
					? { ...segment, beat: 'WHAT' as const, sourceRefs: [{
						sourceId: 'source-1', sourceRevision: 'rev-1', sha256: 'bad', locator: 'page:1', fixtureOnly: false,
					}] }
					: segment),
		} as CourtroomVideoProjectV1;
		expect(validateCourtroomVideoProjectV1(bad)).toEqual(expect.arrayContaining([
			'BEAT_ORDER_INVALID_0', 'FRAME_RANGE_INVALID_0', 'SOURCE_REFERENCE_INVALID_1',
			'NON_FIXTURE_SOURCE_NOT_ADMITTED_1',
		]));
	});

	it('maps all frame boundaries to exact integer ticks, including the eight-second exclusive end', () => {
		const ticksPerSecond = 254_016_000_000n;
		expect(frameBoundaryToTicksV1(0, ticksPerSecond)).toBe(0n);
		expect(frameBoundaryToTicksV1(1, ticksPerSecond)).toBe(8_467_200_000n);
		expect(frameBoundaryToTicksV1(239, ticksPerSecond)).toBe(2_023_660_800_000n);
		expect(frameBoundaryToTicksV1(240, ticksPerSecond)).toBe(2_032_128_000_000n);
		expect(() => frameBoundaryToTicksV1(241, ticksPerSecond)).toThrow('FRAME_BOUNDARY_OUT_OF_RANGE');
		expect(() => frameBoundaryToTicksV1(1.5, ticksPerSecond)).toThrow('FRAME_BOUNDARY_OUT_OF_RANGE');
		expect(() => frameBoundaryToTicksV1(1, 1n, { numerator: 30, denominator: 1 })).toThrow('FRAME_TIME_NOT_INTEGRAL_TICKS');
	});

	it('seals the canonical fixture and rejects a modified storyboard', async () => {
		const project = createSyntheticCourtroomProjectV1();
		const sealed = await sealCourtroomReconstructionV1(project);
		expect(sealed.storyboardChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(await verifyCourtroomReconstructionChecksumV1(sealed)).toBe(true);
		const reordered = Object.fromEntries(Object.entries(project).reverse()) as CourtroomVideoProjectV1;
		expect((await sealCourtroomReconstructionV1(reordered)).storyboardChecksum).toBe(sealed.storyboardChecksum);
		expect(await verifyCourtroomReconstructionChecksumV1({
			...sealed,
			title: 'Changed after sealing',
		})).toBe(false);
	});
});
