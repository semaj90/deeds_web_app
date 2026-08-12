import { describe, expect, it } from 'vitest';

import { buildCodeFeatureRegistryEnqueueResult } from './code-feature-registry-enqueue.js';

describe('code-feature-registry-enqueue', () => {
	it('builds a code lane enqueue payload for code-like uploads', () => {
		const result = buildCodeFeatureRegistryEnqueueResult({
			evidenceId: 'evidence-123',
			caseId: 'case-456',
			fileName: 'src/lib/server/example.ts',
			fileHash: 'abc123',
			fullText: 'export class SessionStore { loadSession(sessionId: string) { return sessionId; } }',
		});

		expect(result).not.toBeNull();
		expect(result?.jobType).toBe('code_feature_registry');
		expect(result?.result.sourceRef).toBe('src/lib/server/example.ts');
		expect(result?.result.sourceRevision).toBe('sha256:abc123');
		expect(result?.result.jsonlSourceDigest).toBe('sha256:abc123');
		expect(result?.result.featureId).toBe('evidence-123');
		expect(result?.result.featureLabel).toBe('src/lib/server/example.ts');
		expect(result?.result.representationRevision).toBe('semantic_768@1');
		expect(result?.result.sourceTables).toContain('analysis_jobs');
	});

	it('skips non-code uploads', () => {
		const result = buildCodeFeatureRegistryEnqueueResult({
			evidenceId: 'evidence-123',
			caseId: 'case-456',
			fileName: 'notes.txt',
			fileHash: 'abc123',
			fullText: 'plain text notes only',
		});

		expect(result).toBeNull();
	});
});
