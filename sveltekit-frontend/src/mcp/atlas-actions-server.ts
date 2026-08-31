import { handleAtlasSemanticToolCall } from '$lib/server/atlas/atlas-semantic-tools.js';
import { createDomainServer, serveDomainServer } from './domain-server-core.js';
import { getAtlasSemanticDomainTools } from './atlas-semantic-domain-registry.js';

export const atlasActionsServer = createDomainServer({
  name: 'deeds-atlas-actions',
  version: '1.0.0',
  tools: getAtlasSemanticDomainTools('actions'),
  authToken: process.env.MCP_AUTH_TOKEN,
  callTool: async (name, args) => {
    const result = await handleAtlasSemanticToolCall(name as any, args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    };
  },
});

async function main(): Promise<void> {
  await serveDomainServer(atlasActionsServer, 'Deeds Atlas Actions MCP Server');
}

if (process.argv[1]?.endsWith('atlas-actions-server.ts') || process.argv[1]?.endsWith('atlas-actions-server.js')) {
  main().catch((error) => {
    console.error('Atlas actions MCP server error:', error);
    process.exit(1);
  });
}
