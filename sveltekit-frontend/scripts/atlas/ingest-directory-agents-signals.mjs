#!/usr/bin/env node
/**
 * Ingest directory-level AGENTS.md / llms.md guidance signals into atlas_directory_agents_signals
 * Pure function — no Drizzle, reads llms.md files, parses signals, outputs JSON for Postgres insertion
 *
 * Usage:
 *   node ingest-directory-agents-signals.mjs [--dry-run] [--save-json]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');
const dryRun = process.argv.includes('--dry-run');
const saveJson = process.argv.includes('--save-json');

/**
 * Parse llms.md / AGENTS.md into structured signals
 */
function parseLlmsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  const signals = {
    directory_path: null,
    file_count: 0,
    handler_count: 0,
    hardcoded_localhost_count: 0,
    paired_test_count: 0,
    som_cluster: null,
    available_tools: [],
    audit_gates: {},
    todos: [],
    export_count: 0,
    class_count: 0,
    function_count: 0,
    interface_count: 0
  };

  // Extract directory path from AGENTS.md header
  const dirMatch = content.match(/Directory:\s*([^\n]+)/i);
  if (dirMatch) {
    signals.directory_path = dirMatch[1].trim().replace(/^sveltekit-frontend\//, '');
  }

  // Extract snapshot (file count, handler count)
  const snapshotMatch = content.match(/(\d+)\s+file\(s\),\s+(\d+)\s+handler\(s\)/);
  if (snapshotMatch) {
    signals.file_count = parseInt(snapshotMatch[1], 10);
    signals.handler_count = parseInt(snapshotMatch[2], 10);
  }

  // Extract audit gates from table
  const gateMatch = content.match(/\|\s*Gate\s*\|[\s\S]*?\|\s*(G\d+)\s*\|([^|]+)\|([^|]+)\|/);
  if (gateMatch) {
    let gateSection = content.match(/## Audit Gates[\s\S]*?## /);
    if (gateSection) {
      const lines = gateSection[0].split('\n');
      lines.forEach(line => {
        const match = line.match(/\|\s*(G\d+)\s*\|\s*([✅❌]|PASS|FAIL)/);
        if (match) {
          const [, gate, status] = match;
          signals.audit_gates[gate] = status.includes('✅') || status === 'PASS' ? 'PASS' : 'FAIL';
        }
      });
    }
  }

  // Extract hardcoded localhost count (G17)
  const localhostMatch = content.match(/🟠\s*hardcoded localhost:\s*(\d+)/);
  if (localhostMatch) signals.hardcoded_localhost_count = parseInt(localhostMatch[1], 10);

  // Extract paired tests
  const pairMatch = content.match(/(\d+)\/\d+\s+files\s+have\s+paired\s+tests/i);
  if (pairMatch) signals.paired_test_count = parseInt(pairMatch[1], 10);

  // Extract SOM cluster (if present)
  const somMatch = content.match(/SOM\s+cluster:\s*(\d+)/i);
  if (somMatch) signals.som_cluster = parseInt(somMatch[1], 10);

  // Extract available tools
  const toolsMatch = content.match(/MCP tools.*?\n((?:- .+\n)+)/s);
  if (toolsMatch) {
    const toolLines = toolsMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
    signals.available_tools = toolLines
      .map(l => l.replace(/^-\s+/, '').trim())
      .filter(Boolean);
  }

  // Extract TODOs
  const todosMatch = content.match(/Todos\s*\+\s*Enhancements.*?\n((?:\s*- .+\n)+)/i);
  if (todosMatch) {
    const todoLines = todosMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
    signals.todos = todoLines
      .map(l => {
        const match = l.match(/\*\*\[([^\]]+)\]\*\*\s+\[([^\]]+)\]\s+(.+)/);
        if (match) {
          const [, priority, label, description] = match;
          return { priority, label, description };
        }
        return null;
      })
      .filter(Boolean);
  }

  return signals;
}

/**
 * Find all llms.md / AGENTS.md files recursively
 */
function findLlmsFiles(dir, maxDepth = 4, depth = 0, exclude = /node_modules|\.git|\.claude|\.cache|\.tmp|dist|build/) {
  const files = [];
  if (depth > maxDepth) return files;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.test(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findLlmsFiles(fullPath, maxDepth, depth + 1, exclude));
      } else if ((entry.name === 'llms.md' || entry.name === 'AGENTS.md') && entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Skip permission errors
  }

  return files;
}

