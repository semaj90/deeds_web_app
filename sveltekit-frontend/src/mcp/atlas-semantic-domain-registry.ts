import {
  ATLAS_SEMANTIC_TOOL_DEFINITIONS,
  type AtlasSemanticToolDefinition,
  type AtlasSemanticToolName,
} from '$lib/server/atlas/atlas-semantic-tools.js';

export type AtlasSemanticMcpDomain = 'context' | 'actions';

export const ATLAS_CONTEXT_TOOL_NAMES = Object.freeze([
  'atlas.discover',
  'atlas.retrieve',
  'atlas.build_context',
  'atlas.inspect_runtime',
] satisfies readonly AtlasSemanticToolName[]);

export const ATLAS_ACTION_TOOL_NAMES = Object.freeze([
  'atlas.apply_change',
  'atlas.validate_change',
  'atlas.delegate',
] satisfies readonly AtlasSemanticToolName[]);

const domainToolNames: Record<AtlasSemanticMcpDomain, readonly AtlasSemanticToolName[]> = {
  context: ATLAS_CONTEXT_TOOL_NAMES,
  actions: ATLAS_ACTION_TOOL_NAMES,
};

const definitionByName = new Map(
  ATLAS_SEMANTIC_TOOL_DEFINITIONS.map((definition) => [definition.name, definition] as const),
);

export function getAtlasSemanticDomainTools(domain: AtlasSemanticMcpDomain): AtlasSemanticToolDefinition[] {
  return domainToolNames[domain].map((name) => {
    const definition = definitionByName.get(name);
    if (!definition) throw new Error(`ATLAS_MCP_DOMAIN_TOOL_DEFINITION_MISSING:${domain}:${name}`);
    return definition;
  });
}

export function assertAtlasSemanticDomainPartition(): void {
  const all = [...ATLAS_CONTEXT_TOOL_NAMES, ...ATLAS_ACTION_TOOL_NAMES];
  const unique = new Set(all);
  if (unique.size !== all.length) throw new Error('ATLAS_MCP_DOMAIN_PARTITION_OVERLAP');

  const defined = new Set(ATLAS_SEMANTIC_TOOL_DEFINITIONS.map((tool) => tool.name));
  if (defined.size !== unique.size) {
    throw new Error(`ATLAS_MCP_DOMAIN_PARTITION_COUNT_MISMATCH:defined=${defined.size}:partitioned=${unique.size}`);
  }
  for (const name of defined) {
    if (!unique.has(name)) throw new Error(`ATLAS_MCP_DOMAIN_PARTITION_MISSING:${name}`);
  }
}

assertAtlasSemanticDomainPartition();
