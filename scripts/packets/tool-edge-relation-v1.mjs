const relationByObservation = Object.freeze({
  api_route: 'HANDLES_ENDPOINT',
  mcp_tool: 'REGISTERS_TOOL',
  tool_call: 'USES_TOOL',
  tool_ref: 'REFERENCES_MCP',
});

export function relationForToolObservationV1(type) {
  return relationByObservation[type] ?? 'UNCLASSIFIED_TOOL_OBSERVATION';
}
