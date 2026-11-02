import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalServiceProbeDefaults } from '../dist/core/service-contract.js';

test('assigns LangExtract to the 8095 NLP sidecar, not Go search on 8096', () => {
	assert.equal(canonicalServiceProbeDefaults.langextract.port, 8095);
	assert.equal(canonicalServiceProbeDefaults.langextract.url, 'http://127.0.0.1:8095');
	assert.notEqual(canonicalServiceProbeDefaults.langextract.port, 8096);
	assert.match(canonicalServiceProbeDefaults.langextract.role, /FastAPI NLP sidecar/);
});
