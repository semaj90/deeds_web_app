#!/usr/bin/env node
/**
 * post-check.cjs
 * Runs MCP/agentic post-check logic after npm run check.
 * - Runs MCP best practices analysis
 * - Runs copilot-self-prompt if available
 * - Falls back to copilot.md/claude.md if errors or infinite loop detected
 */

const fs = require('fs');
const path = require('path');

async function runBestPractices() {
  try {
    const helpersPath = path.resolve(__dirname, 'src/lib/ai/mcp-helpers.cjs');
    if (fs.existsSync(helpersPath)) {
      const mcp = require(helpersPath);
      if (mcp && mcp.commonMCPQueries && mcp.mcpSuggestBestPractices) {
        // Proxy returns a promise for object exports, so we must await it
        const commonMCPQueries = await mcp.commonMCPQueries();
        const req = await commonMCPQueries.performanceBestPractices();
        const prompt = await mcp.generateMCPPrompt(req);
        console.log('[Best Practices Prompt]:', prompt);
        const bestPractices = await mcp.mcpSuggestBestPractices({});
        console.log('[Best Practices]:', bestPractices);
      }
    }
  } catch (err) {
    console.error('Best practices error:', err);
  }
}

async function runCopilotSelfPrompt() {
  try {
    const copilotPath = path.resolve(__dirname, 'src/lib/utils/copilot-self-prompt.js');
    if (fs.existsSync(copilotPath)) {
      const copilot = require(copilotPath);
      if (copilot && copilot.copilotSelfPrompt) {
        const result = await copilot.copilotSelfPrompt('post-check');
        if (result && result.iterationCount && result.iterationCount > 20) {
          throw new Error('copilot-self-prompt iterated too long');
        }
        console.log('[Copilot Self Prompt]:', result);
        return;
      }
    }
    // Fallback to copilot.md/claude.md
    const copilotMd = path.resolve(__dirname, 'src/copilot.md');
    const claudeMd = path.resolve(__dirname, 'src/claude.md');
    if (fs.existsSync(copilotMd)) {
      console.log('[Copilot.md Fallback]:\n', fs.readFileSync(copilotMd, 'utf8'));
    }
    if (fs.existsSync(claudeMd)) {
      console.log('[Claude.md Fallback]:\n', fs.readFileSync(claudeMd, 'utf8'));
    }
  } catch (err) {
    console.error('Copilot self-prompt error:', err);
  }
}

(async () => {
  await runBestPractices();
  await runCopilotSelfPrompt();

  // --- Semantic Search Post-Check ---
  try {
    const helpersPath = path.resolve(__dirname, 'src/lib/ai/mcp-helpers.cjs');
    if (fs.existsSync(helpersPath)) {
      const mcp = require(helpersPath);
      if (mcp && mcp.semanticSearch) {
        const query = 'post-check semantic search';
        const results = await mcp.semanticSearch(query);
        console.log('[Semantic Search Results]:', results);
      } else {
        console.log('[Semantic Search]: mcp-helpers.cjs does not export semanticSearch');
      }
    } else {
      console.log('[Semantic Search]: mcp-helpers.cjs not found');
    }
  } catch (err) {
    console.error('Semantic search error:', err);
  }
})();
