import fs from 'fs';

const path = 'C:/Users/james/Videos/deeds-web-app/opencode.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));

// 1. Update root models to the new gemma4-local provider
config.model = 'gemma4-local/gemma4-local';
config.small_model = 'gemma4-local/gemma4-local';

// 2. Update agent models
if (config.agent) {
  for (const agentKey of Object.keys(config.agent)) {
    if (config.agent[agentKey].model && config.agent[agentKey].model.startsWith('turboquant/')) {
      config.agent[agentKey].model = 'gemma4-local/gemma4-local';
    }
  }
}

// 3. Fix MCP connection parameters for SSE transport
if (config.mcp) {
  for (const key of Object.keys(config.mcp)) {
    const server = config.mcp[key];
    if (server.type === 'remote') {
      server.type = 'sse';
    }
    // Update /mcp to /sse
    if (server.url && server.url.endsWith('/mcp')) {
      server.url = server.url.replace('/mcp', '/sse');
    }
    // Also, if local commands are used, ensure it conforms to typical stdio naming
    if (server.type === 'local') {
      server.type = 'stdio';
    }
  }
}

fs.writeFileSync(path, JSON.stringify(config, null, 2));
console.log('Successfully patched opencode.json for SSE and gemma4-local tool calling.');
