import { describe, expect, it } from 'vitest';
import { fictionalBankCaseSeedV1, fictionalBankCaseSeedV1Schema } from './fictional-bank-case-seed-v1.js';

describe('fictional bank case seed v1', () => {
	it('is explicitly synthetic, multi-scene, and source-clock scoped', () => {
		expect(fictionalBankCaseSeedV1.fictional).toBe(true);
		expect(fictionalBankCaseSeedV1.scenes).toHaveLength(6);
		expect(fictionalBankCaseSeedV1.evidence).toHaveLength(8);
		expect(new Set(fictionalBankCaseSeedV1.scenes.map((scene) => scene.coordinateFrame.frameId)).size).toBe(6);
		expect(fictionalBankCaseSeedV1.location.coordinateSystem).toBe('FICTIONAL_LOCAL_GRID');
		expect(fictionalBankCaseSeedV1.scenes.every((scene) => scene.coordinateFrame.geodeticCoordinates === null)).toBe(true);
		for (const scene of fictionalBankCaseSeedV1.scenes) {
			const evidenceIds = new Set(scene.evidenceIds);
			for (const event of scene.intent.events) {
				expect(event.kind).toBe('fixture');
				for (const citation of event.citations) expect(evidenceIds.has(citation.evidence_id)).toBe(true);
			}
		}
	});

	it('does not link detained people to any person of interest and keeps head cards non-evidentiary', () => {
		const detained = fictionalBankCaseSeedV1.participants.filter((participant) => participant.registryKind === 'DETAINED_PERSON');
		const peopleOfInterest = fictionalBankCaseSeedV1.participants.filter((participant) => participant.registryKind === 'PERSON_OF_INTEREST');
		expect(detained).toHaveLength(2);
		expect(peopleOfInterest).toHaveLength(4);
		for (const participant of fictionalBankCaseSeedV1.participants) {
			expect(participant.identityStatus).toBe('UNIDENTIFIED');
			expect(participant.identityLinks).toEqual([]);
			expect(participant.presentation.portrait).toMatchObject({ status: 'SYNTHETIC_PLACEHOLDER', isEvidence: false });
		}
	});

	it('preserves interview clocks and marks transcript statements as unverified', () => {
		const interviews = fictionalBankCaseSeedV1.evidence.filter((item) => item.kind === 'INTERVIEW_TRANSCRIPT');
		expect(interviews).toHaveLength(2);
		expect(interviews[0]!.clockDomain).not.toBe(interviews[1]!.clockDomain);
		expect(interviews.flatMap((item) => item.transcriptSegments).every((segment) => segment.claimStatus === 'UNVERIFIED_STATEMENT')).toBe(true);
		expect(fictionalBankCaseSeedV1.unknowns.some((item) => item.includes('Motive'))).toBe(true);
	});

	it('rejects a scene event citation to evidence not linked to that scene', () => {
		const candidate = structuredClone(fictionalBankCaseSeedV1);
		candidate.scenes[0]!.intent.events[0]!.citations[0]!.evidence_id = candidate.evidence.find((item) => item.kind === 'DISPATCH_LOG')!.evidenceId;
		expect(fictionalBankCaseSeedV1Schema.safeParse(candidate).success).toBe(false);
	});

	it('rejects a cross-case identity link unless a participant relationship is deliberately reviewed later', () => {
		const candidate = structuredClone(fictionalBankCaseSeedV1);
		candidate.participants[4]!.identityLinks = ['POI-01'];
		// Links are intentionally not permitted in this seed contract; add them later
		// through an explicit, source-cited reviewed relationship schema.
		expect(fictionalBankCaseSeedV1Schema.safeParse(candidate).success).toBe(false);
	});
});
