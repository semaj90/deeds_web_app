import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOkfFile, evaluateOkfProfileReadiness, extractOkfDeclaredDocument, normalizeOkfEvidencePath, probeOkfSyntax, reconcileOkfAudit, resolveOkfManifestBinding } from './okf-reconciliation-core.mjs';

const invalidMd = (path) => ({ path, status: 'INVALID_V02_PROFILE', reasonCodes: ['MARKDOWN_FRONTMATTER_MISSING'] });
const missing = (path) => ({ path, status: 'INVALID_V02_PROFILE', reasonCodes: ['REQUIRED_FIELD_MISSING:provenance'] });
const excluded = (path) => ({ path, status: 'EXCLUDED_FROM_V02_PROFILE', reasonCodes: ['UNSUPPORTED_EXTENSION_FOR_V02_PROFILE'] });

test('evidence path normalization preserves docs/.okf schemas and resolves repository .okf paths', () => {
  assert.equal(normalizeOkfEvidencePath('docs/.okf/schema.yaml'), 'docs/.okf/schema.yaml');
  assert.equal(normalizeOkfEvidencePath('C:\\repo\\docs\\.okf\\schema.yaml'), 'docs/.okf/schema.yaml');
  assert.equal(normalizeOkfEvidencePath('/workspace/repo/.okf/indexes/a.yaml'), '.okf/indexes/a.yaml');
  assert.equal(normalizeOkfEvidencePath('.okf/indexes/a.yaml'), '.okf/indexes/a.yaml');
  assert.equal(normalizeOkfEvidencePath('docs/other/readme.md'), 'docs/other/readme.md');
  assert.equal(normalizeOkfEvidencePath(undefined), null);
});

test('snapshot pages are out of scope whether valid-looking, invalid or excluded', () => {
  for (const file of [invalidMd('.okf/docs/dspy/snapshots/s1/a.md'), excluded('.okf/docs/dspy/snapshots/s1/a.html')]) {
    assert.equal(classifyOkfFile(file), 'EXTERNAL_SNAPSHOT_OUT_OF_PROFILE_SCOPE');
  }
});

test('a hand-authored record missing fields stays a record defect, not a scope finding', () => {
  assert.equal(classifyOkfFile(missing('.okf/systems/a.yaml')), 'RECORD_MISSING_V02_FIELDS');
  assert.equal(classifyOkfFile(invalidMd('.okf/docs/other/readme.md')), 'RECORD_FRONTMATTER_MISSING');
  assert.equal(classifyOkfFile({ path: '.okf/x.yaml', status: 'VALID_V02_PROFILE' }), 'UNCLASSIFIED');
});

test('excluded schema/catalog JSON is separated from other unsupported types', () => {
  assert.equal(classifyOkfFile(excluded('.okf/schemas/x.schema.json')), 'UNSUPPORTED_FILE_TYPE_SCHEMA_OR_CATALOG');
  assert.equal(classifyOkfFile(excluded('.okf/misc/notes.txt')), 'UNSUPPORTED_FILE_TYPE_OTHER');
});

test('every file lands in exactly one cause and totals reconcile', () => {
  const files = [invalidMd('.okf/docs/dspy/snapshots/s/a.md'), missing('.okf/systems/a.yaml'), excluded('.okf/schemas/x.json'), excluded('.okf/misc/a.txt'), { path: '.okf/y.yaml', status: 'VALID_V02_PROFILE' }];
  const result = reconcileOkfAudit(files);
  assert.equal(result.total, 5);
  assert.equal(Object.values(result.byCause).reduce((n, c) => n + c.files, 0), 5);
  assert.equal(result.unclassified, 1);
  assert.equal(result.perFile.length, 5);
});

test('manifest binding distinguishes listed files, unbound registry members and unknown paths', () => {
  const registries = {
    domains: { path: 'domains/', schema_files: { 'approved.yaml': '../schemas/domain.schema.json' }, schemas: ['approved.yaml', 'unbound.yaml'] },
    tools: { path: 'tools/', schemas: [] },
  };
  assert.deepEqual(resolveOkfManifestBinding('.okf/domains/approved.yaml', registries), {
    registry: 'domains', declaredMember: true, declaredEntry: 'approved.yaml',
    schemaReference: '../schemas/domain.schema.json', schemaPath: '.okf/schemas/domain.schema.json',
    bindings: [{ registry: 'domains', declaredMember: true, declaredEntry: 'approved.yaml', schemaReference: '../schemas/domain.schema.json', schemaPath: '.okf/schemas/domain.schema.json', status: 'MANIFEST_SCHEMA_DECLARED_OWNER_RECEIPT_REQUIRED' }],
    status: 'MANIFEST_SCHEMA_DECLARED_OWNER_RECEIPT_REQUIRED',
  });
  assert.equal(resolveOkfManifestBinding('.okf/domains/unbound.yaml', registries).status, 'MANIFEST_MEMBER_WITHOUT_SCHEMA_BINDING');
  assert.equal(resolveOkfManifestBinding('.okf/tools/unlisted.md', registries).status, 'REGISTRY_PATH_NOT_LISTED');
  assert.equal(resolveOkfManifestBinding('.okf/other/file.yaml', registries).status, 'NO_MANIFEST_REGISTRY_BINDING');
  assert.equal(resolveOkfManifestBinding('.okf/indexes/feature-intelligence.yaml', {
    indexes: { path: 'indexes/', schemas: ['feature-intelligence.yaml'] },
    domains: { path: 'domains/', schemas: [{ path: '../indexes/feature-intelligence.yaml' }], schema_file: '../schemas/domain.schema.json' },
  }).status, 'MULTIPLE_MANIFEST_BINDINGS');
});

