import { z } from 'zod';

export const OAK_CONTEXT_MANIFEST_ACE_V1 = 'parent-atlas.context-manifest.ace.v1' as const;

export const oakContextManifestInputV1Schema = z.object({
  context: z.record(z.string(), z.unknown()),
  options: z.object({
    request_id: z.string().min(1),
    feature_id: z.string().min(1).optional(),
    source_refs: z.array(z.string().min(1)).optional(),
    now: z.string().datetime().optional(),
    acePlaybookRevision: z.string().min(1).optional(),
  }).passthrough(),
}).strict();

export type OakContextManifestInputV1 = z.infer<typeof oakContextManifestInputV1Schema>;
