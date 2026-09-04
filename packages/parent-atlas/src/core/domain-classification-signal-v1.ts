import { createHash } from 'node:crypto';
import { z } from 'zod';

const checksum = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const domainClassificationSignalV1Schema = z.object({
  schema_version: z.literal('atlas.domain-classification-signal.v1'),
  request_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_namespace: z.string().min(1),
  source_revision: checksum,
  classifier_id: z.string().min(1),
  classifier_revision: z.string().min(1),
  label: z.string().min(1),
  probability: z.number().min(0).max(1),
  mapping_revision: checksum,
  ontology_revision: checksum,
  evidence_refs: z.array(z.string().min(1)).min(1),
  producer_revision: z.string().min(1),
}).strict();

export type DomainClassificationSignalV1 = z.infer<typeof domainClassificationSignalV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

export function checksumDomainClassificationSignalV1(value: DomainClassificationSignalV1): string {
  const signal = domainClassificationSignalV1Schema.parse(value);
  return `sha256:${createHash('sha256').update(stableJson(signal), 'utf8').digest('hex')}`;
}
