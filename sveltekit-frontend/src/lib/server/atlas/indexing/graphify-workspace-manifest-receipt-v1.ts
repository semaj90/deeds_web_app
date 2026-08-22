import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

const bindingSchema = z.object({
  sourceRef: z.string().min(1),
  sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  contentDigest: sha256,
}).strict();
const expectedEntrySchema = bindingSchema.extend({
  byteLength: z.number().int().nonnegative(),
  gitBlobOid: z.string().min(1).nullable().default(null),
});

export const graphifyWorkspaceManifestReceiptV1Schema = z.object({
  schema: z.literal('atlas.graphify-workspace-manifest-receipt.v1'),
  workspaceManifestRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  workspaceManifestDigest: sha256,
  workspaceManifestSourceCount: z.number().int().nonnegative(),
  persistedSourceCount: z.number().int().nonnegative(),
  persistedExactRevisionCount: z.number().int().nonnegative(),
  persistedExactDigestCount: z.number().int().nonnegative(),
  parserContractVersion: z.string().min(1),
  writerRevision: z.string().min(1),
  complete: z.boolean(),
  readOnlyObservation: z.literal(true),
  canonicalAuthority: z.literal(false),
  checksum: sha256,
}).strict();

export type GraphifyWorkspaceManifestReceiptV1 = z.infer<typeof graphifyWorkspaceManifestReceiptV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

type ExpectedEntry = z.infer<typeof expectedEntrySchema>;
type PersistedEntry = z.infer<typeof bindingSchema>;

export function buildGraphifyWorkspaceManifestReceiptV1(input: {
  workspaceRecord: { workspaceRevision: string; sourceManifestDigest: string; sourceCount: number };
  expectedEntries: readonly ExpectedEntry[];
  persistedBindings: readonly PersistedEntry[];
  parserContractVersion: string;
  writerRevision: string;
}): GraphifyWorkspaceManifestReceiptV1 {
  const expected = input.expectedEntries.map((entry) => expectedEntrySchema.parse(entry)).sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  const persisted = input.persistedBindings.map((entry) => bindingSchema.parse(entry));
  const byRef = new Map(persisted.map((entry) => [entry.sourceRef, entry]));
  const exactRevisionCount = expected.filter((entry) => byRef.get(entry.sourceRef)?.sourceRevision === entry.sourceRevision).length;
  const exactDigestCount = expected.filter((entry) => byRef.get(entry.sourceRef)?.contentDigest === entry.contentDigest).length;
  const payload = {
    schema: 'atlas.graphify-workspace-manifest-receipt.v1' as const,
    workspaceManifestRevision: input.workspaceRecord.workspaceRevision,
    workspaceManifestDigest: input.workspaceRecord.sourceManifestDigest,
    workspaceManifestSourceCount: input.workspaceRecord.sourceCount,
    persistedSourceCount: persisted.length,
    persistedExactRevisionCount: exactRevisionCount,
    persistedExactDigestCount: exactDigestCount,
    parserContractVersion: input.parserContractVersion,
    writerRevision: input.writerRevision,
    complete: persisted.length === expected.length
      && exactRevisionCount === expected.length
      && exactDigestCount === expected.length,
    readOnlyObservation: true as const,
    canonicalAuthority: false as const,
  };
  return graphifyWorkspaceManifestReceiptV1Schema.parse({ ...payload, checksum: digest(payload) });
}
