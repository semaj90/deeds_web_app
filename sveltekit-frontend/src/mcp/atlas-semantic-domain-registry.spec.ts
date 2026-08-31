import { describe, expect, it } from 'vitest';

import { ATLAS_SEMANTIC_TOOL_DEFINITIONS } from '$lib/server/atlas/atlas-semantic-tools.js';
import {
  ATLAS_ACTION_TOOL_NAMES,
  ATLAS_CONTEXT_TOOL_NAMES,
  assertAtlasSemanticDomainPartition,
  getAtlasSemanticDomainTools,
} from './atlas-semantic-domain-registry.js';

describe('Atlas semantic MCP domain partition', () => {
  it('partitions all existing Atlas semantic tools exactly once', () => {
    expect(() => assertAtlasSemanticDomainPartition()).not.toThrow();

    const partitioned = [...ATLAS_CONTEXT_TOOL_NAMES, ...ATLAS_ACTION_TOOL_NAMES];
    expect(new Set(partitioned).size).toBe(partitioned.length);
    expect(new Set(partitioned)).toEqual(new Set(ATLAS_SEMANTIC_TOOL_DEFINITIONS.map((tool) => tool.name)));
  });

  it('keeps context discovery read-focused and actions isolated', () => {
    expect(getAtlasSemanticDomainTools('context').map((tool) => tool.name)).toEqual([
      'atlas.discover',
      'atlas.retrieve',
      'atlas.build_context',
      'atlas.inspect_runtime',
    ]);
    expect(getAtlasSemanticDomainTools('actions').map((tool) => tool.name)).toEqual([
      'atlas.apply_change',
      'atlas.validate_change',
      'atlas.delegate',
    ]);
  });
});
