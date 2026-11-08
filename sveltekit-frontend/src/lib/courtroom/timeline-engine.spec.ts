// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	TimelineEngine,
	parseCaseNarrativeDossier,
	type CaseNarrativeEvent
} from './timeline-engine.svelte.js';

describe('Case Narrative Simulation ("Who, What, Why, How")', () => {
	const narrativeEvents: CaseNarrativeEvent[] = [
		{
			eventId: 'EV_001',
			timestamp: '2026-10-14T21:14:00Z',
			timeMs: 0,
			actor: 'investigator',
			action: 'enter',
			who: 'Detective Reed',
			what: 'Enters the 3rd-floor server corridor',
			why: 'Responding to security breach alarm',
			how: 'Through stairwell door B',
			location: [-1.8, 0.05, 1.6],
			headingDeg: 45
		},
		{
			eventId: 'EV_002',
			timestamp: '2026-10-14T21:14:30Z',
			timeMs: 2500,
			actor: 'investigator',
			action: 'inspect',
			who: 'Detective Reed',
			what: 'Inspects cyan footprint trail near doorway',
			why: 'Establishing intruder stride length and direction',
			how: 'Crouched with forensic flashlight',
			location: [0.5, 0.05, 0.0],
			headingDeg: 90
		},
		{
			eventId: 'EV_003',
			timestamp: '2026-10-14T21:15:10Z',
			timeMs: 5000,
			actor: 'investigator',
			action: 'mark_evidence',
			who: 'Detective Reed',
			what: 'Places Evidence Marker Tent #1 beside bloodstain E-002',
			why: 'Preserving crime scene exhibit calibration',
			how: 'Yellow numbered tent placement',
			location: [1.8, 0.05, -1.4],
			targetExhibitId: 'E-002',
			markerId: 1
		},
		{
			eventId: 'EV_004',
			timestamp: '2026-10-14T21:16:00Z',
			timeMs: 8000,
			actor: 'defense',
			action: 'present_evidence',
			who: 'Defense Counsel',
			what: 'Presents Exhibit E-002 Decal Analysis to Bench',
			why: 'Proving biological sample does not match defendant',
			how: 'Exhibiting forensic report tablet',
			location: [2.4, 0.05, -1.2],
			targetExhibitId: 'EXHIBIT_E002'
		},
		{
			eventId: 'EV_005',
			timestamp: '2026-10-14T21:17:20Z',
			timeMs: 11000,
			actor: 'witness',
			action: 'swear_oath',
			who: 'Lead Forensic Examiner',
			what: 'Swears sworn oath on crime-scene measurements',
			why: 'Testifying to 1/4096 mm millimeter calibration',
			how: 'Right hand raised',
			location: [3.0, 0.0, -2.0]
		}
	];

	it('parses case narrative dossier events into chronologically ordered 3D keyframes', () => {
		const keyframes = parseCaseNarrativeDossier(narrativeEvents);
		expect(keyframes).toHaveLength(5);

		// Check sorting
		for (let i = 1; i < keyframes.length; i++) {
			expect(keyframes[i].timeMs).toBeGreaterThan(keyframes[i - 1].timeMs);
		}

		// EV_001: Enter / walk
		expect(keyframes[0].animType).toBe('walking');
		expect(keyframes[0].posX).toBeCloseTo(-1.8, 2);
		expect(keyframes[0].posZ).toBeCloseTo(1.6, 2);
		expect(keyframes[0].rotY).toBeCloseTo((45 * Math.PI) / 180, 4);

		// EV_002: Inspect
		expect(keyframes[1].animType).toBe('forensic_inspect');
		expect(keyframes[1].cameraView).toBe('crime_scene_focus');

		// EV_003: Mark evidence
		expect(keyframes[2].animType).toBe('forensic_inspect');
		expect(keyframes[2].effect).toBe('marker_placed');
		expect(keyframes[2].evidenceUrl).toBe('/api/evidence/E-002');

		// EV_004: Present evidence
		expect(keyframes[3].animType).toBe('present_evidence');
		expect(keyframes[3].evidenceUrl).toBe('/api/evidence/EXHIBIT_E002');

		// EV_005: Swear oath
		expect(keyframes[4].animType).toBe('witness_oath');
		expect(keyframes[4].cameraView).toBe('witness');
	});

	it('TimelineEngine loads narrative keyframes and dispatches reached events', () => {
		const engine = new TimelineEngine();
		const keyframes = parseCaseNarrativeDossier(narrativeEvents);

		engine.loadKeyframes(keyframes);
		expect(engine.keyframes).toHaveLength(5);
		expect(engine.totalDurationMs).toBe(13000); // 11000 + 2000 buffer

		const reached: string[] = [];
		engine.onKeyframeReached((kf) => reached.push(kf.id));

		// Seek to 6000 ms (should trigger EV_001, EV_002, EV_003)
		engine.seekTo(6000);
		expect(engine.currentTimeMs).toBe(6000);
		expect(engine.progress).toBeCloseTo((6000 / 13000) * 100, 2);

		engine.dispose();
	});
});
