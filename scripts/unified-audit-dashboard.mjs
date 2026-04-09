#!/usr/bin/env node
/**
 * Unified Audit Dashboard CLI
 *
 * Combines GPU audit (Neo4j + LibTorch + Qdrant) with 10-layer import audit
 * into a single comprehensive report.
 *
 * Usage:
 *   node scripts/unified-audit-dashboard.mjs                    # Full audit
 *   node scripts/unified-audit-dashboard.mjs --quick            # Import audit only (no GPU)
 *   node scripts/unified-audit-dashboard.mjs --gpu-only         # GPU audit only
 *   node scripts/unified-audit-dashboard.mjs --json             # JSON output
 *   node scripts/unified-audit-dashboard.mjs --serve            # Start dashboard server
 *
 * Requires:
 *   - Dev server running on http://localhost:5173 (for GPU audit)
 *   - Docker services (Neo4j, Qdrant, Ollama) for full audit
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'http://localhost:5173';
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 9999;

// ─────────────────────────────────────────────────────────────────────
// HTTP Client
// ─────────────────────────────────────────────────────────────────────

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────
// GPU Audit Runner
// ─────────────────────────────────────────────────────────────────────

async function runGPUAudit(options = {}) {
  console.log('\n🔥 Running GPU Audit (Neo4j + LibTorch + Qdrant)...\n');

  const payload = {
    maxNodes: options.maxNodes || 500,
    maxVectors: options.maxVectors || 500,
    dupThreshold: options.dupThreshold || 0.92,
    halfPrecision: options.halfPrecision || false,
    persist: true,
  };

  try {
    const result = await httpRequest(`${API_BASE}/api/audit/gpu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    if (!result.success) {
      throw new Error(result.error || 'GPU audit failed');
    }

    return {
      success: true,
      report: result.report,
      timing: result.report?.timing || {},
      stats: {
        centralFiles: result.report?.centralFiles?.length || 0,
        communities: result.report?.communities?.length || 0,
        duplicates: result.report?.stats?.duplicatePairCount || 0,
        clusters: result.report?.stats?.clusterCount || 0,
      },
    };
  } catch (error) {
    console.error('❌ GPU Audit failed:', error.message);
    return {
      success: false,
      error: error.message,
      stats: { centralFiles: 0, communities: 0, duplicates: 0, clusters: 0 },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 10-Layer Import Audit Runner
// ─────────────────────────────────────────────────────────────────────

function runImportAudit() {
  console.log('\n🔍 Running 10-Layer Import Audit (Orphan Detection)...\n');

  try {
    const output = execSync(
      `node ${join(projectRoot, 'scripts', '10-layer-audit-cli.mjs')} --orphan-scan --json`,
      { cwd: projectRoot, encoding: 'utf-8' }
    );

    const result = JSON.parse(output);

    // Extract summary from orphan scan output
    const orphanCount = result.orphans?.length || 0;
    const wiredCount = result.totalReferences || 0;

    return {
      success: true,
      orphanCount,
      wiredCount,
      orphans: result.orphans || [],
      layers: result.layers || {},
    };
  } catch (error) {
    console.error('❌ Import Audit failed:', error.message);
    return {
      success: false,
      error: error.message,
      orphanCount: 0,
      wiredCount: 0,
      orphans: [],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Unified Report Generator
// ─────────────────────────────────────────────────────────────────────

async function generateUnifiedReport(options = {}) {
  const startTime = Date.now();
  const report = {
    timestamp: new Date().toISOString(),
    mode: options.quick ? 'import-only' : options.gpuOnly ? 'gpu-only' : 'full',
    gpu: null,
    importAudit: null,
    summary: {},
    timing: {},
  };

  // Run GPU audit (unless --quick)
  if (!options.quick) {
    const gpuResult = await runGPUAudit(options);
    report.gpu = gpuResult;
    report.timing.gpu_ms = gpuResult.timing?.total_ms || 0;
  }

  // Run import audit (unless --gpu-only)
  if (!options.gpuOnly) {
    const importStart = Date.now();
    const importResult = runImportAudit();
    report.importAudit = importResult;
    report.timing.import_ms = Date.now() - importStart;
  }

  // Generate summary
  report.summary = {
    criticalFiles: report.gpu?.stats?.centralFiles || 0,
    communities: report.gpu?.stats?.communities || 0,
    duplicates: report.gpu?.stats?.duplicates || 0,
    clusters: report.gpu?.stats?.clusters || 0,
    orphans: report.importAudit?.orphanCount || 0,
    wired: report.importAudit?.wiredCount || 0,
    health: calculateHealthScore(report),
  };

  report.timing.total_ms = Date.now() - startTime;

  return report;
}

// ─────────────────────────────────────────────────────────────────────
// Health Score Calculator
// ─────────────────────────────────────────────────────────────────────

function calculateHealthScore(report) {
  let score = 100;

  // Penalize high orphan count
  const orphanRatio = report.importAudit?.orphanCount / (report.importAudit?.wiredCount || 1);
  score -= Math.min(orphanRatio * 30, 30);

  // Penalize high duplicate count
  const duplicates = report.gpu?.stats?.duplicates || 0;
  score -= Math.min(duplicates * 2, 20);

  // Bonus for good community structure
  const communities = report.gpu?.stats?.communities || 0;
  if (communities >= 5 && communities <= 15) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─────────────────────────────────────────────────────────────────────
// Console Report Renderer
// ─────────────────────────────────────────────────────────────────────

function renderConsoleReport(report) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  UNIFIED AUDIT DASHBOARD                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Timestamp: ${report.timestamp}`);
  console.log(`⚙️  Mode: ${report.mode}\n`);

  console.log('─────────────────────────────────────────────────────────────');
  console.log('  SUMMARY');
  console.log('─────────────────────────────────────────────────────────────');

  if (report.gpu?.success) {
    console.log(`  🧠 Central Files (PageRank):  ${report.summary.criticalFiles}`);
    console.log(`  🌐 Communities (Graph):       ${report.summary.communities}`);
    console.log(`  📦 K-Means Clusters:          ${report.summary.clusters}`);
    console.log(`  🔄 Near-Duplicates (≥0.92):   ${report.summary.duplicates}`);
  }

  if (report.importAudit?.success) {
    console.log(`  🔗 Wired Components:          ${report.summary.wired}`);
    console.log(`  ✗  Orphan Candidates:         ${report.summary.orphans}`);
  }

  console.log(`\n  💚 Health Score:              ${report.summary.health}/100\n`);

  console.log('─────────────────────────────────────────────────────────────');
  console.log('  TIMING');
  console.log('─────────────────────────────────────────────────────────────');
  if (report.timing.gpu_ms) {
    console.log(`  GPU Audit:     ${report.timing.gpu_ms}ms`);
  }
  if (report.timing.import_ms) {
    console.log(`  Import Audit:  ${report.timing.import_ms}ms`);
  }
  console.log(`  Total:         ${report.timing.total_ms}ms\n`);

  if (report.gpu?.report?.centralFiles) {
    console.log('─────────────────────────────────────────────────────────────');
    console.log('  TOP 5 CRITICAL FILES (PageRank)');
    console.log('─────────────────────────────────────────────────────────────');
    report.gpu.report.centralFiles.slice(0, 5).forEach((file, i) => {
      console.log(`  ${i + 1}. ${file.title}`);
      console.log(`     Score: ${file.pageRankScore.toFixed(4)} | Community: ${file.communityId}`);
    });
    console.log('');
  }

  if (report.importAudit?.orphans?.length > 0) {
    console.log('─────────────────────────────────────────────────────────────');
    console.log('  ORPHAN CANDIDATES');
    console.log('─────────────────────────────────────────────────────────────');
    report.importAudit.orphans.slice(0, 10).forEach((orphan) => {
      console.log(`  ✗ ${orphan}`);
    });
    if (report.importAudit.orphans.length > 10) {
      console.log(`  ... and ${report.importAudit.orphans.length - 10} more`);
    }
    console.log('');
  }

  console.log('═════════════════════════════════════════════════════════════\n');
}

// ─────────────────────────────────────────────────────────────────────
// Dashboard HTTP Server
// ─────────────────────────────────────────────────────────────────────

function startDashboardServer() {
  let cachedReport = null;

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.url === '/audit' && req.method === 'POST') {
      console.log('📡 Regenerating unified audit report...');
      cachedReport = await generateUnifiedReport();
      res.writeHead(200);
      res.end(JSON.stringify(cachedReport));
    } else if (req.url === '/audit' && req.method === 'GET') {
      if (!cachedReport) {
        cachedReport = await generateUnifiedReport();
      }
      res.writeHead(200);
      res.end(JSON.stringify(cachedReport));
    } else if (req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(DASHBOARD_PORT, () => {
    console.log(`\n🚀 Unified Audit Dashboard Server`);
    console.log(`   Listening on http://localhost:${DASHBOARD_PORT}`);
    console.log(`   Endpoints:`);
    console.log(`     GET  /audit   - Get cached report`);
    console.log(`     POST /audit   - Regenerate report`);
    console.log(`     GET  /health  - Server health\n`);
  });
}

// ─────────────────────────────────────────────────────────────────────
// Command Line Parser
// ─────────────────────────────────────────────────────────────────────

function parseArgs(args) {
  return {
    quick: args.includes('--quick'),
    gpuOnly: args.includes('--gpu-only'),
    json: args.includes('--json'),
    serve: args.includes('--serve'),
    help: args.includes('--help') || args.includes('-h'),
    maxNodes: parseInt(args[args.indexOf('--max-nodes') + 1]) || 500,
    maxVectors: parseInt(args[args.indexOf('--max-vectors') + 1]) || 500,
    halfPrecision: args.includes('--half-precision'),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Help Text
// ─────────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
Unified Audit Dashboard

Usage:
  node scripts/unified-audit-dashboard.mjs [options]

Options:
  --quick             Import audit only (skip GPU audit)
  --gpu-only          GPU audit only (skip import audit)
  --json              Output as JSON
  --serve             Start HTTP dashboard server
  --max-nodes <n>     Max Neo4j nodes (default: 500)
  --max-vectors <n>   Max Qdrant vectors (default: 500)
  --half-precision    Use FP16 for LibTorch (faster, less accurate)
  --help, -h          Show this help

Examples:
  # Full audit (GPU + Import)
  node scripts/unified-audit-dashboard.mjs

  # Quick import audit only
  node scripts/unified-audit-dashboard.mjs --quick

  # Start dashboard server
  node scripts/unified-audit-dashboard.mjs --serve

  # Large batch with half-precision
  node scripts/unified-audit-dashboard.mjs --max-nodes 1000 --half-precision

API Endpoints (when using --serve):
  GET  http://localhost:9999/audit    # Get cached report
  POST http://localhost:9999/audit    # Regenerate report
  GET  http://localhost:9999/health   # Server health
`);
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.serve) {
    startDashboardServer();
    return;
  }

  const report = await generateUnifiedReport(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderConsoleReport(report);
  }

  process.exit(report.summary.health >= 70 ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