/**
 * Generate Postgres INSERT statements
 */
function generateInsertStatements(signals) {
  const statements = [];

  for (const sig of signals) {
    if (!sig.directory_path) continue;

    const values = [
      `'${sig.directory_path.replace(/'/g, "''")}'`,  // directory_path
      sig.file_count,
      sig.handler_count,
      sig.hardcoded_localhost_count,
      sig.paired_test_count,
      sig.som_cluster !== null ? sig.som_cluster : 'NULL',
      `'${JSON.stringify(sig.available_tools).replace(/'/g, "''")}'::text[]`,
      `'${JSON.stringify(sig.audit_gates).replace(/'/g, "''")}'::jsonb`,
      `'${JSON.stringify(sig.todos).replace(/'/g, "''")}'::jsonb`,
      sig.export_count,
      sig.class_count,
      sig.function_count,
      sig.interface_count
    ];

    const stmt = `INSERT INTO atlas_directory_agents_signals (directory_path, file_count, handler_count, hardcoded_localhost_count, paired_test_count, som_cluster, available_tools, audit_gates, todos, export_count, class_count, function_count, interface_count) VALUES (${values.join(',')}) ON CONFLICT (directory_path) DO UPDATE SET file_count=EXCLUDED.file_count, handler_count=EXCLUDED.handler_count, hardcoded_localhost_count=EXCLUDED.hardcoded_localhost_count, paired_test_count=EXCLUDED.paired_test_count, som_cluster=EXCLUDED.som_cluster, available_tools=EXCLUDED.available_tools, audit_gates=EXCLUDED.audit_gates, todos=EXCLUDED.todos, last_updated=now();`;
    statements.push(stmt);
  }

  return statements;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log(`\n🔍 Scanning for llms.md / AGENTS.md files...\n`);

    const llmsFiles = findLlmsFiles(repoRoot);
    console.log(`✅ Found ${llmsFiles.length} files\n`);

    const signals = [];
    let successCount = 0;

    for (const filePath of llmsFiles) {
      try {
        const parsed = parseLlmsFile(filePath);
        if (parsed.directory_path) {
          const relPath = path.relative(repoRoot, filePath);
          console.log(`  ✓ ${relPath}`);
          console.log(`    → ${parsed.directory_path} (${parsed.file_count} files, G17: ${parsed.hardcoded_localhost_count})`);
          signals.push(parsed);
          successCount++;
        }
      } catch (err) {
        console.error(`  ✗ ${path.relative(repoRoot, filePath)}: ${err.message}`);
      }
    }

    console.log(`\n📊 SUMMARY\n`);
    console.log(`  Signals parsed: ${successCount}/${llmsFiles.length}`);
    console.log(`  Total G17 failures: ${signals.reduce((sum, s) => sum + s.hardcoded_localhost_count, 0)}`);
    console.log(`  Total files scanned: ${signals.reduce((sum, s) => sum + s.file_count, 0)}`);
    console.log(`  Directories with tools: ${signals.filter(s => s.available_tools.length > 0).length}\n`);

    if (dryRun) {
      console.log(`📋 DRY RUN: Would ingest ${successCount} signals\n`);
      console.log(`First 2 INSERT statements:\n`);
      const stmts = generateInsertStatements(signals.slice(0, 2));
      stmts.forEach(stmt => console.log(`${stmt.substring(0, 120)}...\n`));
    } else {
      console.log(`✨ Signals ready for ingestion into atlas_directory_agents_signals\n`);

      if (saveJson) {
        const jsonPath = path.join(repoRoot, 'docs/reports', 'directory-agents-signals.json');
        fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
        fs.writeFileSync(jsonPath, JSON.stringify({
          generated_at: new Date().toISOString(),
          signals_count: successCount,
          signals
        }, null, 2));
        console.log(`💾 Signals saved to: ${jsonPath}\n`);
      }
    }

    process.exit(successCount > 0 ? 0 : 1);
  } catch (err) {
    console.error(`\n❌ Fatal: ${err.message}\n`);
    process.exit(1);
  }
}

main();
