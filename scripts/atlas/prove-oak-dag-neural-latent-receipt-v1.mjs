#!/usr/bin/env node
/**
 * Prototype / proof script for openspec/changes/parent-atlas-search-classifier-sidecar task 4
 * (OaK DAG neural-latent signal). Per operator instruction: build and prove in scripts/atlas/
 * first, then copy the proven logic into packages/parent-atlas + the real handler file.
 *
 * Calls the LIVE neural decoder service directly (raw HTTP, not the TS
 * runNeuralDecoderPrefillCallerV1 seam -- that seam is SvelteKit-$lib-scoped and only resolves
 * from inside sveltekit-frontend/; this script proves the receipt-shape logic standalone). The
 * real handler (built after this proves out) MUST go through runNeuralDecoderPrefillCallerV1,
 * per the runtime-ownership registry's explicit warning against a second caller.
 *
 * Proves: a real encode call -> a bounded, checksum-referenced receipt matching design.md D6
 * (`{ latentChecksum, latentWidth, nearestClusterId?, l2Norm }`) -- never the raw latent array.
 */

import { createHash } from 'node:crypto';

const NEURAL_DECODER_URL = process.env.NEURAL_DECODER_URL ?? 'http://127.0.0.1:8121';

function stableChecksum(value) {
  const stable = (item) => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === 'object') {
      return Object.keys(item).sort().reduce((out, key) => {
        out[key] = stable(item[key]);
        return out;
      }, {});
    }
    return item;
  };
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function l2Norm(vector) {
  return Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
}

/**
 * The bounded receipt shape this proves -- design.md D6. No KMeans model exists yet for the
 * latent_256 space (that's a separate, not-yet-built capability), so nearestClusterId is
 * omitted (undefined), matching its `?` optional declaration -- never fabricated.
 */
function buildBoundedLatentReceipt(latent256, checkpointRevision) {
  return {
    latentChecksum: stableChecksum(latent256),
    latentWidth: latent256.length,
    l2Norm: l2Norm(latent256),
    checkpointRevision,
  };
}

function makeFixtureSemantic768(seed) {
  // Deterministic, reproducible fixture -- mulberry32, matching this repo's existing
  // deterministic-fixture convention (see fixture-v1.mjs's own doc comment for the precedent).
  let state = seed >>> 0;
  function next() {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const vec = [];
  for (let i = 0; i < 768; i++) {
    // Box-Muller for roughly-Gaussian values, matching real embedding statistics better
    // than uniform noise.
    const u1 = Math.max(next(), 1e-12);
    const u2 = next();
    vec.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }
  return vec;
}

async function main() {
  const fixture = makeFixtureSemantic768(42);

  console.log(`Calling live neural decoder at ${NEURAL_DECODER_URL}/v1/neural-decoder/encode ...`);
  const response = await fetch(`${NEURAL_DECODER_URL}/v1/neural-decoder/encode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ semantic_768: [fixture] }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    console.error(`FAIL: encode returned HTTP ${response.status}`);
    process.exit(1);
  }

  const body = await response.json();
  const latent256 = body.latent_256?.[0];
  if (!Array.isArray(latent256) || latent256.length !== 256) {
    console.error(`FAIL: expected latent_256[0] to be a 256-length array, got: ${JSON.stringify(body).slice(0, 200)}`);
    process.exit(1);
  }

  const receipt = buildBoundedLatentReceipt(latent256, body.checkpointRevision);

  console.log('\nReal encode response metadata (raw latent array withheld from the receipt below):');
  console.log(`  checkpointRevision: ${body.checkpointRevision}`);
  console.log(`  checkpointSha256:   ${body.checkpointSha256}`);
  console.log(`  canonicalAuthority: ${body.canonicalAuthority}`);
  console.log(`  writesPerformed:    ${body.writesPerformed}`);

  console.log('\nBounded receipt (design.md D6 shape -- this is what a real OaK handler would return):');
  console.log(JSON.stringify(receipt, null, 2));

  // Determinism proof: same fixture input -> same checksum on a second real call.
  console.log('\nRe-calling with the SAME fixture to prove determinism...');
  const response2 = await fetch(`${NEURAL_DECODER_URL}/v1/neural-decoder/encode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ semantic_768: [fixture] }),
    signal: AbortSignal.timeout(15_000),
  });
  const body2 = await response2.json();
  const receipt2 = buildBoundedLatentReceipt(body2.latent_256[0], body2.checkpointRevision);

  const deterministic = receipt.latentChecksum === receipt2.latentChecksum;
  console.log(`  First call checksum:  ${receipt.latentChecksum}`);
  console.log(`  Second call checksum: ${receipt2.latentChecksum}`);
  console.log(`  DETERMINISTIC: ${deterministic}`);

  if (!deterministic) {
    console.error('FAIL: same input produced different latent checksums -- not safe to gate a receipt on.');
    process.exit(1);
  }

  console.log('\nPASS: real live encode -> bounded receipt -> deterministic. Ready to copy into packages/parent-atlas + the real handler.');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
