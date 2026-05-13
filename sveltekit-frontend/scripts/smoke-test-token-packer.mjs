/**
 * scripts/smoke-test-token-packer.mjs
 * Smoke test for the ACE token-aware context packer.
 */
import { packAceContext } from '../src/lib/server/ace/token-aware-context-packer.js';

async function run() {
  console.log('--- Running Token-Aware Context Packer Smoke Test ---');

  const query = 'encoded_64 rerank and Karpathy GraphRAG cluster summaries';

  const packet = packAceContext({
    query,
    maxTokens: 1800,
    clusterSummaries: [
      {
        clusterId: 7,
        summary: 'Cluster 7 synthesizes authority, topology, and retrieval lanes.',
        authorityScore: 0.93,
        clusterPagerank: 0.84,
        karpathyBlend: 1,
        topFiles: ['src/lib/server/ace/context-assembler.ts', 'src/lib/server/ace/token-aware-context-packer.ts'],
      },
    ],
    graphTriples: [
      ['FileA', 'IMPORTS', 'FileB'],
      ['FileA', 'IMPORTS', 'FileB'],
    ],
    chunks: [
      {
        id: 'chunk-a',
        filePath: 'src/lib/server/ace/context-assembler.ts',
        clusterId: 7,
        text: 'const alpha = 1;'.repeat(24),
        qdrantScore: 0.91,
        pagerankScore: 0.73,
        encoded64Score: 0.88,
        graphProximity: 0.42,
      },
      {
        id: 'chunk-a-dup',
        filePath: 'src/lib/server/ace/context-assembler.ts',
        clusterId: 7,
        text: 'duplicate',
        qdrantScore: 0.8,
        pagerankScore: 0.7,
        encoded64Score: 0.7,
      },
      {
        id: 'chunk-empty',
        filePath: 'src/lib/server/ace/token-aware-context-packer.ts',
        clusterId: 9,
        text: ' ',
        qdrantScore: 0.2,
      },
    ],
    wikiRows: [
      { id: 'wiki-1', text: 'Karpathy note for cluster 7.', score: 0.7 },
    ],
    rawCode: [
      { id: 'file-1', text: 'export const x = 1;'.repeat(20), score: 0.4 },
    ],
  });

  const budgetStatus = packet.tokenBudget.estimatedInputTokens <= 1800 - 1024;
  const hasSelectedSources = packet.selectedSources.length > 0;
  const hasExcludedSources = packet.excludedSources.length > 0;
  const hasAuthority = packet.clusterLenses.some((c) => typeof c.authorityScore === 'number');

  console.log(`Query: "${query}"\n`);
  console.log(`${packet.activeClusterIds.includes(7) ? '✅' : '❌'} activeClusterIds present (${packet.activeClusterIds.join(', ') || 'none'})`);
  console.log(`${hasSelectedSources ? '✅' : '❌'} selectedSources present (${packet.selectedSources.length})`);
  console.log(`${hasExcludedSources ? '✅' : '❌'} excludedSources present (${packet.excludedSources.length})`);
  console.log(`${budgetStatus ? '✅' : '❌'} token estimate under budget (${packet.tokenBudget.estimatedInputTokens} / ${1800 - 1024})`);
  console.log(`${hasAuthority ? '✅' : '❌'} cluster authority appears in clusterLenses`);

  console.log('\n--- Packet Summary ---\n');
  console.log(`Active Clusters:`, packet.activeClusterIds);
  console.log(`Top 3 Selected Sources:`, packet.selectedSources.slice(0, 3).map((s) => `${s.type} - ${s.id} (score: ${s.score.toFixed(2)}, tokens: ${s.tokenEstimate})`));

  if (hasSelectedSources && hasExcludedSources && budgetStatus && hasAuthority) {
    console.log('\n✅ SMOKE TEST PASSED!');
    process.exit(0);
  }

  console.log('\n❌ SMOKE TEST FAILED: Missing essential packet data.');
  process.exit(1);
}

run();
