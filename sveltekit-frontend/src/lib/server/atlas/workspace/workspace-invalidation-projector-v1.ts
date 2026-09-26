import { z } from 'zod';
import { WorkspaceInvalidationV1Schema, type WorkspaceInvalidationV1, type WorkspaceEventV1 } from './workspace-event-sourcing-v1.js';

const checksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

export const WorkspaceDependencyArtifactKindSchema = z.enum(['PACKET', 'CHUNK', 'FEATURE', 'REPRESENTATION', 'GRAPH', 'CACHE']);
export type WorkspaceDependencyArtifactKind = z.infer<typeof WorkspaceDependencyArtifactKindSchema>;

export const WorkspaceDependencyEdgeV1Schema = z
  .object({
    dependencySourceRef: z.string().min(1),
    dependencySourceRevision: z.string().min(1),
    dependentCanonicalId: z.string().min(1),
    dependentKind: WorkspaceDependencyArtifactKindSchema,
    dependentRevision: z.string().min(1).nullable(),
  })
  .strict();
export type WorkspaceDependencyEdgeV1 = z.infer<typeof WorkspaceDependencyEdgeV1Schema>;

export const WorkspaceInvalidationProjectionV1Schema = z
  .object({
    schema: z.literal('atlas.workspace-invalidation-projection.v1'),
    eventId: z.string().uuid(),
    workspaceHeadRevision: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    invalidations: z.array(WorkspaceInvalidationV1Schema),
    affectedCount: z.number().int().nonnegative(),
    unrelatedDependencyCount: z.number().int().nonnegative(),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  })
  .strict();
export type WorkspaceInvalidationProjectionV1 = z.infer<typeof WorkspaceInvalidationProjectionV1Schema>;

export function projectWorkspaceInvalidationsV1(input: {
  event: WorkspaceEventV1;
  sourceRef: string;
  sourceRevision: string;
  dependencies: readonly WorkspaceDependencyEdgeV1[];
}): WorkspaceInvalidationProjectionV1 {
  const dependencies = input.dependencies.map((edge) => WorkspaceDependencyEdgeV1Schema.parse(edge));
  const affected = dependencies.filter((edge) => edge.dependencySourceRef === input.sourceRef && edge.dependencySourceRevision !== input.sourceRevision);
  const unrelatedDependencyCount = dependencies.length - affected.length;
  const invalidations = affected.map((edge) => WorkspaceInvalidationV1Schema.parse({
    schema: 'atlas.workspace-invalidation.v1',
    eventId: input.event.eventId,
    workspaceHeadRevision: input.event.workspaceHeadRevision,
    canonicalId: edge.dependentCanonicalId,
    artifactKind: edge.dependentKind,
    reason: input.event.eventType,
    previousRevision: edge.dependentRevision,
    requiredRevision: input.sourceRevision,
    writesPerformed: false,
  }));
  return WorkspaceInvalidationProjectionV1Schema.parse({
    schema: 'atlas.workspace-invalidation-projection.v1',
    eventId: input.event.eventId,
    workspaceHeadRevision: input.event.workspaceHeadRevision,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    invalidations,
    affectedCount: invalidations.length,
    unrelatedDependencyCount,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
