import { describe, expect, it } from 'vitest';

import {
	LEXICAL_FEATURE_EXTRACTOR_REVISION,
	LEXICAL_FEATURE_REGISTRY_V1_SCHEMA,
	LexicalFeatureRegistryV1Schema,
	runLexicalFeatureRegistryV1,
} from './lexical-feature-registry-v1.js';

const baseInput = {
	packetKey: 'packet:abc123',
	sourceRef: 'src/lib/server/auth.ts',
	sourceRevision: 'sha256:source-1',
	workspaceRevision: 'workspace-1',
	language: 'typescript',
};

describe('LexicalFeatureRegistryV1', () => {
	it('emits a revision-qualified, non-authoritative pure result', () => {
		const result = runLexicalFeatureRegistryV1({
			...baseInput,
			content: 'export function validateSession() { return sessionToken; }',
		});

		expect(result).toMatchObject({
			schema: LEXICAL_FEATURE_REGISTRY_V1_SCHEMA,
			packetKey: 'packet:abc123',
			sourceRef: baseInput.sourceRef,
			sourceRevision: baseInput.sourceRevision,
			workspaceRevision: baseInput.workspaceRevision,
			extractorRevision: LEXICAL_FEATURE_EXTRACTOR_REVISION,
			canonicalAuthority: false,
			writesPerformed: false,
		});
		expect(result.identifiers).toEqual(['export', 'function', 'return', 'sessionToken', 'validateSession']);
		expect(result.symbolTerms).toContain('validate');
		LexicalFeatureRegistryV1Schema.parse(result);
	});

	it('excludes comments while retaining string literals', () => {
		const result = runLexicalFeatureRegistryV1({
			...baseInput,
			content: `// ignoredComment\nconst message = "Session expired"; /* ignoredBlock */`,
		});

		expect(result.identifiers).not.toContain('ignoredComment');
		expect(result.identifiers).toEqual(['const', 'message']);
		expect(result.literals).toEqual(['Session expired']);
		expect(result.normalizedTerms).toEqual(['const', 'expired', 'message', 'session']);
	});

	it('splits identifiers deterministically without semantic stopword filtering', () => {
		const result = runLexicalFeatureRegistryV1({
			...baseInput,
			content: 'const retry_policy = handleReconnect; const retry_policy = handleReconnect;',
		});

		expect(result.identifiers).toEqual(['const', 'handleReconnect', 'retry_policy']);
		expect(result.symbolTerms).toEqual(['const', 'handle', 'policy', 'reconnect', 'retry']);
		expect(result.tokenStats).toEqual({
			tokenCount: 10,
			uniqueTokenCount: 5,
			identifierCount: 6,
			uniqueIdentifierCount: 3,
			literalCount: 0,
			uniqueLiteralCount: 0,
		});
	});

	it('keeps empty content valid and revision-bound', () => {
		const result = runLexicalFeatureRegistryV1({
			...baseInput,
			content: '',
		});

		expect(result.identifiers).toEqual([]);
		expect(result.literals).toEqual([]);
		expect(result.normalizedTerms).toEqual([]);
		expect(result.tokenStats.tokenCount).toBe(0);
		expect(result.inputChecksum).toMatch(/^[a-f0-9]{64}$/);
	});

	it('changes input and output checksums when source content changes', () => {
		const first = runLexicalFeatureRegistryV1({ ...baseInput, content: 'const a = 1;' });
		const second = runLexicalFeatureRegistryV1({ ...baseInput, content: 'const b = 1;' });

		expect(second.inputChecksum).not.toBe(first.inputChecksum);
		expect(second.checksum).not.toBe(first.checksum);
	});

	it('changes the registry checksum when source identity changes', () => {
		const first = runLexicalFeatureRegistryV1({ ...baseInput, content: 'const a = 1;' });
		const second = runLexicalFeatureRegistryV1({
			...baseInput,
			sourceRevision: 'sha256:source-2',
			content: 'const a = 1;',
		});

		expect(second.inputChecksum).toBe(first.inputChecksum);
		expect(second.checksum).not.toBe(first.checksum);
	});
});
