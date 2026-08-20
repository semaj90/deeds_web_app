import { createHash } from 'node:crypto';
import { z } from 'zod';

export const OkfProjectionLifecycleV1Schema = z.enum([
  'PROVEN',
  'IMPLEMENTED_UNPROVEN',
  'DEGRADED',
  'BLOCKED',
  'SUPERSEDED',
  'ARCHIVED',
]);
export type OkfProjectionLifecycleV1 = z.infer<typeof OkfProjectionLifecycleV1Schema>;

export const OkfProjectionV1Schema = z.object({
  schema: z.literal('atlas.okf-projection.v1'),
  resource: z.string().min(1),
  title: z.string().min(1),
  knowledgeType: z.enum(['CONTRACT', 'PIPELINE', 'API', 'EVIDENCE', 'GAP', 'REPRESENTATION']),
  lifecycle: OkfProjectionLifecycleV1Schema,
  sourceRef: z.string().min(1),
  workspaceRevision: z.string().min(1).nullable(),
  sourceRevision: z.string().min(1).nullable(),
  producerRevision: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
  tags: z.array(z.string().min(1)),
  bodyMarkdown: z.string(),
  canonicalAuthority: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type OkfProjectionV1 = z.infer<typeof OkfProjectionV1Schema>;

export const OkfRenderedArtifactV1Schema = z.object({
  schema: z.literal('atlas.okf-rendered-artifact.v1'),
  resource: z.string().min(1),
  relativePath: z.string().min(1),
  markdown: z.string().min(1),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  canonicalAuthority: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type OkfRenderedArtifactV1 = z.infer<typeof OkfRenderedArtifactV1Schema>;

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'knowledge';
}

function directoryFor(type: OkfProjectionV1['knowledgeType']): string {
  switch (type) {
    case 'CONTRACT': return 'contracts';
    case 'PIPELINE': return 'pipelines';
    case 'API': return 'api';
    case 'EVIDENCE': return 'evidence';
    case 'GAP': return 'gaps';
    case 'REPRESENTATION': return 'representations';
  }
}

/**
 * Pure OKF-style Markdown projection. Postgres/Parent Atlas evidence remains
 * canonical; this artifact is an agent/human-readable projection that links
 * back to revision-qualified evidence and executable schema sources.
 */
export function renderOkfProjectionV1(value: OkfProjectionV1): OkfRenderedArtifactV1 {
  const input = OkfProjectionV1Schema.parse(value);
  const evidenceRefs = [...new Set(input.evidenceRefs)].sort();
  const tags = [...new Set(input.tags)].sort();
  const frontmatter = [
    '---',
    `type: ${yamlString(`Parent Atlas ${input.knowledgeType}`)}`,
    `title: ${yamlString(input.title)}`,
    `resource: ${yamlString(input.resource)}`,
    `lifecycle: ${yamlString(input.lifecycle)}`,
    `source_ref: ${yamlString(input.sourceRef)}`,
    `workspace_revision: ${input.workspaceRevision === null ? 'null' : yamlString(input.workspaceRevision)}`,
    `source_revision: ${input.sourceRevision === null ? 'null' : yamlString(input.sourceRevision)}`,
    `producer_revision: ${yamlString(input.producerRevision)}`,
    'canonical_authority: false',
    'canonical_writes_allowed: false',
    `tags: [${tags.map(yamlString).join(', ')}]`,
    'evidence_refs:',
    ...(evidenceRefs.length > 0 ? evidenceRefs.map((ref) => `  - ${yamlString(ref)}`) : ['  []']),
    '---',
  ].join('\n');

  const markdown = `${frontmatter}\n\n# ${input.title}\n\n${input.bodyMarkdown.trim()}\n`;
  const contentDigest = createHash('sha256').update(markdown, 'utf8').digest('hex');
  return OkfRenderedArtifactV1Schema.parse({
    schema: 'atlas.okf-rendered-artifact.v1',
    resource: input.resource,
    relativePath: `docs/.okf/parent-atlas/${directoryFor(input.knowledgeType)}/${slug(input.title)}.md`,
    markdown,
    contentDigest,
    canonicalAuthority: false,
    canonicalWritesAllowed: false,
  });
}
