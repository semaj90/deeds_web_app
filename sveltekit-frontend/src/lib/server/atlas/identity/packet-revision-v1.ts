import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PACKET_REVISION_SCHEMA = 'atlas.packet-revision.v1' as const;
export const PACKET_REVISION_DERIVATION_REVISION = 'packet-revision-v1' as const;

const qualifiedRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const contentDigest = z.string().regex(/^[a-f0-9]{64}$/);
const requiredText = z.string().min(1).refine((value) => value.trim() === value, {
  message: 'must not contain leading or trailing whitespace',
});

export const packetRevisionInputV1Schema = z.object({
  schema: z.literal(PACKET_REVISION_SCHEMA),
  packetKey: requiredText,
  sourceRef: requiredText,
  sourceRevision: qualifiedRevision,
  contentDigest,
  packetSchemaRevision: requiredText,
}).strict();

export type PacketRevisionInputV1 = z.infer<typeof packetRevisionInputV1Schema>;

export const packetRevisionV1Schema = z.object({
  schema: z.literal(PACKET_REVISION_SCHEMA),
  packetKey: requiredText,
  packetRevision: qualifiedRevision,
  derivationRevision: z.literal(PACKET_REVISION_DERIVATION_REVISION),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type PacketRevisionV1 = z.infer<typeof packetRevisionV1Schema>;

function stableJson(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Derives packet identity from packet/source content state only. Workspace,
 * execution, representation, executor, graph, feature, projection, cache,
 * and timestamp metadata are deliberately outside this input contract.
 */
export function derivePacketRevisionV1(input: Omit<PacketRevisionInputV1, 'schema'>): PacketRevisionV1 {
  const parsed = packetRevisionInputV1Schema.parse({ schema: PACKET_REVISION_SCHEMA, ...input });
  const preimage = stableJson({
    schema: parsed.schema,
    packetKey: parsed.packetKey,
    sourceRef: parsed.sourceRef,
    sourceRevision: parsed.sourceRevision,
    contentDigest: parsed.contentDigest,
    packetSchemaRevision: parsed.packetSchemaRevision,
  });

  return packetRevisionV1Schema.parse({
    schema: PACKET_REVISION_SCHEMA,
    packetKey: parsed.packetKey,
    packetRevision: `sha256:${digest(preimage)}`,
    derivationRevision: PACKET_REVISION_DERIVATION_REVISION,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
