// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
	createAudioWindowLedgerIfAvailableV1,
	createAudioWindowLedgerV1,
	type AudioWindowLedgerDatabaseV1,
} from './audio-window-ledger-v1.js';

const dialect = new PgDialect();
const EVIDENCE_ID = '00000000-0000-4000-8000-0000000000aa';
const JOB_ID = '00000000-0000-4000-8000-0000000000cc';
const REVISION = `sha256:${'a'.repeat(64)}`;
const ANALYSIS = 'analysis-rev-1';

function fakeDatabase(respond: (text: string) => Array<Record<string, unknown>>) {
	const calls: Array<{ text: string; params: unknown[] }> = [];
	const database: AudioWindowLedgerDatabaseV1 = {
		async execute(query) {
			const compiled = dialect.sqlToQuery(query);
			calls.push({ text: compiled.sql, params: compiled.params });
			return { rows: respond(compiled.sql) };
		},
	};
	return { database, calls };
}

describe('audio window ledger (durable, feature-detected)', () => {
	it('returns no ledger and issues no writes when the migration is not applied', async () => {
		const { database, calls } = fakeDatabase(() => [{ name: null }]);
		const ledger = await createAudioWindowLedgerIfAvailableV1(database);
		expect(ledger).toBeUndefined();
		expect(calls).toHaveLength(1);
		expect(calls[0].text).toContain('to_regclass');
		expect(calls.some((call) => /INSERT|UPDATE|DELETE|CREATE/i.test(call.text))).toBe(false);
	});

	it('reads completed window indexes scoped to evidence, source and analysis revision', async () => {
		const { database, calls } = fakeDatabase(() => [{ window_index: 0 }, { window_index: '3' }]);
		const ledger = createAudioWindowLedgerV1(database);
		const completed = await ledger.completedWindowIndexes({ evidenceId: EVIDENCE_ID, sourceRevision: REVISION, analysisRevision: ANALYSIS });
		expect([...completed].sort()).toEqual([0, 3]);
		expect(calls[0].text).toContain("status = 'COMPLETED'");
		expect(calls[0].params).toEqual(expect.arrayContaining([EVIDENCE_ID, REVISION, ANALYSIS]));
	});

	it('writes each window idempotently on the unique window key and never downgrades a locator', async () => {
		const { database, calls } = fakeDatabase(() => []);
		const ledger = createAudioWindowLedgerV1(database);
		await ledger.recordWindow({
			evidenceId: EVIDENCE_ID, sourceRevision: REVISION, analysisRevision: ANALYSIS, analysisJobId: JOB_ID,
			windowIndex: 2, startSample: 960_000, sampleCount: 480_000, status: 'FAILED', error: 'transient',
		});
		const sqlText = calls[0].text;
		expect(sqlText).toContain('ON CONFLICT (evidence_id, source_revision, analysis_revision, window_index)');
		expect(sqlText).toContain('attempt_count = public.evidence_audio_window_ledger.attempt_count + 1');
		expect(sqlText).toContain('COALESCE(EXCLUDED.vector_locator_sha256');
		expect(calls[0].params).toEqual(expect.arrayContaining(['FAILED', 'transient', 2, 960_000]));
	});
});
