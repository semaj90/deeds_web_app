#!/usr/bin/env node
/**
 * post-check.cjs
 * Runs MCP/agentic post-check logic after npm run check.
 * - Runs MCP best practices analysis
 * - Runs copilot-self-prompt if available
 * - Falls back to copilot.md/claude.md if errors or infinite loop detected
 * - Integrates with existing auto:solve system
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// Configuration
const CONFIG = {
  maxIterations: 20,
  timeoutMs: 300000, // 5 minutes
  enableAutoSolve: process.env.ENABLE_AUTO_SOLVE !== 'false',
  verboseLogging: process.env.VERBOSE_POST_CHECK === 'true',
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function runBestPractices() {
  try {
    log('Running MCP best practices analysis...');
    const helpersPath = path.resolve(__dirname, '../src/lib/ai/mcp-helpers.cjs');

    if (fs.existsSync(helpersPath)) {
      const mcp = require(helpersPath);
      if (mcp && mcp.commonMCPQueries && mcp.mcpSuggestBestPractices) {
        // Proxy returns a promise for object exports, so we must await it
        const commonMCPQueries = await mcp.commonMCPQueries();
        const req = await commonMCPQueries.performanceBestPractices();
        const prompt = await mcp.generateMCPPrompt(req);

        if (CONFIG.verboseLogging) {
          log(`Best Practices Prompt: ${prompt}`);
        }

        const bestPractices = await mcp.mcpSuggestBestPractices({});
        log(`Best Practices Results: ${JSON.stringify(bestPractices, null, 2)}`, 'success');
        return bestPractices;
      }
    } else {
      log('MCP helpers not found, skipping best practices analysis');
    }
  } catch (err) {
    log(`Best practices error: ${err.message}`, 'error');
    return null;
  }
}

async function runCopilotSelfPrompt() {
  try {
    log('Running copilot self-prompt analysis...');
    const copilotPath = path.resolve(__dirname, '../src/lib/utils/copilot-self-prompt.js');

    if (fs.existsSync(copilotPath)) {
      const copilot = require(copilotPath);
      if (copilot && copilot.copilotSelfPrompt) {
        const result = await copilot.copilotSelfPrompt('post-check');

        if (result && result.iterationCount && result.iterationCount > CONFIG.maxIterations) {
          throw new Error(
            `copilot-self-prompt iterated too long (${result.iterationCount} iterations)`
          );
        }

        log(`Copilot Self Prompt Results: ${JSON.stringify(result, null, 2)}`, 'success');
        return result;
      }
    }

    // Fallback to markdown files
    await runMarkdownFallback();
    return null;
  } catch (err) {
    log(`Copilot self-prompt error: ${err.message}`, 'error');
    await runMarkdownFallback();
    return null;
  }
}

async function runMarkdownFallback() {
  log('Running markdown fallback analysis...');

  const copilotMd = path.resolve(__dirname, '../src/copilot.md');
  const claudeMd = path.resolve(__dirname, '../src/claude.md');
  const claudeGlobalMd = path.resolve(__dirname, '../CLAUDE.md');

  const markdownFiles = [copilotMd, claudeMd, claudeGlobalMd].filter(fs.existsSync);

  if (markdownFiles.length > 0) {
    log(`Found ${markdownFiles.length} markdown guidance files`);
    markdownFiles.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);
      log(`${fileName} guidance loaded (${content.length} chars)`, 'success');

      if (CONFIG.verboseLogging) {
        console.log(`\n--- ${fileName} Content ---\n${content}\n--- End ${fileName} ---\n`);
      }
    });
  } else {
    log('No markdown guidance files found');
  }
}

async function runAutoSolve() {
  if (!CONFIG.enableAutoSolve) {
    log('Auto-solve disabled via ENABLE_AUTO_SOLVE=false');
    return;
  }

  try {
    log('Running integrated auto:solve system...');

    // Run the existing auto:solve command
    const autoSolveResult = execSync('npm run auto:solve', {
      encoding: 'utf8',
      timeout: CONFIG.timeoutMs,
      cwd: process.cwd(),
    });

    log('Auto:solve completed successfully', 'success');

    if (CONFIG.verboseLogging) {
      console.log(`Auto:solve output:\n${autoSolveResult}`);
    }

    return autoSolveResult;
  } catch (err) {
    log(`Auto:solve error: ${err.message}`, 'error');

    if (err.status) {
      log(`Auto:solve exit code: ${err.status}`, 'error');
    }

    // Try fallback check after auto:solve failure
    try {
      log('Running fallback TypeScript check...');
      const checkResult = execSync('npm run check:typescript', {
        encoding: 'utf8',
        timeout: 60000,
      });
      log('Fallback check completed', 'success');
    } catch (checkErr) {
      log(`Fallback check also failed: ${checkErr.message}`, 'error');
    }
  }
}

async function runRouteHealthCheck() {
  try {
    log('Running route health validation...');

    // Check if streaming workflow route is accessible
    const streamingRoute = path.resolve(
      __dirname,
      '../src/routes/demo/streaming-workflow/+page.svelte'
    );
    if (fs.existsSync(streamingRoute)) {
      log('✅ Streaming workflow route exists', 'success');
    }

    // Check API routes
    const apiRoutes = [
      '../src/routes/api/evidence/process/stream/+server.ts',
      '../src/routes/api/glyph/generate/+server.ts',
    ];

    const existingRoutes = apiRoutes.filter((route) =>
      fs.existsSync(path.resolve(__dirname, route))
    );

    log(`Found ${existingRoutes.length}/${apiRoutes.length} critical API routes`, 'success');
  } catch (err) {
    log(`Route health check error: ${err.message}`, 'error');
  }
}

async function main() {
  const startTime = Date.now();
  log('🚀 Starting post-check analysis...');

  try {
    // Run all analysis in parallel for speed
    const results = await Promise.allSettled([
      runBestPractices(),
      runCopilotSelfPrompt(),
      runRouteHealthCheck(),
    ]);

    // Check results
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    log(`Analysis completed: ${successful} successful, ${failed} failed`);

    // Run auto:solve if any issues detected or if explicitly requested
    if (failed > 0 || process.argv.includes('--force-autosolve')) {
      log('Issues detected, running auto:solve...');
      await runAutoSolve();
    } else {
      log('No issues detected, skipping auto:solve');
    }

    const duration = Date.now() - startTime;
    log(`🎉 Post-check completed in ${duration}ms`, 'success');
  } catch (err) {
    log(`Fatal error in post-check: ${err.message}`, 'error');
    process.exit(1);
  }
}

// Handle CLI arguments
if (process.argv.includes('--help')) {
  console.log(`
Usage: node post-check.cjs [options]

Options:
  --help              Show this help message
  --force-autosolve   Force run auto:solve even if no issues detected
  --verbose           Enable verbose logging (or set VERBOSE_POST_CHECK=true)
  --no-autosolve      Disable auto:solve (or set ENABLE_AUTO_SOLVE=false)

Environment Variables:
  ENABLE_AUTO_SOLVE=false    Disable auto:solve integration
  VERBOSE_POST_CHECK=true    Enable verbose logging
`);
  process.exit(0);
}

if (process.argv.includes('--verbose')) {
  CONFIG.verboseLogging = true;
}

if (process.argv.includes('--no-autosolve')) {
  CONFIG.enableAutoSolve = false;
}

// Run the main function
if (require.main === module) {
  main().catch((err) => {
    log(`Unhandled error: ${err.message}`, 'error');
    process.exit(1);
  });
}

module.exports = {
  runBestPractices,
  runCopilotSelfPrompt,
  runAutoSolve,
  runRouteHealthCheck,
  main,
};
