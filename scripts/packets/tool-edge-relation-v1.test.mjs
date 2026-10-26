import test from 'node:test';
import assert from 'node:assert/strict';
import { relationForToolObservationV1 } from './tool-edge-relation-v1.mjs';

test('only invocation observations produce USES_TOOL', () => {
  assert.equal(relationForToolObservationV1('tool_call'), 'USES_TOOL');
  assert.equal(relationForToolObservationV1('api_route'), 'HANDLES_ENDPOINT');
  assert.equal(relationForToolObservationV1('mcp_tool'), 'REGISTERS_TOOL');
  assert.equal(relationForToolObservationV1('tool_ref'), 'REFERENCES_MCP');
  assert.equal(relationForToolObservationV1('unknown'), 'UNCLASSIFIED_TOOL_OBSERVATION');
});
