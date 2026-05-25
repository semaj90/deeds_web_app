
// scripts/dev/patch-opencode-agent-prompt.mjs
import fs from 'fs';
import path from 'path';

const openCodeConfigPath = path.resolve('opencode.json');

// 1. Fallback definitions discovered via rg --files
const aceEngramText = `
### ACE Engram Injection: Verified Graph Path Cache
When executing graph operations, skip blind file searches. Files are verified at these exact locations:
- Graph Input: sveltekit-frontend/memory/graphify/deep/deep-import-graph.json
- Edges Input: sveltekit-frontend/memory/graphify/deep/deep-import-edges.jsonl
- Mapping Target: sveltekit-frontend/docs/graph/codebase-map.md
- Graph Target: sveltekit-frontend/docs/graph/codebase-graph.json

If tool errors or schema validation limits are hit, immediately drop down the fallback ladder to native PowerShell discovery hooks and check nested roots sequentially.
`;

try {
  if (!fs.existsSync(openCodeConfigPath)) {
    console.error(`❌ Could not find opencode.json at: ${openCodeConfigPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(openCodeConfigPath, 'utf8');
  const config = JSON.parse(rawData);

  // Safely inject or update prompt layers
  config.agent = config.agent || {};
  config.agent['atlas-context'] = config.agent['atlas-context'] || {};
  config.agent['hermes-ace'] = config.agent['hermes-ace'] || {};

  config.agent['atlas-context'].prompt = (config.agent['atlas-context'].prompt || '') + aceEngramText;
  config.agent['hermes-ace'].prompt = (config.agent['hermes-ace'].prompt || '') + aceEngramText;

  fs.writeFileSync(openCodeConfigPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('🚀 Successfully patched opencode.json with the ACE Fallback Engrams.');
} catch (error) {
  console.error('🛑 Critical failure while patching agent prompts:', error.message);
  process.exit(1);
}
