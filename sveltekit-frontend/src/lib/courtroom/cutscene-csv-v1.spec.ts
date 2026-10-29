import { describe, it, expect } from 'vitest';
import { parseCutsceneCsv } from './cutscene-csv-v1.js';
import { Budget, GAME_BUDGET_BYTES, POOLS } from './n64/budget.js';

const HEADER = 'Name,Time,Duration,Speaker,Action,Camera,Dialogue,ExhibitId,EvidenceRef,SourceRevision,Animation';
// Fictional sample from the cutscene prototype (scenes.csv v2).
const SAMPLE = [
	HEADER,
	'scene_001,0,3,Clerk,dialogue,wide,Court is now in session,,,,Idle',
	'scene_002,3,4,Judge,dialogue,judge,Please present the evidence summary,,,,Idle',
	'scene_003,7,5,Attorney,exhibit,evidence,The exhibit is offered for review,EX-001,DEMO-PACKET-001,DEMO-REV-1,Idle',
	'scene_004,12,5,Witness,dialogue,witness,I can describe only what I personally observed,,,,Idle',
	'scene_005,17,4,Judge,dialogue,judge,The record will distinguish assertions from admitted evidence,,,,Idle',
].join('\r\n');

describe('cutscene CSV v1', () => {
	it('parses the five-shot sample with no issues', () => {
		const r = parseCutsceneCsv(SAMPLE);
		expect(r.ok).toBe(true);
		expect(r.issues).toEqual([]);
		expect(r.shots).toHaveLength(5);
		expect(r.shots[2]).toMatchObject({ exhibitId: 'EX-001', animation: 'Idle' });
	});

	it('never marks an evidence claim as verified', () => {
		const r = parseCutsceneCsv(SAMPLE);
		expect(r.shots[2].evidenceClaim).toEqual({ evidenceRef: 'DEMO-PACKET-001', sourceRevision: 'DEMO-REV-1', verified: false });
		expect(r.canonicalAuthority).toBe(false);
	});

	it('does not default a missing SourceRevision', () => {
		const r = parseCutsceneCsv(`${HEADER}\ns1,0,2,Judge,dialogue,judge,Hello,,PKT-1,,`);
		expect(r.ok).toBe(false);
		expect(r.issues.map((i) => i.code)).toContain('MISSING_SOURCE_REVISION');
		expect(r.shots).toHaveLength(0);
	});

	it('accepts quoted commas, doubled quotes, embedded newlines and a BOM; accepts an absent Animation column', () => {
		const csv = '﻿Name,Time,Duration,Speaker,Action,Camera,Dialogue,ExhibitId,EvidenceRef,SourceRevision\n' +
			's1,0,2,Judge,dialogue,judge,"Order, please. ""Quiet""\nnow",,,\n';
		const r = parseCutsceneCsv(csv);
		expect(r.ok).toBe(true);
		expect(r.shots[0].dialogue).toBe('Order, please. "Quiet"\nnow');
		expect(r.shots[0].animation).toBeNull();
	});

	it('rejects bad numbers, enums, duplicates and missing columns', () => {
		const bad = parseCutsceneCsv(`${HEADER}\ns1,-1,0,Bailiff,shout,sky,Hi,,,,\ns1,0,1,Judge,dialogue,judge,x,,,,`);
		const codes = bad.issues.map((i) => i.code);
		expect(bad.ok).toBe(false);
		for (const c of ['BAD_TIME', 'BAD_DURATION', 'BAD_SPEAKER', 'BAD_ACTION', 'BAD_CAMERA', 'DUPLICATE_NAME']) expect(codes).toContain(c);
		expect(parseCutsceneCsv('Name,Time\nx,1').issues[0].code).toBe('MISSING_COLUMNS');
		expect(parseCutsceneCsv('').issues[0].code).toBe('EMPTY');
	});

	it('flags overlap as a warning, not an error', () => {
		const r = parseCutsceneCsv(`${HEADER}\na,0,5,Judge,dialogue,judge,x,,,,\nb,3,2,Clerk,dialogue,wide,y,,,,`);
		expect(r.ok).toBe(true);
		expect(r.issues).toEqual([expect.objectContaining({ code: 'OVERLAP', severity: 'warning', line: 3 })]);
	});

	it('requires an ExhibitId for exhibit shots', () => {
		const r = parseCutsceneCsv(`${HEADER}\na,0,5,Attorney,exhibit,evidence,x,,,,`);
		expect(r.issues.map((i) => i.code)).toContain('MISSING_EXHIBIT_ID');
	});
});

describe('N64 game budget (accounting only, not a browser memory cap)', () => {
	it('pools add up to the 8 MiB reservation', () => {
		expect(Object.values(POOLS).reduce((a, b) => a + b, 0)).toBe(GAME_BUDGET_BYTES);
	});

	it('reserves, releases once, and throws past a pool limit', () => {
		const b = new Budget();
		const release = b.reserve('geometry', 1024);
		expect(b.snapshot().geometry).toBe(1024);
		release();
		release(); // second release is a no-op
		expect(b.total()).toBe(0);
		expect(() => b.reserve('animation', POOLS.animation + 1)).toThrow(/Budget exceeded/);
		expect(() => b.reserve('animation', -1)).toThrow(/Invalid allocation/);
	});
});
