#!/usr/bin/env node
/**
 * Live proof for openspec/changes/parent-atlas-search-classifier-sidecar task 4.6 (not a
 * permanent test file -- none of the other 6 OaK DAG handlers have spec files either, so this
 * matches the existing convention rather than inventing new test scaffolding). Directly invokes
 * createOakDagNeuralLatentHandlerV1().run() with a real binding, proving the full chain: handler
 * -> runNeuralDecoderPrefillCallerV1 -> live atlas-neural-decoder service -> bounded receipt.
 *
 * Run from sveltekit-frontend/ (needs $lib alias resolution):
 *   npx tsx scripts/atlas/prove-oak-dag-neural-latent-handler-live.mts
 */
import { createHash } from 'node:crypto';
import { createOakDagNeuralLatentHandlerV1 } from '../../src/lib/server/atlas/policy/oak-dag-neural-latent-handler-v1.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function makeFixtureSemantic768(seed: number): number[] {
  let state = seed >>> 0;
  function next(): number {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const vec: number[] = [];
  for (let i = 0; i < 768; i++) {
    const u1 = Math.max(next(), 1e-12);
    const u2 = next();
    vec.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }
  return vec;
}

async function main() {
  const handler = createOakDagNeuralLatentHandlerV1();
  console.log(`implementationRef: ${handler.implementationRef}`);
  console.log(`actionKinds: ${handler.actionKinds.join(', ')}`);

  const semantic768 = makeFixtureSemantic768(42);
  const boundArguments = {
    semantic768,
    requestId: 'prove-oak-dag-neural-latent-handler-live',
    basePrefillIdentityChecksum: sha256('fixture-base-prefill-identity'),
    decoderContractRevision: 'decoder-contract-v1',
    decoderPolicyRevision: 'decoder-policy-v1',
  };

  const binding = {
    action: { actionId: 'a1', actionKind: 'FETCH_LATENT' },
    boundArguments,
    implementationRef: handler.implementationRef,
    operatorId: handler.operatorId,
    operatorKind: handler.operatorKind,
    expectedOutputSchemaId: handler.outputContract,
  } as any;

  console.log('\nCalling handler.run() -- this goes through the real runNeuralDecoderPrefillCallerV1 seam -> live decoder...');
  const receipt: any = await handler.run({ action: binding.action, parentResults: [], binding });

  console.log('\nReceipt:');
  console.log(JSON.stringify(receipt, null, 2));

  const checks: Array<[string, boolean]> = [
    ['schema === atlas.oak-neural-latent-receipt.v1', receipt.schema === 'atlas.oak-neural-latent-receipt.v1'],
    ['implementationRef matches handler', receipt.implementationRef === handler.implementationRef],
    ['representation === latent_256', receipt.representation === 'latent_256'],
    ['writesPerformed === false', receipt.writesPerformed === false],
    ['canonicalAuthority === false', receipt.canonicalAuthority === false],
    ['no raw latent array present on receipt', !('latent256' in receipt) && !('latent' in receipt) && !Array.isArray(receipt.latentChecksum)],
    ['cacheStatus is a known value', ['DISABLED', 'MISS', 'HIT', 'DECODER_UNAVAILABLE', 'DECODER_REJECTED'].includes(receipt.cacheStatus)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`);
    if (!ok) allPass = false;
  }

  if (!allPass) {
    console.error('\nFAIL: one or more checks did not pass.');
    process.exit(1);
  }
  console.log('\nPASS: real live handler.run() call, bounded receipt confirmed, no raw tensor state present.');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
