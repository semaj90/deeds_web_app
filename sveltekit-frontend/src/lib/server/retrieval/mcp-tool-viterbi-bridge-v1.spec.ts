import { describe, expect, it } from 'vitest';
import { adaptMcpToolRegistryIndexV1, proposeMcpToolFromRegistryIndexV1, proposeMcpToolWithViterbiV1 } from './mcp-tool-viterbi-bridge-v1.js';

const registry = [
  { toolId: 'trace-search', mcpName: 'trace.kag_search', registryRevision: 'registry:v1', readOnly: true },
  { toolId: 'trace-write', mcpName: 'trace.record_outcome', registryRevision: 'registry:v1', readOnly: false },
];

const manifest = {
  content_revision: 'sha256:registry',
  content_checksum: 'sha256:registry',
  tools: [{ tool_name: 'trace.kag_search', permissions: 'read_only', writes_to: [] }],
} as const;

describe('mcp-tool-viterbi-bridge-v1', () => {
  it('returns a read-only tool proposal bound to the registry revision', () => {
    const result = proposeMcpToolWithViterbiV1({
      registry,
      registryRevision: 'registry:v1',
      frames: [
        { revision: 'obs:v1', candidates: [{ id: 'trace-search', value: { toolId: 'trace-search', mcpName: 'trace.kag_search' }, emissionScore: 0.9 }] },
      ],
    });
    expect(result.status).toBe('PROPOSED');
    expect(result.mcpName).toBe('trace.kag_search');
    expect(result.executionPerformed).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects an unknown registry tool', () => {
    expect(() => proposeMcpToolWithViterbiV1({
      registry,
      registryRevision: 'registry:v1',
      frames: [{ revision: 'obs:v1', candidates: [{ id: 'missing', value: { toolId: 'missing', mcpName: 'missing.tool' }, emissionScore: 1 }] }],
    })).toThrow('MCP_TOOL_REGISTRY_UNKNOWN_TOOL:missing');
  });

  it('rejects a write-capable proposal before execution', () => {
    expect(() => proposeMcpToolWithViterbiV1({
      registry,
      registryRevision: 'registry:v1',
      frames: [{ revision: 'obs:v1', candidates: [{ id: 'trace-write', value: { toolId: 'trace-write', mcpName: 'trace.record_outcome' }, emissionScore: 1 }] }],
    })).toThrow('MCP_TOOL_WRITE_CAPABLE_REQUIRES_APPROVAL:trace-write');
  });

  it('adapts the checksummed manifest and binds the proposal to it', () => {
    expect(adaptMcpToolRegistryIndexV1(manifest).registryRevision).toBe('sha256:registry');
    const result = proposeMcpToolFromRegistryIndexV1({
      manifest,
      frames: [{ revision: 'obs:v1', candidates: [{ id: 'trace.kag_search', value: { toolId: 'trace.kag_search', mcpName: 'trace.kag_search' }, emissionScore: 1 }] }],
    });
    expect(result.registryRevision).toBe('sha256:registry');
    expect(result.executionPerformed).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects an unrevisioned or mismatched manifest', () => {
    expect(() => adaptMcpToolRegistryIndexV1({ ...manifest, content_checksum: 'sha256:other' })).toThrow('MCP_TOOL_REGISTRY_MANIFEST_REVISION_INVALID');
  });
});
