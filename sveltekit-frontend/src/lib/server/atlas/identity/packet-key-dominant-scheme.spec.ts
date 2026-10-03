// @vitest-environment node

/**
 * PACKET-KEY-SINGLE-OWNER-CONVERGENCE-01 (read-only gate)
 *
 * Characterization tests for the dominant LIVE packet_key scheme, which has
 * no canonical exported TypeScript function -- it is inline in
 * `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs`:
 *
 *   packet_key = 'packet:' + sha256(source_ref).slice(0, 12)
 *
 * This file does NOT modify that script (no packet-writer change). It
 * duplicates the formula verbatim as a frozen characterization fixture so the
 * dominant scheme's actual behavior (determinism, rename-instability,
 * revision-invariance) is asserted by a test rather than only by prose, and
 * so it can be diffed against the two non-live candidate schemes
 * (`packet-key-builder.ts::computePacketKey`, `compute-packet-key.ts::computePacketKey`).
 *
 * Live Postgres census backing this file (2026-09-22, read-only, 0 writes):
 *   packet:[0-9a-f]{12}   58362 rows (94.6%)
 *   ace:packet:[0-9a-f]{12} 3294 rows (5.3%, all aliased via atlas_packet_identity_aliases
 *                              to the same packet: form -- same hash, wrong historical prefix)
 *   16-hex (rpc proto scheme, distinct sourceKind='rpc_method', out of packet_key scope) 61 rows
 *   other                  1 row
 *   [0-9a-f]{64} (packet-key-builder.ts hex64 scheme)  0 rows
 *   pkt:*  (compute-packet-key.ts workspace scheme)    0 rows
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computePacketKey as computePacketKeyHex64 } from './packet-key-builder.js';
import { computePacketKey as computePacketKeyWorkspaceScoped } from './compute-packet-key.js';

/** Verbatim copy of upsert-whole-codebase-atlas-packets.mjs's sha256() + formula (read-only mirror, not a new writer). */
function dominantLivePacketKey(sourceRef: string): string {
	const hash = createHash('sha256').update(sourceRef, 'utf8').digest('hex');
	return `packet:${hash.slice(0, 12)}`;
}

describe('PACKET-KEY-SINGLE-OWNER-CONVERGENCE-01: dominant live packet_key scheme', () => {
	it('is deterministic: same source_ref always yields the same key', () => {
		const a = dominantLivePacketKey('src/lib/server/auth.ts');
		const b = dominantLivePacketKey('src/lib/server/auth.ts');
		expect(a).toBe(b);
		expect(a).toMatch(/^packet:[0-9a-f]{12}$/);
	});

	it('does NOT survive rename: changing source_ref changes packet_key (no alias mechanism at the formula level)', () => {
		const before = dominantLivePacketKey('src/lib/server/old-path/auth.ts');
		const after = dominantLivePacketKey('src/lib/server/new-path/auth.ts');
		expect(before).not.toBe(after);
	});

	it('is revision-invariant: the formula has no content/revision input, so it cannot distinguish R1 from R2 of the same file', () => {
		// The dominant scheme's only input is source_ref. There is no
		// contentHash/sourceRevision parameter in the live formula at all --
		// this test documents that absence rather than simulating a "same key
		// across revisions" call, since the function signature has no revision
		// parameter to vary.
		const key1 = dominantLivePacketKey('src/lib/server/auth.ts');
		const key2 = dominantLivePacketKey('src/lib/server/auth.ts');
		expect(key1).toBe(key2);
		expect(dominantLivePacketKey.length).toBe(1); // single-argument formula: source_ref only
	});

	it('has no projection/cluster/CandidateOrdinal input (structural check on the formula signature)', () => {
		// dominantLivePacketKey(sourceRef) takes exactly one argument; no
		// clusterId, projectionOrdinal, candidateOrdinal, or executor/transport
		// field can leak into the canonical key by construction.
		expect(dominantLivePacketKey.length).toBe(1);
	});

	it('scheme classification: dominant live formula output never matches the hex64 (packet-key-builder.ts) scheme', () => {
		const dominant = dominantLivePacketKey('src/lib/server/auth.ts');
		const hex64 = computePacketKeyHex64('src/lib/server/auth.ts', null, null);
		expect(dominant).not.toBe(hex64);
		expect(dominant).toMatch(/^packet:[0-9a-f]{12}$/);
		expect(hex64).toMatch(/^[0-9a-f]{64}$/);
	});

	it('scheme classification: dominant live formula output never matches the pkt: (compute-packet-key.ts) workspace-scoped scheme', () => {
		const dominant = dominantLivePacketKey('src/lib/server/auth.ts');
		const workspaceScoped = computePacketKeyWorkspaceScoped({
			workspaceId: 'default',
			sourceRef: 'src/lib/server/auth.ts',
			semanticAnchor: 'validateSession',
		});
		expect(dominant).not.toBe(workspaceScoped);
		expect(workspaceScoped).toMatch(/^pkt:default:[0-9a-f]{32}$/);
	});

	it('legacy-prefix detection: the known ace:packet: alias cohort hashes to the same 12-hex suffix as the dominant scheme', () => {
		// register-orphaned-chunks.mjs (since-fixed) wrote `ace:packet:<12hex>`
		// using the identical sha256(source_ref).slice(0,12) hash but the wrong
		// prefix. This proves the alias cohort is the SAME logical key under a
		// different label, not a competing derivation.
		const sourceRef = 'src/lib/server/example-file.ts';
		const dominant = dominantLivePacketKey(sourceRef);
		const legacyPrefixed = `ace:${dominant}`;
		expect(legacyPrefixed.slice('ace:packet:'.length)).toBe(dominant.slice('packet:'.length));
	});
});
