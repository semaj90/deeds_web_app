import { createHash } from 'node:crypto';
import { z } from 'zod';

// GraphNodeKind is a semantic node taxonomy. GraphNodeKeyV1 is narrower: it
// admits only identities with an established projection address. A node kind
// does not gain a key prefix merely by appearing in that taxonomy.
export const graphNodeKeyV1Schema = z.string().regex(/^(symbol|packet|chunk|occurrence):.+$/);
export type GraphNodeKeyV1 = z.infer<typeof graphNodeKeyV1Schema>;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/**
 * Derives a durable graph projection key without promoting treeNodeId or an
 * executor-local graph ordinal into canonical identity.
 */
export function deriveGraphNodeKeyV1(input: {
  symbolVersionId?: string | null;
  packetKey?: string | null;
  chunkId?: string | null;
  sourceRef?: string | null;
  sourceRevision?: string | null;
  upstreamNodeId?: string | null;
  byteStart?: number | null;
  byteEnd?: number | null;
}): GraphNodeKeyV1 {
  if (input.symbolVersionId) return graphNodeKeyV1Schema.parse(`symbol:${input.symbolVersionId}`);
  if (input.packetKey) return graphNodeKeyV1Schema.parse(`packet:${input.packetKey}`);
  if (input.chunkId) return graphNodeKeyV1Schema.parse(`chunk:${input.chunkId}`);
  if (input.sourceRef && input.sourceRevision && input.upstreamNodeId && Number.isInteger(input.byteStart) && Number.isInteger(input.byteEnd)) {
    return graphNodeKeyV1Schema.parse(`occurrence:${digest([input.sourceRef, input.sourceRevision, input.upstreamNodeId, input.byteStart, input.byteEnd])}`);
  }
  throw new Error('GRAPH_NODE_KEY_IDENTITY_INSUFFICIENT');
}
