import { rotorQuantSearch, graphExpandNeighborhood } from '../src/lib/server/ai/gemma4.ts';

async function main() {
  const toolName = process.argv[2];
  const query = process.argv[3] || '';

  if (!toolName) {
    console.error("Usage: node scripts/smoke-gemma4-tools.mjs <toolName> <query>");
    process.exit(1);
  }

  console.log(`[Smoke Test] Executing ${toolName} with query: "${query}"`);

  try {
    if (toolName === 'rotorQuantSearch') {
      const result = await rotorQuantSearch({ query, limit: 12 });
      console.log(result);
    } else if (toolName === 'graphExpandNeighborhood') {
      // For smoke testing, assuming query is a sourceRef
      const result = await graphExpandNeighborhood({ sourceRefs: [query] });
      console.log(result);
    } else {
      console.error(`Unknown tool: ${toolName}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[Error] Tool execution failed:`, err);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(console.error);
