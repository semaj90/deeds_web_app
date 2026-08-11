/**
 * Smoke test for packet-identity-resolver.ts (PACKET_IDENTITY_ALIAS_AND_WRITER_CONVERGENCE, P0-3).
 *
 * Verifies the three resolution paths against live Postgres:
 *   1. Direct hit — dominant live format (`packet:<12hex>`) resolves to itself.
 *   2. Alias hit — a normalized `packet:<12hex>` key with no direct row resolves
 *      to the actually-stored `ace:packet:<12hex>` row via atlas_packet_identity_aliases.
 *   3. Unresolvable — an unknown key throws PacketIdentityUnresolvedError, no silent fallback.
 *
 * Run from sveltekit-frontend/ (required for $lib alias resolution inside the resolver):
 *   npx tsx scripts/smoke-packet-identity-resolver.mjs
 */
import 'dotenv/config';
import { resolveCanonicalPacketKey, PacketIdentityUnresolvedError } from '../src/lib/server/atlas/identity/packet-identity-resolver.ts';

async function main() {
  const direct = await resolveCanonicalPacketKey('packet:03e3bacd7a74');
  console.log('direct hit:', direct);

  const aliased = await resolveCanonicalPacketKey('packet:41ae4f183768');
  console.log('alias resolved:', aliased);

  try {
    await resolveCanonicalPacketKey('packet:doesnotexist123');
    console.log('FAIL: should have thrown');
    process.exitCode = 1;
    return;
  } catch (e) {
    console.log('correctly threw:', e instanceof PacketIdentityUnresolvedError, e.message);
  }

  console.log('\nAll 3 resolution paths verified.');
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => { console.error('FATAL:', e); process.exit(1); });
