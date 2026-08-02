/**
 * Packet bitmap gate scoring — capability boundary, NOT an implementation.
 *
 * node-bitmap-gate-scoring.ts's docstring claimed "Uses Redis/Valkey
 * bitmaps for 500-2000x faster gate readiness scoring", but this file
 * (and the entire src/lib/server/langgraph/cache/ directory) never
 * existed — importing it crashed the whole dispatcher graph's module
 * load, blocking every dispatcher node, not just this one. Found while
 * wiring scripts/atlas/dispatcher-worker-runtime.mts (the first real
 * caller of the dispatcher chain — see
 * openspec/changes/parent-atlas-runtime-ownership-precall/proposal.md).
 *
 * Per operator review (2026-08-01): a class that LOOKS like a working
 * cache but always returns zeroed-out data is worse than an explicit
 * "this capability doesn't exist" signal — it invites future code to
 * treat gatesPass:0 as a real (if pessimistic) score rather than "no
 * scoring happened." This module exposes absence as a first-class
 * state instead: getPacketBitmapProvider() returns null, and the
 * caller is required to branch on that explicitly.
 *
 * The "500-2000x faster" claim is removed everywhere it appeared —
 * unproven, no benchmark exists, and it described bitmap scoring that
 * was never implemented in the first place.
 *
 * Before implementing a real provider: define what the 8 gates
 * actually are, which producer SETS each bit and when, the Redis key/
 * bit-position contract, and an invalidation/revision policy — then
 * implement a real BITCOUNT/BITPOS-backed PacketBitmapProvider here
 * satisfying the interface below.
 */

export interface PacketBitmapGateResult {
  status: 'not_configured';
  ready: false;
  quarantine: true;
  reason: 'packet_bitmap_projection_not_implemented';
}

export interface PacketReadiness {
  gatesPass: number;
  ready: boolean;
}

export interface PacketBitmapProvider {
  getReadiness(packetKey: string): Promise<PacketReadiness>;
}

/**
 * Returns the real bitmap gate-scoring provider, or null when the
 * capability is absent (currently: always null — nothing implements
 * PacketBitmapProvider yet). Callers MUST branch on null explicitly
 * rather than constructing a provider that silently no-ops.
 */
export function getPacketBitmapProvider(): PacketBitmapProvider | null {
  return null;
}

/** The explicit not_configured result callers should use when getPacketBitmapProvider() returns null. */
export function bitmapGateNotConfigured(): PacketBitmapGateResult {
  return {
    status: 'not_configured',
    ready: false,
    quarantine: true,
    reason: 'packet_bitmap_projection_not_implemented',
  };
}
