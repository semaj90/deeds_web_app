/**
 * Cutscene CSV timeline (v1): hand-authored shot list for the courtroom scenes. Format adopted from the
 * "legal-ai-courtroom-cutscene" prototype (Downloads, 2026-10-18); this module is a pure, dependency-free parser and
 * validator, with no renderer, no network and no database access.
 *
 * Columns: Name,Time,Duration,Speaker,Action,Camera,Dialogue,ExhibitId,EvidenceRef,SourceRevision[,Animation]
 *
 * Authority rules (from the prototype's own README, enforced here):
 * - EvidenceRef / SourceRevision are untrusted labels typed into a CSV. They are returned as `evidenceClaim` with
 *   `verified: false`; a CSV never designates admissible evidence. Verification belongs to a server-side,
 *   revision-qualified manifest, not to this file.
 * - A missing SourceRevision is never defaulted or coerced: an EvidenceRef without one is an error.
 * - Parquet is not supported; a Parquet source would need a server-side reader that emits this shape.
 */
export const CUTSCENE_COLUMNS = [
	'Name',
	'Time',
	'Duration',
	'Speaker',
	'Action',
	'Camera',
	'Dialogue',
	'ExhibitId',
	'EvidenceRef',
	'SourceRevision',
	'Animation',
] as const;

const REQUIRED_COLUMNS = CUTSCENE_COLUMNS.slice(0, 10);

export const CUTSCENE_SPEAKERS = ['Judge', 'Attorney', 'Witness', 'Clerk'] as const;
export const CUTSCENE_ACTIONS = ['dialogue', 'exhibit'] as const;
export const CUTSCENE_CAMERAS = ['wide', 'judge', 'evidence', 'witness', 'prosecution', 'defense'] as const;

export const MAX_CUTSCENE_SHOTS = 500;
export const MAX_DIALOGUE_CHARS = 500;

export type CutsceneSpeaker = (typeof CUTSCENE_SPEAKERS)[number];
export type CutsceneAction = (typeof CUTSCENE_ACTIONS)[number];
export type CutsceneCamera = (typeof CUTSCENE_CAMERAS)[number];

export interface CutsceneShotV1 {
	name: string;
	startSec: number;
	durationSec: number;
	speaker: CutsceneSpeaker;
	action: CutsceneAction;
	camera: CutsceneCamera;
	dialogue: string;
	exhibitId: string | null;
	/** Unverified labels from the CSV; never evidence authority. */
	evidenceClaim: { evidenceRef: string; sourceRevision: string; verified: false } | null;
	animation: string | null;
}

export interface CutsceneIssue {
	/** 1-based CSV line (header is line 1); 0 for file-level issues. */
	line: number;
	severity: 'error' | 'warning';
	code: string;
	message: string;
}

export interface CutsceneParseResult {
	ok: boolean;
	shots: CutsceneShotV1[];
	issues: CutsceneIssue[];
	canonicalAuthority: false;
}

/** RFC 4180-style splitter: quoted fields, doubled quotes, CRLF or LF, optional BOM. Returns rows with source line. */
function splitCsv(text: string): { fields: string[]; line: number }[] {
	const rows: { fields: string[]; line: number }[] = [];
	const src = text.replace(/^﻿/, '');
	let field = '';
	let row: string[] = [];
	let inQuotes = false;
	let line = 1;
	let rowLine = 1;
	const pushRow = () => {
		row.push(field);
		field = '';
		if (!(row.length === 1 && row[0].trim() === '')) rows.push({ fields: row, line: rowLine });
		row = [];
	};
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (inQuotes) {
			if (ch === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i++;
				} else inQuotes = false;
			} else {
				if (ch === '\n') line++;
				field += ch;
			}
		} else if (ch === '"') inQuotes = true;
		else if (ch === ',') {
			row.push(field);
			field = '';
		} else if (ch === '\r') {
			// swallow; the following \n (or end) ends the row
		} else if (ch === '\n') {
			pushRow();
			line++;
			rowLine = line;
		} else field += ch;
	}
	if (field !== '' || row.length > 0) pushRow();
	return rows;
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
	const hit = allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase());
	return hit ?? null;
}

