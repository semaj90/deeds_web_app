import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const ATLAS_MCP_RESOURCE_KINDS = [
  'OKF_DOMAIN',
  'OKF_PREDICATE_SET',
  'SOURCE_SNAPSHOT',
  'EVIDENCE_CLAIM',
  'FEATURE_REGISTRY',
] as const;

export const atlasMcpResourceDescriptorSchema = z.object({
  schema: z.literal('atlas.mcp-resource-descriptor.v1').default('atlas.mcp-resource-descriptor.v1'),
  resource_id: id,
  resource_revision: revision,
  kind: z.enum(ATLAS_MCP_RESOURCE_KINDS),
  uri: z.string().regex(/^atlas:\/\/[a-zA-Z0-9_./:@-]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  mime_type: z.enum(['application/json', 'application/yaml', 'text/markdown']),
  source_ref: z.string().min(1),
  source_revision: revision,
  cacheable: z.boolean().default(true),
  immutable_for_revision: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type AtlasMcpResourceDescriptorV1 = z.infer<typeof atlasMcpResourceDescriptorSchema>;

export const ATLAS_MCP_TOOL_NAMES = [
  'atlas.search',
  'atlas.evidence.get',
  'atlas.graph.expand',
  'atlas.source.read',
  'atlas.artifact.hydrate',
  'atlas.claim.verify',
  'atlas.feature.inspect',
  'atlas.cluster.inspect',
  'atlas.patch.propose',
  'atlas.patch.validate',
  'atlas.patch.apply',
] as const;

export const atlasMcpToolDescriptorSchema = z.object({
  schema: z.literal('atlas.mcp-tool-descriptor.v1').default('atlas.mcp-tool-descriptor.v1'),
  name: z.enum(ATLAS_MCP_TOOL_NAMES),
  behavior: z.enum(['READ_ONLY', 'PROPOSAL', 'VALIDATION', 'MUTATION']),
  description: z.string().min(1),
  input_schema_ref: z.string().min(1),
  output_schema_ref: z.string().min(1),
  validation_receipt_required: z.boolean(),
  mutation_authorization_required: z.boolean(),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.behavior === 'MUTATION' && (!value.validation_receipt_required || !value.mutation_authorization_required)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'mutation tools require validation and explicit mutation authorization' });
  }
  if (value.behavior === 'READ_ONLY' && value.mutation_authorization_required) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'read-only tool cannot require mutation authorization' });
  }
});
export type AtlasMcpToolDescriptorV1 = z.infer<typeof atlasMcpToolDescriptorSchema>;

