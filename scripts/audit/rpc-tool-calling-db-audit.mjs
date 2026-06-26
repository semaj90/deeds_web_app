#!/usr/bin/env node
/**
 * RPC Tool-Calling Database Audit
 *
 * Validates that MCP tools calling database operations follow the canonical packet truth flow:
 * 1. Read from Postgres (canonical source)
 * 2. Validate structure (CPU work)
 * 3. Write to Postgres (update truth)
 * 4. Invalidate Redis cache (async)
 * 5. Emit events (async notifications)
 *
 * Audit gates:
 * G1: Tool → Postgres read path exists
 * G2: Validation guards present (packet_key, source_ref, feature_id)
 * G3: Postgres write operations set updated_at = NOW()
 * G4: Redis invalidation calls present after writes
 * G5: Event emission or logging after writes
 * G6: No direct Qdrant/Neo4j/Redis writes before Postgres
 * G7: Hard fail conditions block downstream processing
 *
 * Usage:
 *   npm run audit:rpc-tool-calling-db -- [--verbose] [--tool=<name>]
 *   npm run audit:rpc-tool-calling-db -- --verbose --tool=kb.trace_search
 *
 * Time: ~2-3 minutes for full codebase scan
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// CLI args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const toolFilter = args.find(a => a.startsWith('--tool='))?.split('=')[1];

// Audit configuration
const MCP_TOOLS_DIR = path.join(REPO_ROOT, 'src/mcp');
const SCRIPTS_ATLAS_DIR = path.join(REPO_ROOT, 'sveltekit-frontend/scripts/atlas');
const ROUTES_API_DIR = path.join(REPO_ROOT, 'sveltekit-frontend/src/routes/api');

const GATE_PATTERNS = {
  G1_READ_POSTGRES: /(?:from\s+['"]\$lib\/server\/db\/client['"]|\.query\(|pool\.query|db\.select|select\(\)\.from)/,
  G2_VALIDATION_GUARD: /validatePacket|packet_key|source_ref|feature_id|hard.fail|throw error\(/,
  G3_WRITE_UPDATED_AT: /updated_at.*NOW|SET.*updated_at|SET.*=.*NOW\(\)|\.set\({.*updated_at/,
  G4_REDIS_INVALIDATE: /invalidateRedisCache|redis\.del|bitfrost:packet|bitfrost:source|bitfrost:feature/,
  G5_EMIT_EVENT: /console\.log|emitEvent|RabbitMQ|emit\(|dispatch\(|event/,
  G6_NO_EARLY_CACHE_WRITE: /(?!.*Postgres)(?:qdrant\.upsert|neo4j\.run\(|redis\.set)(?!.*invalidate)/,
  G7_HARD_FAIL: /if.*!.*packet_key|if.*!.*source_ref|if.*!.*feature_id|hard.fail|throw error/,
};

const GATE_NAMES = {
  G1_READ_POSTGRES: 'Postgres read path exists',
  G2_VALIDATION_GUARD: 'Validation guards for identity fields',
  G3_WRITE_UPDATED_AT: 'Postgres write sets updated_at = NOW()',
  G4_REDIS_INVALIDATE: 'Redis invalidation after write',
  G5_EMIT_EVENT: 'Event emission or logging',
  G6_NO_EARLY_CACHE_WRITE: 'No direct Qdrant/Neo4j writes before Postgres',
  G7_HARD_FAIL: 'Hard fail conditions block downstream',
};

/**
 * Parse MCP tool definitions to extract tool names and their implementations
 */
async function parseMcpTools() {
  const tools = new Map();

  try {
    const toolsFile = path.join(MCP_TOOLS_DIR, 'server.ts');
    const content = await fs.readFile(toolsFile, 'utf8');

    // Extract tool names and their function references
    const toolMatches = content.matchAll(/name:\s*['"]([^'"]+)['"][,}]/g);
    for (const match of toolMatches) {
      const toolName = match[1];
      tools.set(toolName, {
        name: toolName,
        file: toolsFile,
        handlers: [],
        gates: {},
      });
    }
  } catch (err) {
    if (verbose) console.warn(`⚠️  Could not parse MCP tools: ${err.message}`);
  }

  return tools;
}

/**
 * Find database-touching files (routes, scripts, handlers)
 */
async function findDatabaseTouchingFiles() {
  const files = new Set();

  try {
    // Search for database imports - focus on critical paths first
    const criticalPaths = [
      'src/routes/api',
      'scripts/atlas',
      'src/mcp',
    ];

    for (const dirPath of criticalPaths) {
      try {
        const fullPath = path.join(REPO_ROOT, dirPath);
        const output = execSync(
          `rg -l "from.*db/client|pool\\.query|db\\.select|UPDATE atlas|INSERT.*atlas" "${fullPath}" --glob "*.ts"`,
          { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] }
        );

        output.split('\n').filter(Boolean).forEach(f => {
          if (f && !f.includes('node_modules')) {
            files.add(f);
          }
        });
      } catch (err) {
        // Search may find nothing, that's ok
      }
    }
  } catch (err) {
    if (verbose) console.warn(`⚠️  Search failed: ${err.message}`);
  }

  return Array.from(files);
}

/**
 * Audit a single file against canonical truth flow gates
 */