export function parseCutsceneCsv(text: string): CutsceneParseResult {
	const issues: CutsceneIssue[] = [];
	const shots: CutsceneShotV1[] = [];
	const fail = (line: number, code: string, message: string, severity: CutsceneIssue['severity'] = 'error') =>
		issues.push({ line, severity, code, message });

	const rows = splitCsv(text);
	if (rows.length === 0) {
		fail(0, 'EMPTY', 'CSV has no rows');
		return { ok: false, shots, issues, canonicalAuthority: false };
	}

	const header = rows[0].fields.map((h) => h.trim());
	const index = new Map<string, number>();
	header.forEach((h, i) => index.set(h, i));
	const missing = REQUIRED_COLUMNS.filter((c) => !index.has(c));
	if (missing.length > 0) {
		fail(1, 'MISSING_COLUMNS', `Missing required columns: ${missing.join(', ')}`);
		return { ok: false, shots, issues, canonicalAuthority: false };
	}
	const col = (fields: string[], name: (typeof CUTSCENE_COLUMNS)[number]): string => {
		const i = index.get(name);
		return i === undefined ? '' : (fields[i] ?? '').trim();
	};

	const dataRows = rows.slice(1);
	if (dataRows.length > MAX_CUTSCENE_SHOTS) {
		fail(0, 'TOO_MANY_SHOTS', `More than ${MAX_CUTSCENE_SHOTS} shots (${dataRows.length})`);
		return { ok: false, shots, issues, canonicalAuthority: false };
	}

	const names = new Set<string>();
	let previousEnd = 0;
	for (const { fields, line } of dataRows) {
		const before = issues.filter((x) => x.severity === 'error').length;
		const name = col(fields, 'Name');
		if (!name) fail(line, 'MISSING_NAME', 'Name is required');
		else if (names.has(name)) fail(line, 'DUPLICATE_NAME', `Duplicate shot name ${name}`);
		names.add(name);

		const startSec = Number(col(fields, 'Time'));
		const durationSec = Number(col(fields, 'Duration'));
		if (col(fields, 'Time') === '' || !Number.isFinite(startSec) || startSec < 0) fail(line, 'BAD_TIME', 'Time must be a number >= 0');
		if (col(fields, 'Duration') === '' || !Number.isFinite(durationSec) || durationSec <= 0) fail(line, 'BAD_DURATION', 'Duration must be a number > 0');

		const speaker = oneOf(col(fields, 'Speaker'), CUTSCENE_SPEAKERS);
		if (!speaker) fail(line, 'BAD_SPEAKER', `Speaker must be one of ${CUTSCENE_SPEAKERS.join(', ')}`);
		const action = oneOf(col(fields, 'Action'), CUTSCENE_ACTIONS);
		if (!action) fail(line, 'BAD_ACTION', `Action must be one of ${CUTSCENE_ACTIONS.join(', ')}`);
		const camera = oneOf(col(fields, 'Camera'), CUTSCENE_CAMERAS);
		if (!camera) fail(line, 'BAD_CAMERA', `Camera must be one of ${CUTSCENE_CAMERAS.join(', ')}`);

		const dialogue = col(fields, 'Dialogue');
		if (dialogue.length > MAX_DIALOGUE_CHARS) fail(line, 'DIALOGUE_TOO_LONG', `Dialogue exceeds ${MAX_DIALOGUE_CHARS} characters`);

		const exhibitId = col(fields, 'ExhibitId');
		const evidenceRef = col(fields, 'EvidenceRef');
		const sourceRevision = col(fields, 'SourceRevision');
		if (action === 'exhibit' && !exhibitId) fail(line, 'MISSING_EXHIBIT_ID', 'An exhibit shot needs an ExhibitId');
		if (evidenceRef && !sourceRevision) fail(line, 'MISSING_SOURCE_REVISION', 'EvidenceRef without SourceRevision (never defaulted)');
		if (!evidenceRef && sourceRevision) fail(line, 'ORPHAN_SOURCE_REVISION', 'SourceRevision without EvidenceRef');

		if (Number.isFinite(startSec) && startSec < previousEnd) fail(line, 'OVERLAP', `Shot starts at ${startSec}s before the previous shot ends (${previousEnd}s)`, 'warning');

		const hadError = issues.filter((x) => x.severity === 'error').length > before;
		if (!hadError && speaker && action && camera) {
			shots.push({
				name,
				startSec,
				durationSec,
				speaker,
				action,
				camera,
				dialogue,
				exhibitId: exhibitId || null,
				evidenceClaim: evidenceRef ? { evidenceRef, sourceRevision, verified: false } : null,
				animation: col(fields, 'Animation') || null,
			});
			previousEnd = Math.max(previousEnd, startSec + durationSec);
		}
	}

	return { ok: !issues.some((x) => x.severity === 'error'), shots, issues, canonicalAuthority: false };
}
