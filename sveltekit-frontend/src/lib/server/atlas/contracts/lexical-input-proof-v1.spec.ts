import { describe, expect, it } from 'vitest';
import { buildLexicalInputProof, sha256Utf8 } from './lexical-input-proof-v1.js';

const content = 'const authorize = (user) => user.role === "admin";';

function input(overrides: Partial<Parameters<typeof buildLexicalInputProof>[0]> = {}) {
	return {
		packetKey: 'packet:1',
		sourceRef: 'src/auth.ts',
		content,
		declaredContentHash: sha256Utf8(content),
		sourceRevision: 'source:r1',
		workspaceRevision: 'workspace:r1',
		sourceRevisionProven: true,
		workspaceRevisionCurrent: true,
		canonicalBindingExact: true,
		tokenizerRevision: 'lexical-tokenizer:v1',
		lexicalDerivationRevision: 'lexical-derivation:v1',
		textSearchConfig: 'pg_catalog.simple',
		...overrides,
	};
}

describe('LexicalInputProofV1', () => {
	it('proves exact UTF-8 content and eligibility', () => {
		const proof = buildLexicalInputProof(input());
		expect(proof.eligible).toBe(true);
		expect(proof.computedContentHash).toBe(proof.declaredContentHash);
		expect(proof.byteLength).toBe(Buffer.byteLength(content, 'utf8'));
		expect(proof.textSearchConfig).toBe('pg_catalog.simple');
		expect(proof.inputChecksum).toMatch(/^[a-f0-9]{64}$/);
	});

	it('rejects a content hash mismatch', () => {
		const proof = buildLexicalInputProof(input({ declaredContentHash: '0'.repeat(64) }));
		expect(proof.eligible).toBe(false);
		expect(proof.rejectionReason).toBe('CONTENT_HASH_MISMATCH');
	});

	it('rejects an unproven source revision', () => {
		const proof = buildLexicalInputProof(input({ sourceRevisionProven: false }));
		expect(proof.eligible).toBe(false);
		expect(proof.rejectionReason).toBe('SOURCE_REVISION_UNPROVEN');
	});

	it('rejects a stale workspace revision', () => {
		const proof = buildLexicalInputProof(input({ workspaceRevisionCurrent: false }));
		expect(proof.eligible).toBe(false);
		expect(proof.rejectionReason).toBe('WORKSPACE_REVISION_NOT_CURRENT');
	});

	it('rejects non-exact canonical binding', () => {
		const proof = buildLexicalInputProof(input({ canonicalBindingExact: false }));
		expect(proof.eligible).toBe(false);
		expect(proof.rejectionReason).toBe('CANONICAL_BINDING_NOT_EXACT');
	});
});
