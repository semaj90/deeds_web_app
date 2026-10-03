import { describe, expect, it } from 'vitest';
import { validateAdmittedSourceRevisionRowV1 } from './admitted-source-revision-resolver-v1.js';

const digest = 'a'.repeat(64);
const workspaceRevision = `sha256:${'b'.repeat(64)}`;
const row = {
	repo_id: 'deeds-web-app',
	canonical_source_ref: 'src/auth.ts',
	workspace_revision: workspaceRevision,
	source_revision: `sha256:${digest}`,
	content_digest: digest,
	binding_checksum: `sha256:${'c'.repeat(64)}`,
};

describe('admitted source revision resolver', () => {
	it('accepts only an exact admitted binding whose revision is its byte digest', () => {
		expect(validateAdmittedSourceRevisionRowV1(row, { sourceRef: 'src/auth.ts', workspaceRevision })).toMatchObject({
			repoId: 'deeds-web-app',
			sourceRef: 'src/auth.ts',
			sourceRevision: `sha256:${digest}`,
			workspaceRevision,
		});
	});

	it('rejects scope mismatch and a revision/digest contradiction', () => {
		expect(() => validateAdmittedSourceRevisionRowV1(row, { sourceRef: 'src/other.ts', workspaceRevision }))
			.toThrow('SOURCE_BINDING_SCOPE_MISMATCH');
		expect(() => validateAdmittedSourceRevisionRowV1({ ...row, content_digest: 'd'.repeat(64) }, { sourceRef: 'src/auth.ts', workspaceRevision }))
			.toThrow('SOURCE_BINDING_DIGEST_MISMATCH');
	});

	it('rejects a binding without its checksum', () => {
		expect(() => validateAdmittedSourceRevisionRowV1({ ...row, binding_checksum: '' }, { sourceRef: 'src/auth.ts', workspaceRevision }))
			.toThrow('SOURCE_BINDING_CHECKSUM_MISSING');
	});
});
