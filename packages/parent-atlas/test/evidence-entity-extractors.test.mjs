import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCanonicalEvidenceEntityExtractor,
  extractOpenSpecEvidenceEntities,
  extractRuntimeEvidenceEntities,
  extractSchemaEvidenceEntities,
  extractTestEvidenceEntities,
} from '../dist/core/evidence-entity-extractors.js';

const base = {
  evidence_id: 'evidence-1',
  evidence_kind: 'schema',
  source_ref: 'schema://legal_ai_db',
  source_revision: 'schema-r1',
  evidence_revision: 'evidence-r1',
  workspace_revision: 'ws-742',
};

test('schema extractor emits canonical table/column/fk/index/policy join keys', () => {
  const facts = extractSchemaEvidenceEntities({
    ...base,
    payload: {
      schema: 'atlas.schema-evidence.v1',
      schema_revision: 'schema-r1',
      tables: [{
        table_id: 'table:cases', identity_status: 'canonical',
        columns: [{ column_id: 'column:cases.owner_id', identity_status: 'canonical' }],
        foreign_keys: [{ foreign_key_id: 'fk:cases.owner', identity_status: 'canonical' }],
        indexes: [{ index_id: 'index:cases.owner', identity_status: 'canonical' }],
        policies: [{ policy_id: 'policy:case-owner', identity_status: 'canonical' }],
      }],
    },
  }, 'schema-extractor-r1');

  assert.deepEqual(new Set(facts.map((item) => item.entity_type)), new Set(['table', 'column', 'foreign_key', 'index', 'database_policy']));
  assert.equal(facts.every((item) => item.producer_revision === 'schema-extractor-r1'), true);
});

test('test extractor keeps static assertions and runtime receipts distinct', () => {
  const facts = extractTestEvidenceEntities({
    ...base,
    evidence_kind: 'test',
    source_ref: 'tests/case-owner.spec.ts',
    payload: {
      schema: 'atlas.test-evidence.v1',
      test_revision: 'test-r1',
      test_id: 'test:case-owner',
      identity_status: 'canonical',
      target: { entity_type: 'route', entity_id: 'route:patch-case', identity_status: 'canonical', role: 'tests', confidence: 1 },
      assertions: [{
        assertion_id: 'assertion:owner-denied', identity_status: 'canonical',
        target: { entity_type: 'database_policy', entity_id: 'policy:case-owner', identity_status: 'canonical', role: 'asserts_policy', confidence: 1 },
      }],
      runtime_receipt: { receipt_id: 'receipt:test-run-77', identity_status: 'canonical', status: 'passed' },
    },
  }, 'test-extractor-r1');

  assert.equal(facts.some((item) => item.entity_type === 'assertion'), true);
  assert.equal(facts.some((item) => item.entity_type === 'runtime_receipt' && item.role === 'test_result:passed'), true);
});

test('OpenSpec extractor preserves parser-owned requirement/scenario/task IDs', () => {
  const facts = extractOpenSpecEvidenceEntities({
    ...base,
    evidence_kind: 'openspec',
    source_ref: 'openspec/specs/auth/spec.md',
    payload: {
      schema: 'atlas.openspec-evidence.v1',
      document_revision: 'openspec-r1',
      requirements: [{ requirement_id: 'REQ-AUTH-001', identity_status: 'canonical' }],
      scenarios: [{ scenario_id: 'SCN-AUTH-OWNER', identity_status: 'canonical', requirement_id: 'REQ-AUTH-001' }],
      tasks: [{ task_id: 'TASK-AUTH-VERIFY', identity_status: 'canonical', requirement_id: 'REQ-AUTH-001', scenario_id: 'SCN-AUTH-OWNER' }],
    },
  }, 'openspec-extractor-r1');

  assert.equal(facts.some((item) => item.entity_id === 'REQ-AUTH-001'), true);
  assert.equal(facts.some((item) => item.entity_id === 'SCN-AUTH-OWNER'), true);
  assert.equal(facts.some((item) => item.entity_id === 'TASK-AUTH-VERIFY'), true);
});

test('runtime extractor requires revisioned canonical tool/action/receipt/resource IDs', () => {
  const facts = extractRuntimeEvidenceEntities({
    ...base,
    evidence_kind: 'runtime',
    source_ref: 'runtime://workflow/wf-1',
    payload: {
      schema: 'atlas.runtime-evidence.v1',
      runtime_revision: 'runtime-r1',
      tool: { tool_id: 'tool:postgres', identity_status: 'canonical' },
      action: { action_id: 'action:query-17', identity_status: 'canonical' },
      receipt: { receipt_id: 'receipt:query-17', identity_status: 'canonical' },
      resources: [{ resource_type: 'table', resource_id: 'table:cases', identity_status: 'canonical', role: 'read_resource' }],
    },
  }, 'runtime-extractor-r1');

  assert.deepEqual(new Set(facts.map((item) => item.entity_type)), new Set(['tool', 'action', 'runtime_receipt', 'table']));
});

test('noncanonical payload identities are rejected instead of hashed into shared join keys', async () => {
  const extractor = createCanonicalEvidenceEntityExtractor({ producer_revision: 'extractor-r1' });
  await assert.rejects(() => extractor.extract({
    ...base,
    payload: {
      schema: 'atlas.schema-evidence.v1',
      schema_revision: 'schema-r1',
      tables: [{ table_id: 'cases', identity_status: 'nominated' }],
    },
  }));
});
