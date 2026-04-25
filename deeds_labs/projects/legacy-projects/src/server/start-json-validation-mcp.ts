/**
 * Phase52: MCP JSON Validation Server Startup
 *
 * Starts the MCP server for JSON parsing validation and error analysis
 * with GPU acceleration and Gemma3-legal integration.
 */

import { MCPJSONValidationService } from '../src/server/json-validation-mcp';

async function startMCPValidationServer() {
  console.log('🚀 Starting Phase52 MCP JSON Validation Server...');

  const service = new MCPJSONValidationService(3003);

  try {
    await service.start();
    console.log('✅ MCP JSON Validation Server running on port 3003');
    console.log('📊 Available endpoints:');
    console.log('  - GET  /mcp/health');
    console.log('  - POST /mcp/json-validation');
    console.log('  - GET  /mcp/backends');
    console.log('  - GET  /mcp/metrics');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down MCP JSON Validation Server...');
      await service.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down MCP JSON Validation Server...');
      await service.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start MCP JSON Validation Server:', error);
    process.exit(1);
  }
}

// Start the server
startMCPValidationServer().catch(console.error);