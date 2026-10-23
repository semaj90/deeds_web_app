import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateOneSourceApplyGate } from './one-source-ast-apply-gate-v1.mjs';

const sourceRef = 'packages/atlas-core/src/langgraph/kanban-error-fixing-agent.ts';
const plan = {
  schema: 'atlas.one-source-ast-node-write-plan.v1',
  writesPerformed: false,
  source: { sourceRef, sourceRevision: 'sha256:602c58c20fe982d0ab26c58f32ac4d55cef70ae6397e10d0d7aa2f779d3b34d3', workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc' },
};
const planSha256 = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const node = { kind: 'function', qualifiedSymbol: 'classifyErrorFixingTasks', startByte: 3608, endByte: 4140, startLine: 128, endLine: 147 };
const goodAuth = {
  schema: 'atlas.one-source-ast-write-authorization.v1', planSha256, sourceRef,
  workspaceRevision: plan.source.workspaceRevision, workspaceId: '625743d2-092b-4fa8-abe0-9dc094920c80',
  operator: 'reviewer', parserVersion: 'ast-grep-napi-graphify-yaml-v2', nodes: [node],
};
const goodEnv = { ATLAS_AUTHORIZE_ONE_SOURCE_AST_WRITE: '1', ATLAS_ONE_SOURCE_DATABASE_URL: 'postgres://example' };
const run = (overrides = {}, env = goodEnv) => evaluateOneSourceApplyGate({
  plan, authorization: { ...goodAuth, ...overrides }, planSha256, env,
});

test('no authorization is refused', () => {
  const r = evaluateOneSourceApplyGate({ plan, authorization: null, planSha256, env: goodEnv });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('AUTHORIZATION_SCHEMA_INVALID'));
});

test('wrong plan digest is refused', () => {
  const r = run({ planSha256: 'f'.repeat(64) });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('AUTHORIZATION_PLAN_CHECKSUM_MISMATCH'));
});

test('source mismatch (other file) is refused', () => {
  const r = run({ sourceRef: 'packages/other.ts' });
  assert.ok(r.reasons.includes('AUTHORIZATION_SOURCE_MISMATCH'));
});

test('workspace mismatch is refused', () => {
  const r = run({ workspaceRevision: 'sha256:' + '0'.repeat(64) });
  assert.ok(r.reasons.includes('AUTHORIZATION_WORKSPACE_MISMATCH'));
});

test('missing operator is refused', () => {
  const r = run({ operator: '' });
  assert.ok(r.reasons.includes('OPERATOR_REQUIRED'));
});

test('env gate unset is refused', () => {
  const r = run({}, { ATLAS_ONE_SOURCE_DATABASE_URL: 'postgres://example' });
  assert.ok(r.reasons.includes('ENV_GATE_NOT_SET'));
});

test('missing exact-row nodes are refused', () => {
  const r = run({ nodes: [] });
  assert.ok(r.reasons.includes('AUTHORIZATION_NODES_REQUIRED'));
});

test('missing database URL is refused', () => {
  const r = run({}, { ATLAS_AUTHORIZE_ONE_SOURCE_AST_WRITE: '1' });
  assert.ok(r.reasons.includes('DATABASE_URL_REQUIRED'));
});

test('a fully valid authorization passes evaluation but the CLI still refuses (writer not enabled)', () => {
  const r = run();
  assert.equal(r.allowed, true, 'evaluation passes; the CLI keeps refusing until the apply path is reviewed');
});
