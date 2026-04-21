import { buildGemma4AcePrompt } from './sveltekit-frontend/src/lib/server/ace/gemma4-codeintel.js';

const mockContext = {
  query: 'initial query',
  clusterContext: [
    { gpuCluster: 1, purpose: 'Auth', summary: 'Handles login', patterns: [], warnings: [], tags: [] }
  ],
  chunkContext: [],
  health: { ok: true, chunkCount: 1000, clusterCount: 20, embeddingCoverage: 0.9 },
  degraded: false
};

const prompt1 = buildGemma4AcePrompt(mockContext);
const prompt2 = buildGemma4AcePrompt({ ...mockContext, query: 'different query' });

// The beginning of the prompt (the prefix containing clusters) should be identical
const prefix1 = prompt1.split('## USER QUERY')[0];
const prefix2 = prompt2.split('## USER QUERY')[0];

if (prefix1 === prefix2) {
  console.log('✅ PASS: Prompt prefix is stable across queries.');
} else {
  console.log('❌ FAIL: Prompt prefix is volatile!');
  process.exit(1);
}
