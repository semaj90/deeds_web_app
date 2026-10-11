/**
 * Drift guard: the .mjs audit duplicates two packet-key patterns because it cannot import TypeScript.
 * This test imports the owners and the audit and fails if they diverge.
 * Run from sveltekit-frontend: npx tsx ../scripts/atlas/packet-key-scheme-audit-v2.parity.test.mts
 */
import assert from 'node:assert/strict';
import { PACKET_KEY_V2_PATTERN as ownerV2 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/packet-key-v2.ts';
import {
  LEGACY_PACKET_KEY_V1_PATTERN as ownerLegacy,
  legacyPacketKeyV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/identity/packet-key-legacy-alias-v1.ts';
import {
  PACKET_KEY_V2_PATTERN as auditV2,
  LEGACY_PACKET_KEY_V1_PATTERN as auditLegacy,
  classifyPacketKeySchemeV2,
} from './lib/packet-key-scheme-audit-v2.mjs';

assert.equal(auditV2.source, ownerV2.source, 'PACKET_KEY_V2_PATTERN source drift');
assert.equal(auditV2.flags, ownerV2.flags, 'PACKET_KEY_V2_PATTERN flags drift');
assert.equal(auditLegacy.source, ownerLegacy.source, 'LEGACY_PACKET_KEY_V1_PATTERN source drift');
assert.equal(auditLegacy.flags, ownerLegacy.flags, 'LEGACY_PACKET_KEY_V1_PATTERN flags drift');
// behavior parity on the owner's own legacy generator output
assert.equal(classifyPacketKeySchemeV2(legacyPacketKeyV1('src/a.ts')), 'LEGACY_V1_12HEX');

console.log(JSON.stringify({ schema: 'atlas.packet-key-scheme-audit-parity.v1', status: 'PARITY_OK', owners: ['packet-key-v2.ts', 'packet-key-legacy-alias-v1.ts'] }));
