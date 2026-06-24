#!/usr/bin/env node
/**
 * Ingest directory-level AGENTS.md / llms.md guidance signals
 * Session 75: Parse llms.md files, extract audit gates and tool availability
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

function parseLlmsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const signals = {
    directory_path: null,
    file_count: 0,
    hardcoded_localhost_count: 0,
    paired_test_count: 0,
    available_tools: [],
    audit_gates: {},
    todos: []
  };

  const dirMatch = content.match(/Directory:\s*([^\n]+)/i);
  if (dirMatch) signals.directory_path = dirMatch[1].trim().replace(/^sveltekit-frontend\//, '');

  const snapshotMatch = content.match(/(\d+)\s+file\(s\),\s+(\d+)\s+handler\(s\)/);
  if (snapshotMatch) signals.file_count = parseInt(snapshotMatch[1], 10);

  const localhostMatch = content.match(/🟠\s*hardcoded localhost:\s*(\d+)/);
  if (localhostMatch) signals.hardcoded_localhost_count = parseInt(localhostMatch[1], 10);

  const toolsMatch = content.match(/MCP tools.*?\n((?:- .+\n)+)/s);
  if (toolsMatch) {
    const toolLines = toolsMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
    signals.available_tools = toolLines.map(l => l.replace(/^-\s+/, '').trim()).filter(Boolean);
  }

  return signals;
}

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
  } catch (err) { }
  return files;
}

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
      } catch (err) { }
    }

    console.log(`\n📊 SUMMARY\n`);
    console.log(`  Signals parsed: ${successCount}/${llmsFiles.length}`);
    console.log(`  Total G17 failures: ${signals.reduce((sum, s) => sum + s.hardcoded_localhost_count, 0)}`);
    console.log(`  Total files scanned: ${signals.reduce((sum, s) => sum + s.file_count, 0)}`);
    console.log(`  Directories with tools: ${signals.filter(s => s.available_tools.length > 0).length}\n`);

    if (process.argv.includes('--save-json')) {
      const jsonPath = path.join(repoRoot, 'docs/reports', 'directory-agents-signals.json');
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, JSON.stringify({
        generated_at: new Date().toISOString(),
        signals_count: successCount,
        signals
      }, null, 2));
      console.log(`💾 Signals saved to: ${jsonPath}\n`);
    }

    process.exit(successCount > 0 ? 0 : 1);
  } catch (err) {
    console.error(`\n❌ Fatal: ${err.message}\n`);
    process.exit(1);
  }
}

main();
