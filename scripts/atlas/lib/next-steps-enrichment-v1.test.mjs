import test from 'node:test';
import assert from 'node:assert/strict';
import {
	classifyTaskEnrichmentV1,
	extractMarkdownFencesV1,
	normalizeFenceLanguageV1,
} from './next-steps-enrichment-v1.mjs';

test('generic programming prose does not trigger POS without identifier-like signals', () => {
	assert.deepEqual(classifyTaskEnrichmentV1('Update docs for the AST pipeline'), ['NONE']);
	assert.deepEqual(classifyTaskEnrichmentV1('Resolve executeUnifiedRetrieval and source_revision'), ['POS']);
	assert.deepEqual(classifyTaskEnrichmentV1('Add evidence identity normalization and canonical promotion'), ['POS']);
});

test('file and language triggers are independent and typed', () => {
	assert.deepEqual(classifyTaskEnrichmentV1('Review module', { referencedFile: true }), ['AST_REFERENCED_FILE']);
	assert.deepEqual(classifyTaskEnrichmentV1('Implement this', { supportedFence: true }), ['FENCED_CODE']);
	assert.deepEqual(classifyTaskEnrichmentV1('The API requires evidence', { supportedFence: true }), ['FENCED_CODE', 'LANGEXTRACT_CANDIDATE']);
	assert.deepEqual(classifyTaskEnrichmentV1('Inspect initTRPC API behavior'), ['POS']);
});

test('fence extraction retains source coordinates and maps supported languages only', () => {
	const fences = extractMarkdownFencesV1([
		'- [ ] inspect example',
		'```ts',
		'const answer = 42;',
		'```',
		'~~~ruby',
		'puts 1',
		'~~~',
	]);
	assert.equal(fences.length, 2);
	assert.deepEqual(fences[0], {
		fenceOrdinal: 1,
		fenceLanguage: 'ts',
		analysisLanguage: 'typescript',
		fenceStartLine: 2,
		fenceEndLine: 4,
		snippet: 'const answer = 42;\n',
	});
	assert.equal(fences[1].fenceLanguage, 'ruby');
	assert.equal(fences[1].analysisLanguage, null);
	assert.deepEqual(normalizeFenceLanguageV1('tsx title="example"'), { tag: 'tsx', language: 'typescript' });
});
