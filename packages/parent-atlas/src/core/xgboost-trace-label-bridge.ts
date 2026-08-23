import { createHash } from 'node:crypto';
import { z } from 'zod';

const revisionSchema = z.string().min(1);
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const xgboostTraceLabelBridgeEntrySchema = z.object({
  trace_label: z.string().min(1),
  packet_keys: z.array(z.string().min(1)).min(1),
  mapping_method: z.enum(['EXPLICIT_ALIAS', 'SOURCE_REF_EXACT', 'REVIEWED_MAPPING']),
  evidence_refs: z.array(z.string().min(1)).min(1),
});

export const xgboostTraceLabelBridgeSchema = z.object({
  schema: z.literal('atlas.xgboost-trace-label-bridge.v1'),
  workspace_revision: revisionSchema,
  source_revision: revisionSchema,
  bridge_revision: revisionSchema,
  entries: z.array(xgboostTraceLabelBridgeEntrySchema),
  bridge_checksum: checksumSchema,
  promotion_allowed: z.literal(false),
});

export type XgboostTraceLabelBridgeEntry = z.infer<typeof xgboostTraceLabelBridgeEntrySchema>;
export type XgboostTraceLabelBridge = z.infer<typeof xgboostTraceLabelBridgeSchema>;
type XgboostTraceLabelBridgeBase = Omit<XgboostTraceLabelBridge, 'bridge_checksum'>;

function checksumInput(input: XgboostTraceLabelBridgeBase): string {
  return JSON.stringify({
    ...input,
    entries: [...input.entries]
      .map((entry) => ({
        ...entry,
        packet_keys: [...entry.packet_keys].sort(),
        evidence_refs: [...entry.evidence_refs].sort(),
      }))
      .sort((a, b) => a.trace_label.localeCompare(b.trace_label)),
  });
}

export function buildXgboostTraceLabelBridge(
  input: Omit<XgboostTraceLabelBridge, 'schema' | 'bridge_checksum' | 'promotion_allowed'>,
): XgboostTraceLabelBridge {
  const base = {
    schema: 'atlas.xgboost-trace-label-bridge.v1' as const,
    ...input,
    promotion_allowed: false as const,
  };
  const bridge_checksum = createHash('sha256').update(checksumInput(base), 'utf8').digest('hex');
  return xgboostTraceLabelBridgeSchema.parse({ ...base, bridge_checksum });
}

export function validateXgboostTraceLabelBridge(input: unknown): XgboostTraceLabelBridge {
  const bridge = xgboostTraceLabelBridgeSchema.parse(input);
  const { bridge_checksum: _ignoredChecksum, ...base } = bridge;
  const expected = createHash('sha256')
    .update(checksumInput(base), 'utf8')
    .digest('hex');
  if (expected !== bridge.bridge_checksum) {
    throw new Error('XGBOOST_TRACE_LABEL_BRIDGE_CHECKSUM_MISMATCH');
  }

  const labels = new Set<string>();
  for (const entry of bridge.entries) {
    if (labels.has(entry.trace_label)) throw new Error('XGBOOST_TRACE_LABEL_BRIDGE_DUPLICATE_LABEL');
    labels.add(entry.trace_label);
    if (new Set(entry.packet_keys).size !== entry.packet_keys.length) {
      throw new Error('XGBOOST_TRACE_LABEL_BRIDGE_DUPLICATE_PACKET_KEY');
    }
  }
  return bridge;
}
