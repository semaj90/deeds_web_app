import { describe, expect, it } from 'vitest';
import { replaceEvidenceThumbnailUrls } from './evidence-thumbnail-policy.js';

describe('replaceEvidenceThumbnailUrls', () => {
	it('replaces stale persisted evidence URLs with current case-scoped previews', () => {
		const nodes = [
			{ id: 'photo', evidenceId: 'image-1', thumbnailUrl: '/old-or-wrong-case-url' },
			{ id: 'report', evidenceId: 'pdf-1', thumbnailUrl: '/old-inline-pdf-url' },
			{ id: 'note', kind: 'note', thumbnailUrl: '/custom-note-thumbnail' },
		];

		expect(replaceEvidenceThumbnailUrls(nodes, { 'image-1': '/api/evidence/image-1/download?inline=1&caseId=case-a' })).toEqual([
			{ id: 'photo', evidenceId: 'image-1', thumbnailUrl: '/api/evidence/image-1/download?inline=1&caseId=case-a' },
			{ id: 'report', evidenceId: 'pdf-1' },
			{ id: 'note', kind: 'note', thumbnailUrl: '/custom-note-thumbnail' },
		]);
	});

	it('removes obsolete evidence URLs when no safe preview is available', () => {
		expect(replaceEvidenceThumbnailUrls(
			[{ id: 'unknown', evidenceId: 'document-1', thumbnailUrl: 'file:///old/document' }],
			{}
		)).toEqual([{ id: 'unknown', evidenceId: 'document-1' }]);
	});
});
