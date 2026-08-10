import type { TensorPacketEnvelope } from './packet-validator';

export interface PassResult<T = unknown> {
  envelope: TensorPacketEnvelope;
  payload: T;
}

export interface AssembledPacket {
  packetKey: string;
  workspaceRevision: string;
  passes: Record<string, unknown>;
}

export function assemblePassResults(results: readonly PassResult[]): AssembledPacket[] {
  const byKey = new Map<string, AssembledPacket>();
  const seen = new Set<string>();
  for (const r of results) {
    if (seen.has(r.envelope.idempotencyKey)) continue;
    seen.add(r.envelope.idempotencyKey);
    const key = `${r.envelope.workspaceRevision}:${r.envelope.packetKey}`;
    const current = byKey.get(key) ?? { packetKey: r.envelope.packetKey, workspaceRevision: r.envelope.workspaceRevision, passes: {} };
    current.passes[`${r.envelope.passName}@${r.envelope.passRevision}`] = r.payload;
    byKey.set(key, current);
  }
  return [...byKey.values()].sort((a, b) => a.packetKey.localeCompare(b.packetKey));
}
