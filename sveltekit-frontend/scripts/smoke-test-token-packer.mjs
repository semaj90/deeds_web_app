/**
 * scripts/smoke-test-token-packer.mjs
 * Smoke test for the ACE token-aware context packer.
 */
import { assembleACEContext } from '../src/lib/server/ace/context-assembler.js';

async function run() {
  console.log('--- Running Token-Aware Context Packer Smoke Test ---');
  
  const query = "encoded_64 rerank and Karpathy GraphRAG cluster summaries";
  const statsOut = {};

  console.log(`Query: "${query}"\n`);

  try {
    const context = await assembleACEContext({
      query,
      enableCodebaseContext: true,
      tokenAwarePacking: true,
      maxTokens: 8000,
      statsOut
    });

    const packet = context.aceContextPacket;
    if (!packet) {
      console.error('❌ FAILURE: aceContextPacket is missing from ACEContext.');
      process.exit(1);
    }

    console.log('✅ aceContextPacket generated successfully.');

    // Verifications
    const hasActiveClusters = packet.activeClusterIds && packet.activeClusterIds.length > 0;
    console.log(`${hasActiveClusters ? '✅' : '❌'} activeClusterIds present (${packet.activeClusterIds.length})`);

    const hasSelectedSources = packet.selectedSources && packet.selectedSources.length > 0;
    console.log(`${hasSelectedSources ? '✅' : '❌'} selectedSources present (${packet.selectedSources.length})`);

    const hasExcludedSources = packet.excludedSources && packet.excludedSources.length > 0;
    console.log(`${hasExcludedSources ? '✅' : '❌'} excludedSources present (${packet.excludedSources.length})`);

    const budgetStatus = packet.tokenBudget.estimatedInputTokens <= packet.tokenBudget.maxInputTokens;
    console.log(`${budgetStatus ? '✅' : '❌'} token estimate under budget (${packet.tokenBudget.estimatedInputTokens} / ${packet.tokenBudget.maxInputTokens})`);

    const hasAuthority = packet.clusterLenses && packet.clusterLenses.some(c => typeof c.authorityScore === 'number');
    console.log(`${hasAuthority ? '✅' : '❌'} cluster authority appears in clusterLenses`);

    console.log('\n--- statsOut Trace ---\n');
    console.log(JSON.stringify(statsOut, null, 2));

    console.log('\n--- Packet Summary ---\n');
    console.log(`Active Clusters:`, packet.activeClusterIds);
    console.log(`Top 3 Selected Sources:`, packet.selectedSources.slice(0, 3).map(s => `${s.type} - ${s.id} (score: ${s.score.toFixed(2)}, tokens: ${s.tokenEstimate})`));

    if (hasActiveClusters && hasSelectedSources && budgetStatus) {
      console.log('\n✅ SMOKE TEST PASSED!');
      process.exit(0);
    } else {
      console.log('\n❌ SMOKE TEST FAILED: Missing essential packet data.');
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ Execution error:', err);
    process.exit(1);
  }
}

run();