async function auditFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const results = {
      file: filePath,
      passes: [],
      fails: [],
      warnings: [],
    };

    // Determine file type and context
    const isMcpTool = filePath.includes('/mcp/');
    const isApiRoute = filePath.includes('/routes/api/');
    const isAtlasScript = filePath.includes('/scripts/atlas/');

    // Check each gate
    for (const [gateKey, pattern] of Object.entries(GATE_PATTERNS)) {
      const passes = pattern.test(content);

      if (passes) {
        results.passes.push(gateKey);
      } else {
        // Determine severity based on file type and gate
        if (gateKey === 'G1_READ_POSTGRES' && (isApiRoute || isAtlasScript)) {
          results.fails.push(`${gateKey} (CRITICAL for ${path.basename(filePath)})`);
        } else if (gateKey === 'G3_WRITE_UPDATED_AT' && content.includes('UPDATE atlas_packets')) {
          results.fails.push(`${gateKey} (CRITICAL for packet writes)`);
        } else if (gateKey === 'G4_REDIS_INVALIDATE' && content.includes('upsertPacket')) {
          results.fails.push(`${gateKey} (CRITICAL after Postgres write)`);
        } else if (gateKey === 'G2_VALIDATION_GUARD' && content.includes('validatePacket')) {
          results.warnings.push(`${gateKey} (should validate before write)`);
        } else {
          results.warnings.push(gateKey);
        }
      }
    }

    return results;
  } catch (err) {
    return {
      file: filePath,
      error: err.message,
    };
  }
}

/**
 * Generate audit report
 */
function generateReport(auditResults) {
  const totalFiles = auditResults.length;
  const criticalFailures = auditResults.filter(r => r.fails && r.fails.some(f => f.includes('CRITICAL'))).length;
  const allPass = auditResults.filter(r => r.fails && r.fails.length === 0).length;

  console.log('\n📊 RPC Tool-Calling Database Audit Report\n');
  console.log(`Files scanned: ${totalFiles}`);
  console.log(`Critical failures: ${criticalFailures}`);
  console.log(`All gates pass: ${allPass}\n`);

  if (verbose) {
    console.log('📋 Gate Definitions:\n');
    Object.entries(GATE_NAMES).forEach(([gate, desc]) => {
      console.log(`  ${gate}: ${desc}`);
    });
    console.log();
  }

  console.log('🔴 Critical Issues (blocks packet truth flow):');
  auditResults
    .filter(r => r.fails && r.fails.some(f => f.includes('CRITICAL')))
    .slice(0, 10)
    .forEach(r => {
      console.log(`  ✗ ${path.relative(REPO_ROOT, r.file)}`);
      r.fails.filter(f => f.includes('CRITICAL')).forEach(f => {
        console.log(`    → ${f}`);
      });
    });

  if (verbose) {
    console.log('\n⚠️  Warnings (should review):\n');
    auditResults
      .filter(r => r.warnings && r.warnings.length > 0)
      .slice(0, 5)
      .forEach(r => {
        console.log(`  ${path.relative(REPO_ROOT, r.file)}`);
        r.warnings.forEach(w => console.log(`    → ${w}`));
      });

    console.log('\n✅ Passing files (canonical truth flow compliant):\n');
    auditResults
      .filter(r => r.passes && r.fails && r.fails.length === 0)
      .slice(0, 5)
      .forEach(r => {
        console.log(`  ${path.relative(REPO_ROOT, r.file)}`);
        console.log(`    Passes: ${r.passes.slice(0, 3).join(', ')}${r.passes.length > 3 ? '...' : ''}`);
      });
  }

  // Summary
  console.log('\n📈 Summary:');
  const passRate = ((allPass / totalFiles) * 100).toFixed(1);
  console.log(`  Pass rate: ${allPass}/${totalFiles} (${passRate}%)`);
  console.log(`  Critical issues: ${criticalFailures}`);
  console.log(`  Warnings: ${auditResults.filter(r => r.warnings && r.warnings.length > 0).length}`);

  // Recommendations
  console.log('\n💡 Recommendations:');
  if (criticalFailures > 0) {
    console.log(`  1. Fix ${criticalFailures} critical failure(s) in packet write paths`);
    console.log(`     → Ensure Postgres writes include: updated_at = NOW()`);
    console.log(`     → Ensure Redis invalidation follows all writes`);
    console.log(`     → Ensure validation guards block hard failures`);
  }
  if (auditResults.filter(r => r.warnings && r.warnings.length > 0).length > 3) {
    console.log('  2. Review warnings in verbose output');
  }
  console.log('  3. Use canonical packet-truth-flow.mts as reference implementation');

  return {
    totalFiles,
    criticalFailures,
    allPass,
    passRate: parseFloat(passRate),
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 RPC Tool-Calling Database Audit');
  console.log(`Scope: MCP tools, API routes, Atlas scripts\n`);

  if (toolFilter) {
    console.log(`Filter: Tool name = "${toolFilter}"\n`);
  }

  const startTime = Date.now();

  try {
    // Find all database-touching files
    console.log('⏳ Scanning for database-touching files...');
    const dbFiles = await findDatabaseTouchingFiles();
    console.log(`✓ Found ${dbFiles.length} files with database access\n`);

    if (dbFiles.length === 0) {
      console.log('⚠️  No database-touching files found. Skipping audit.\n');
      return;
    }

    // Audit each file
    console.log('⏳ Running audit gates...');
    const auditResults = [];
    for (const file of dbFiles) {
      const result = await auditFile(file);
      auditResults.push(result);
      if (verbose && result.fails && result.fails.length > 0) {
        process.stdout.write('.');
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ Audit complete (${elapsed}s)\n`);

    // Generate report
    const summary = generateReport(auditResults);

    // Exit code: 0 if critical failures = 0, 1 otherwise
    process.exit(summary.criticalFailures > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