test('syntax probes report parse facts without asserting an intended schema', () => {
  const parseYaml = (text) => {
    if (text.includes('duplicate:')) throw new Error('DUPLICATE_KEY');
    if (text === 'bad') throw new Error('INVALID_YAML');
  };
  assert.equal(probeOkfSyntax('.okf/docs/dspy/corpus.json', '{"ok":true}', { parseYaml }).status, 'JSON_SYNTAX_VALID');
  assert.equal(probeOkfSyntax('.okf/docs/dspy/corpus.json', '{', { parseYaml }).status, 'JSON_SYNTAX_INVALID');
  assert.equal(probeOkfSyntax('.okf/systems/a.yaml', 'duplicate:\nduplicate:', { parseYaml }).status, 'YAML_SYNTAX_INVALID');
  assert.equal(probeOkfSyntax('.okf/systems/a.md', '---\ntitle: A\n---\nbody', { parseYaml }).status, 'MARKDOWN_FRONTMATTER_SYNTAX_VALID');
  assert.equal(probeOkfSyntax('.okf/systems/a.md', '# Plain documentation', { parseYaml }).status, 'MARKDOWN_BODY_PROFILE_UNASSERTED');
  assert.equal(probeOkfSyntax('.okf/systems/a.html', '<h1>Text</h1>', { parseYaml }).status, 'SYNTAX_PROBE_NOT_APPLICABLE');
});

test('syntax success alone cannot satisfy intended-profile readiness', () => {
  const result = evaluateOkfProfileReadiness([{ syntaxObservation: { status: 'YAML_SYNTAX_VALID', schemaAsserted: false } }]);
  assert.equal(result.status, 'OKF_PROFILE_RECONCILIATION_INCOMPLETE');
  assert.equal(result.firstUnresolvedBlocker, 'OKF_INTENDED_PROFILE_OWNER_VALIDATION_MISSING');
});

test('declared document identity is distinct from the profile applied by the audit', () => {
  const declaration = extractOkfDeclaredDocument('.okf/pipelines/example.yaml', 'schema: atlas.pipeline.v1\nversion: 2\n', {
    parseYaml: () => ({ schema: 'atlas.pipeline.v1', version: 2 }),
  });
  assert.deepEqual(declaration, {
    status: 'DECLARATION_PARSED', source: 'yaml', type: null, schema: 'atlas.pipeline.v1', version: 2, id: null,
  });
  assert.equal(extractOkfDeclaredDocument('.okf/docs/readme.md', '# text', {}).status, 'DECLARATION_NO_FRONTMATTER');
});

test('stale, rejected, missing and unknown profile evidence fail with explicit blockers', () => {
  for (const [status, expected] of [
    ['STALE_SOURCE_EVIDENCE', 'OKF_OWNER_RECEIPT_SOURCE_STALE'],
    ['STALE_VALIDATOR_EVIDENCE', 'OKF_OWNER_RECEIPT_VALIDATOR_STALE'],
    ['STALE_SCHEMA_EVIDENCE', 'OKF_OWNER_RECEIPT_SCHEMA_STALE'],
    ['SCHEMA_REJECTED', 'OKF_INTENDED_PROFILE_REJECTED_REQUIRES_OWNER_REVIEW'],
    ['PROFILE_CONTRACT_REJECTED', 'OKF_INTENDED_PROFILE_REJECTED_REQUIRES_OWNER_REVIEW'],
    ['OWNER_VALIDATION_MISSING', 'OKF_INTENDED_PROFILE_OWNER_VALIDATION_MISSING'],
    ['UNEXPECTED_STATUS', 'OKF_OWNER_VALIDATION_STATUS_UNRECOGNIZED'],
  ]) {
    const result = evaluateOkfProfileReadiness([{ ownerValidation: { status } }]);
    assert.equal(result.status, 'OKF_PROFILE_RECONCILIATION_INCOMPLETE');
    assert.equal(result.firstUnresolvedBlocker, expected);
    assert.equal(result.profileApplicabilityStatus, 'PARTIAL');
  }
});

test('profile readiness requires reconciled inventory and accepts only established evidence', () => {
  const passing = evaluateOkfProfileReadiness([
    { ownerValidation: { status: 'PASS_CURRENT_SOURCE_AND_SCHEMA' } },
    { ownerValidation: { status: 'PASS_CURRENT_SOURCE_AND_PROFILE' } },
    { ownerValidation: { status: 'GIT_BLOB_VERIFIED_WORKTREE_EOL_TRANSFORMED' } },
  ]);
  assert.equal(passing.status, 'OKF_PROFILE_RECONCILIATION_READ_ONLY_VERIFIED');
  assert.equal(passing.firstUnresolvedBlocker, 'NONE');
  assert.equal(evaluateOkfProfileReadiness([], { inventoryReconciled: false }).firstUnresolvedBlocker, 'OKF_INVENTORY_RECONCILIATION_FAILED');
});
