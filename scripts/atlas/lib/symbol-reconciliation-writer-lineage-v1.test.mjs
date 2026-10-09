import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { classifyStructuralSymbolKindV1 } from './structural-symbol-kind-admission-v1.mjs';

const writerPath = new URL('../symbol-reconciliation-writer-v1.mts', import.meta.url);

test('symbol reconciliation only counts Graphify symbols bound to exact admitted source revisions', () => {
  const source = fs.readFileSync(writerPath, 'utf8');
  const grounding = source.match(/async function checkGrounding[\s\S]*?(?=\nasync function main\()/);
  assert.ok(grounding, 'checkGrounding owner exists');
  assert.match(grounding[0], /FROM atlas_workspace_source_bindings b/);
  assert.match(grounding[0], /gf\.code_source_revision = b\.source_revision/);
  assert.match(grounding[0], /b\.workspace_revision = \$1/);
  assert.match(grounding[0], /canonical_source_ref = ANY\(\$2::text\[\]\)/);
});

test('symbol nominations preserve source revision separately from workspace revision', () => {
  const source = fs.readFileSync(writerPath, 'utf8');
  const symbolQuery = source.match(/const symbolRows = await pool\.query\([\s\S]*?\n  \);/);
  assert.ok(symbolQuery, 'revision-qualified Graphify symbol query exists');
  assert.match(symbolQuery[0], /b\.source_revision, b\.workspace_revision/);
  assert.match(symbolQuery[0], /gf\.code_source_revision = b\.source_revision/);

  const nomination = source.match(/return \{[\s\S]*?source_ref: row\.source_ref,[\s\S]*?extractor_revision: 'graphify-symbols-v1',[\s\S]*?\};/);
  assert.ok(nomination, 'symbol nomination mapping exists');
  assert.match(nomination[0], /source_revision: row\.source_revision/);
  assert.match(nomination[0], /workspace_revision: row\.workspace_revision/);
  assert.doesNotMatch(nomination[0], /source_revision: targetWorkspaceRevision/);
  assert.match(source, /authority: 'EXACT_WORKSPACE_SOURCE_BINDING_JOIN'/);
  assert.match(source, /report\.symbolResolutionSummary = \{/);
  assert.match(source, /report\.action = apply && allowCreate \?/);
});

test('unsupported Graphify symbol kinds are excluded instead of coerced to functions', () => {
  const source = fs.readFileSync(writerPath, 'utf8');
  assert.match(source, /classifyStructuralSymbolKindV1\(row\.symbol_kind\)/);
  assert.match(source, /excludedUnsupportedKindCount: unsupportedKinds\.length/);
  assert.match(source, /authority: 'PARENT_ATLAS_STRUCTURAL_SYMBOL_KIND_VALUES'/);
  assert.doesNotMatch(source, /\?\?\s*'function'/);
});

test('canonical structural kinds pass while imports, exports, aliases and unknowns fail closed', () => {
  for (const kind of ['class', 'enum', 'function', 'method', 'type', 'variable']) {
    assert.deepEqual(classifyStructuralSymbolKindV1(kind), { admitted: true, kind });
  }
  for (const kind of ['import', 'export', 'type_alias', 'unrecognized']) {
    assert.deepEqual(classifyStructuralSymbolKindV1(kind), {
      admitted: false,
      reason: 'UNSUPPORTED_STRUCTURAL_SYMBOL_KIND',
    });
  }
  assert.deepEqual(classifyStructuralSymbolKindV1(null), {
    admitted: false,
    reason: 'SYMBOL_KIND_NOT_STRING',
  });
});

test('alternate identity audit requires exact source, revision, span and declaration hash without resolving identity', () => {
  const source = fs.readFileSync(writerPath, 'utf8');
  const audit = source.match(/const exactIdentityCandidates = await pool\.query\([\s\S]*?report\.exactIdentityCandidateAudit = \{[\s\S]*?identityResolutionApplied: false,[\s\S]*?\};/);
  assert.ok(audit, 'bounded diagnostic identity audit exists');
  for (const field of ['source_ref', 'source_revision', 'qualified_name', 'declaration_hash', 'byte_start', 'byte_end']) {
    assert.match(audit[0], new RegExp(`v\\.${field} = n\\.${field}`));
  }
  assert.match(audit[0], /r\.symbol_kind = n\.kind/);
  assert.match(audit[0], /r\.status = 'active'/);
  assert.doesNotMatch(audit[0], /INSERT|UPDATE|DELETE|promote/);
});
