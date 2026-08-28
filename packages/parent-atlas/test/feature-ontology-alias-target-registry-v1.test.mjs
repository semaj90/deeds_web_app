import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAliasTargetRegistry, summarizeAliasTargetRegistry, AliasTargetRegistryClassification as C } from '../../../scripts/atlas/lib/feature-ontology-alias-target-registry-v1.mjs';

test('accepts one literal canonical registry target', () => assert.equal(classifyAliasTargetRegistry({ target: 'sveltekit-frontend/src/a.ts', matches: [{ repo_id: 'repo' }] }), C.CANONICAL_TARGET_REGISTERED_UNIQUE));
test('rejects missing and duplicate targets', () => { assert.equal(classifyAliasTargetRegistry({ target: 'x', matches: [] }), C.CANONICAL_TARGET_MISSING); assert.equal(classifyAliasTargetRegistry({ target: 'x', matches: [{}, {}] }), C.CANONICAL_TARGET_DUPLICATE); });
test('enforces an explicitly requested repository id', () => assert.equal(classifyAliasTargetRegistry({ target: 'x', expectedRepoId: 'repo', matches: [{ repo_id: 'other' }] }), C.REPO_ID_MISMATCH));
test('fails closed on checksum mismatch', () => assert.equal(classifyAliasTargetRegistry({ target: 'x', checksumValid: false, matches: [{ repo_id: 'repo' }] }), C.ALIAS_SELECTION_CHECKSUM_MISMATCH));
test('summarizes registered targets', () => { const result = summarizeAliasTargetRegistry([{ classification: C.CANONICAL_TARGET_REGISTERED_UNIQUE }, { classification: C.CANONICAL_TARGET_MISSING }]); assert.equal(result.registeredUniqueTargets, 1); assert.equal(result.missingTargets, 1); });
