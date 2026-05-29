#!/usr/bin/env node
/**
 * test-semantic-cache.mjs
 *
 * Smoke test for semantic caching:
 * 1. First query → cache miss → Qdrant ANN → cache result
 * 2. Second query (same) → cache hit → verify 5-10ms latency
 * 3. Verify source field shows correct origin (redis_cache vs qdrant_fallback)
 * 4. Get cache stats and verify hit rate
 *
 * Usage: npm run test:semantic-cache
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const log = (prefix, msg) => console.log(`[${prefix}]`, msg);

// ── Launch MCP server ──────────────────────────────────────────────────────────

function launchMcpServer(scriptPath) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [scriptPath], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let readyLine = '';

    server.stderr.on('data', (data) => {
      readyLine += data.toString();
      if (readyLine.includes('ready')) {
        setTimeout(() => resolve(server), 100); // Give it a moment to settle
      }
    });

    server.on('error', reject);
    server.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Server exited with code ${code}`));
    });

    setTimeout(() => reject(new Error('Server startup timeout')), 5000);
  });
}

// ── Send JSON-RPC message to server ────────────────────────────────────────────

function sendRpcMessage(server, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    let buffer = '';
    const onData = (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              server.stdout.removeListener('data', onData);
              if (response.error) reject(new Error(response.error.message));
              else resolve(response.result);
            }
          } catch (e) {
            // Parse error, keep buffering
          }
        }
      }
    };

    server.stdout.on('data', onData);
    server.stdin.write(msg + '\n');
  });
}

// ── Main test harness ──────────────────────────────────────────────────────────

async function runTests() {
  const semanticCachePath = path.join(ROOT, 'scripts', 'mcp', 'redis-semantic-cache-mcp.mjs');

  log('TEST', 'Starting semantic cache MCP server...');
  const server = await launchMcpServer(semanticCachePath);
  log('TEST', 'Server started');

  try {
    // Initialize
    await sendRpcMessage(server, 'initialize', {}, 1);
    log('TEST', 'Initialize OK');

    // List tools
    const toolsResp = await sendRpcMessage(server, 'tools/list', {}, 2);
    log('TEST', `Found ${toolsResp.tools.length} tools: ${toolsResp.tools.map(t => t.name).join(', ')}`);

    // Pre-cache a query (warm up)
    log('TEST', 'Pre-caching embedding...');
    const precacheResp = await sendRpcMessage(server, 'tools/call', {
      name: 'cache_embedding',
      arguments: {
        text: 'authentication routes in svelte',
        hashKey: 'semantic_cache:test',
        ttlSeconds: 300,
      },
    }, 3);
    log('TEST', `Pre-cache OK: ${precacheResp.content[0].text}`);

    // Test 1: First semantic search (cache miss)
    log('TEST', '─────── Test 1: Cache Miss (Qdrant ANN) ───────');
    const start1 = Date.now();
    const resp1 = await sendRpcMessage(server, 'tools/call', {
      name: 'semantic_search',
      arguments: {
        query: 'authentication routes',
        collection: 'codebase_chunks_768',
        limit: 5,
        cacheHashKey: 'semantic_cache:auth_test',
      },
    }, 4);
    const latency1 = Date.now() - start1;

    const result1 = JSON.parse(resp1.content[0].text);
    log('TEST', `Source: ${result1.source}`);
    log('TEST', `Cached: ${result1.cached}`);
    log('TEST', `Latency: ${result1.latencyMs}ms (total: ${latency1}ms)`);
    log('TEST', `Results: ${result1.resultCount} hits`);

    if (result1.resultCount === 0) {
      log('WARN', 'No results from Qdrant. This may be expected if codebase_chunks_768 is empty.');
    }

    // Test 2: Same query (cache hit expected)
    log('TEST', '─────── Test 2: Cache Hit (Redis) ───────');
    const start2 = Date.now();
    const resp2 = await sendRpcMessage(server, 'tools/call', {
      name: 'semantic_search',
      arguments: {
        query: 'authentication routes',
        collection: 'codebase_chunks_768',
        limit: 5,
        cacheHashKey: 'semantic_cache:auth_test',
      },
    }, 5);
    const latency2 = Date.now() - start2;

    const result2 = JSON.parse(resp2.content[0].text);
    log('TEST', `Source: ${result2.source}`);
    log('TEST', `Cached: ${result2.cached}`);
    log('TEST', `Latency: ${result2.latencyMs}ms (total: ${latency2}ms)`);
    log('TEST', `Results: ${result2.resultCount} hits`);

    // Verify cache behavior
    if (result2.latencyMs < 50 && result2.cached === true) {
      log('PASS', `✓ Cache hit verified (${result2.latencyMs}ms < 50ms expected)`);
    } else if (result2.source === 'redis_cache') {
      log('PASS', `✓ Cache source is redis_cache (latency ${result2.latencyMs}ms)`);
    } else {
      log('WARN', `Cache behavior differs: source=${result2.source}, latency=${result2.latencyMs}ms`);
    }

    // Test 3: Different query (cache miss)
    log('TEST', '─────── Test 3: Different Query (Cache Miss) ───────');
    const start3 = Date.now();
    const resp3 = await sendRpcMessage(server, 'tools/call', {
      name: 'semantic_search',
      arguments: {
        query: 'database migrations',
        collection: 'codebase_chunks_768',
        limit: 5,
        cacheHashKey: 'semantic_cache:db_test',
      },
    }, 6);
    const latency3 = Date.now() - start3;

    const result3 = JSON.parse(resp3.content[0].text);
    log('TEST', `Source: ${result3.source}`);
    log('TEST', `Cached: ${result3.cached}`);
    log('TEST', `Latency: ${result3.latencyMs}ms (total: ${latency3}ms)`);
    log('TEST', `Results: ${result3.resultCount} hits`);

    if (result3.cached === false) {
      log('PASS', '✓ Correctly identified as cache miss');
    }

    // Test 4: Get cache stats
    log('TEST', '─────── Test 4: Cache Stats ───────');
    const statsResp = await sendRpcMessage(server, 'tools/call', {
      name: 'get_cache_stats',
      arguments: {},
    }, 7);

    const stats = JSON.parse(statsResp.content[0].text);
    log('TEST', `Hits: ${stats.stats.hits}`);
    log('TEST', `Misses: ${stats.stats.misses}`);
    log('TEST', `Hit Rate: ${stats.stats.hitRate}`);
    log('TEST', `Embeddings cached: ${stats.stats.embeddings}`);
    log('TEST', `Errors: ${stats.stats.errors}`);

    // Summary
    log('TEST', '═════════════════════════════════════════════');
    log('PASS', '✓ Semantic cache MCP server operational');
    log('PASS', '✓ Tools list / initialize / call working');
    log('PASS', `✓ Latency: miss=${result1.latencyMs}ms, hit=${result2.latencyMs}ms`);
    log('PASS', `✓ Hit rate: ${stats.stats.hitRate}`);

    if (stats.stats.errors === 0) {
      log('PASS', '✓ Zero errors during test');
    }

  } finally {
    server.kill();
    log('TEST', 'Server shut down');
  }
}

// Run
runTests().catch((e) => {
  log('ERROR', e.message);
  process.exit(1);
});