export const atlasMcpSurfaceManifestSchema = z.object({
  schema: z.literal('atlas.mcp-surface-manifest.v1').default('atlas.mcp-surface-manifest.v1'),
  manifest_revision: revision,
  resources: z.array(atlasMcpResourceDescriptorSchema),
  tools: z.array(atlasMcpToolDescriptorSchema),
  transport_binding: z.enum(['PROTOCOL_NEUTRAL', 'MCP_LEGACY_V1', 'MCP_2026_07_28']).default('PROTOCOL_NEUTRAL'),
  current_server_migration_required: z.boolean().default(true),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type AtlasMcpSurfaceManifestV1 = z.infer<typeof atlasMcpSurfaceManifestSchema>;

export function buildDefaultAtlasMcpSurface(manifestRevision: string): AtlasMcpSurfaceManifestV1 {
  const resources: AtlasMcpResourceDescriptorV1[] = [
    {
      schema: 'atlas.mcp-resource-descriptor.v1',
      resource_id: 'okf-domain-retrieval',
      resource_revision: manifestRevision,
      kind: 'OKF_DOMAIN',
      uri: 'atlas://okf/domains/retrieval',
      name: 'Atlas retrieval ontology',
      description: 'Revisioned .okf retrieval-domain vocabulary and authority manifest.',
      mime_type: 'application/yaml',
      source_ref: 'docs/.okf/domains/retrieval',
      source_revision: manifestRevision,
      cacheable: true,
      immutable_for_revision: true,
      canonical_authority: false,
    },
    {
      schema: 'atlas.mcp-resource-descriptor.v1',
      resource_id: 'okf-domain-structured-value',
      resource_revision: manifestRevision,
      kind: 'OKF_DOMAIN',
      uri: 'atlas://okf/domains/structured-value',
      name: 'Atlas structured-value ontology',
      description: 'Revisioned .okf structured-value vocabulary and ownership manifest.',
      mime_type: 'application/yaml',
      source_ref: 'docs/.okf/domains/structured-value',
      source_revision: manifestRevision,
      cacheable: true,
      immutable_for_revision: true,
      canonical_authority: false,
    },
    {
      schema: 'atlas.mcp-resource-descriptor.v1',
      resource_id: 'okf-domain-feature-intelligence',
      resource_revision: manifestRevision,
      kind: 'OKF_DOMAIN',
      uri: 'atlas://okf/domains/feature-intelligence',
      name: 'Atlas feature-intelligence ontology',
      description: 'Revisioned .okf feature-intelligence vocabulary and promotion constraints.',
      mime_type: 'application/yaml',
      source_ref: 'docs/.okf/domains/feature-intelligence',
      source_revision: manifestRevision,
      cacheable: true,
      immutable_for_revision: true,
      canonical_authority: false,
    },
  ].map((resource) => atlasMcpResourceDescriptorSchema.parse(resource));

  const tool = (
    name: AtlasMcpToolDescriptorV1['name'],
    behavior: AtlasMcpToolDescriptorV1['behavior'],
    description: string,
    validationReceiptRequired: boolean,
    mutationAuthorizationRequired: boolean,
  ): AtlasMcpToolDescriptorV1 => atlasMcpToolDescriptorSchema.parse({
    name,
    behavior,
    description,
    input_schema_ref: `atlas://schemas/tools/${name}/input`,
    output_schema_ref: `atlas://schemas/tools/${name}/output`,
    validation_receipt_required: validationReceiptRequired,
    mutation_authorization_required: mutationAuthorizationRequired,
    canonical_authority: false,
  });

  return atlasMcpSurfaceManifestSchema.parse({
    manifest_revision: manifestRevision,
    resources,
    tools: [
      tool('atlas.search', 'READ_ONLY', 'Search revisioned Atlas lexical, semantic, AST and graph projections.', false, false),
      tool('atlas.evidence.get', 'READ_ONLY', 'Fetch exact revision-qualified evidence and provenance.', false, false),
      tool('atlas.graph.expand', 'READ_ONLY', 'Expand lossless graph/N-ary neighborhoods under bounded hop budgets.', false, false),
      tool('atlas.source.read', 'READ_ONLY', 'Read exact source spans from a revision-qualified source reference.', false, false),
      tool('atlas.artifact.hydrate', 'READ_ONLY', 'Hydrate a checksum-verified cold artifact into a bounded working cache.', false, false),
      tool('atlas.claim.verify', 'VALIDATION', 'Validate a derived claim against exact evidence and emit a verification receipt.', true, false),
      tool('atlas.feature.inspect', 'READ_ONLY', 'Inspect exact/derived feature blocks for a canonical candidate row.', false, false),
      tool('atlas.cluster.inspect', 'READ_ONLY', 'Inspect KMeans/SOM/community assignments as derived routing hints.', false, false),
      tool('atlas.patch.propose', 'PROPOSAL', 'Create a noncanonical guarded file-mutation proposal.', true, false),
      tool('atlas.patch.validate', 'VALIDATION', 'Validate a proposed patch and emit validator evidence.', true, false),
      tool('atlas.patch.apply', 'MUTATION', 'Apply a checksum-guarded validated patch after explicit authorization.', true, true),
    ],
    transport_binding: 'PROTOCOL_NEUTRAL',
    current_server_migration_required: true,
    canonical_authority: false,
  });
}

export function describeOkfMcpSurface(): string {
  return [
    '.okf ontology/schema surfaces are modeled as cacheable MCP Resources, while search/evidence/graph/hydration and mutation operations are modeled as MCP Tools.',
    'The manifest is protocol-neutral because the current application MCP bridge still uses the legacy v1 SDK/server shape; modern MCP transport registration is a separate migration proof.',
    'Ornith may consume these resources/tools through a ContextManifest, but neither the model nor the MCP transport becomes an authority for canonical identity, evidence, or mutation.',
  ].join(' ');
}
