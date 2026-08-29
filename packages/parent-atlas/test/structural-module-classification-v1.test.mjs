import assert from 'node:assert/strict';
import test from 'node:test';
import { builtinModules } from 'node:module';
import { classifyModuleSpecifier } from '../../../scripts/atlas/lib/compiler-semantic-resolver-v1.mjs';

test('classifies builtins and external resources as terminal outcomes', () => {
  assert.equal(classifyModuleSpecifier('node:fs'), 'NODE_BUILTIN');
  assert.equal(classifyModuleSpecifier('path'), 'NODE_BUILTIN');
  assert.equal(classifyModuleSpecifier('https://example.test/schema.json'), 'EXTERNAL_RESOURCE');
  assert.equal(classifyModuleSpecifier('./local-module'), 'REPO_RESOLVABLE');
  assert.ok(builtinModules.includes('fs'));
});
