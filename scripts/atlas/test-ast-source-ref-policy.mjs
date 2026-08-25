import assert from 'node:assert/strict';
import { buildAstSourceRefKey } from './lib/ast-source-ref-key.mjs';
import { AST_SOURCE_REF_POLICY_V1, buildPolicySourceRefKey, normalizeAstSourceRefForPolicy } from './lib/ast-source-ref-policy.mjs';

assert.equal(AST_SOURCE_REF_POLICY_V1, 'ACTIVE_APP_RELATIVE_V1');
assert.equal(normalizeAstSourceRefForPolicy('$lib/server/atlas/domain-taxonomy.ts'), 'src/lib/server/atlas/domain-taxonomy.ts');
assert.equal(normalizeAstSourceRefForPolicy('sveltekit-frontend/src/lib/example.ts'), 'src/lib/example.ts');
assert.equal(normalizeAstSourceRefForPolicy('sveltekit-frontend/scripts/atlas/example.mjs'), 'scripts/atlas/example.mjs');
assert.equal(normalizeAstSourceRefForPolicy('src/lib/example.ts'), 'src/lib/example.ts');
assert.equal(
  buildPolicySourceRefKey('sveltekit-frontend/src/lib/example.ts', 'function', 'run', buildAstSourceRefKey),
  'src/lib/example.ts#function:run',
);

console.log(JSON.stringify({ schema: 'atlas.ast-source-ref-policy-proof.v1', status: 'PASS', policy: AST_SOURCE_REF_POLICY_V1, canonicalWrites: false }));
