import { describe, expect, it } from 'vitest';
import { describeApiFailure, viewEvidenceSearch } from './courtroom-evidence-search-v1';

const hit = (over: Record<string, unknown> = {}) => ({ evidenceId: 'e1', chunkIndex: 2, content: 'alpha  beta\n gamma', score: 0.91234, metadata: { file_path: 'doc.pdf' }, ...over });

describe('evidence search view', () => {
	it('maps hits to display rows', () => {
		expect(viewEvidenceSearch({ results: [hit()], timing: { totalMs: 12 } })).toEqual({
			kind: 'rows',
			totalMs: 12,
			rows: [{ key: 'e1:2', evidenceId: 'e1', snippet: 'alpha beta gamma', score: 0.912, source: 'doc.pdf' }]
		});
	});
	it('truncates long snippets and tolerates missing metadata', () => {
		const v = viewEvidenceSearch({ results: [hit({ content: 'x'.repeat(500), metadata: undefined })] }, 50);
		expect(v.kind === 'rows' && v.rows[0].snippet.length).toBe(50);
		expect(v.kind === 'rows' && v.rows[0].source).toBeNull();
	});
	it('reports empty and malformed answers differently', () => {
		expect(viewEvidenceSearch({ results: [] })).toEqual({ kind: 'empty', totalMs: null });
		expect(viewEvidenceSearch({ results: 'x' })).toEqual({ kind: 'malformed' });
		expect(viewEvidenceSearch(null)).toEqual({ kind: 'malformed' });
	});
	it('words failures plainly', () => {
		expect(describeApiFailure({ reason: 'HTTP', status: 401 })).toMatch(/not signed in/);
		expect(describeApiFailure({ reason: 'NETWORK' })).toMatch(/reach/);
	});
});
