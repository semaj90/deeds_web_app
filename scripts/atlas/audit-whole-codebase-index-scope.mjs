#!/usr/bin/env node
/**
 * Phase D: Whole-Codebase Index Scope Audit
 *
 * Verify what can be indexed from repo root:
 * - File count by type (source_code, config, docs, proto, sql, etc.)
 * - Size classification (text-safe vs binary/artifact)
 * - Exclusion rules applied
 * - Indexable corpus size
 *
 * Output: JSON + Markdown reports
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');

const EXCLUDE_PATTERNS = [
  '.git',
  'node_modules',
  '.svelte-kit',
  '.vite',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.pytest_cache',
  '__pycache__',
  'models',
  '.opencode',
  'deeds_labs',
  '.claude',
];

const FILE_TYPE_PATTERNS = {
  source_code: /\.(ts|tsx|svelte|js|jsx|mjs|cjs|py|go|rs|java|cpp|c|h|rb|php)$/,
  config: /\.(json|yaml|yml|toml|ini|conf|xml)$|^\.(env|gitignore|npmrc|prettierrc|eslintrc)$/,
  proto: /\.proto$/,
  sql: /\.sql$/,
  docs: /\.(md|mdx|txt|rst)$/,
  test: /\.test\.(ts|js)|\.spec\.(ts|js)$/,
  generated: /\.generated\.(ts|js)|\.pb\.(ts|js)|\.pb\.go$/,
  build_artifact: /\.(o|obj|so|dll|dylib|exe|pyc|pyo|class)$/,
  cold_artifact: /\.(gguf|bin|pt|safetensors|tar|gz|zip|7z)$/,
};

/**
 * Scan repo with ripgrep and classify files
 */
async function auditCodebaseScope() {
  const excludeArgs = EXCLUDE_PATTERNS.map(p => `--glob=!${p}`).join(' ');

  try {
    // Use rg to list all files
    const cmd = `rg --files -uuu ${excludeArgs}`;
    const fileList = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

    const classification = {
      source_code: [],
      config: [],
      proto: [],
      sql: [],
      docs: [],
      test: [],
      generated: [],
      build_artifact: [],
      cold_artifact: [],
      other: [],
    };

    const stats = {
      total_files: fileList.length,
      total_size_bytes: 0,
      indexable_files: 0,
      indexable_size_bytes: 0,
      by_type: {},
      excluded_count: 0,
      excluded_size_bytes: 0,
    };

    for (const file of fileList) {
      const fullPath = path.join(REPO_ROOT, file);

      let type = 'other';
      for (const [typeKey, pattern] of Object.entries(FILE_TYPE_PATTERNS)) {
        if (pattern.test(path.basename(file))) {
          type = typeKey;
          break;
        }
      }

      let size = 0;
      try {
        const stat = fs.statSync(fullPath);
        size = stat.size;
        stats.total_size_bytes += size;
      } catch {
        // Skip files we can't stat
      }

      classification[type].push({
        path: file,
        size: size,
        indexable: type === 'source_code' || type === 'config' || type === 'sql' || type === 'docs' || type === 'test',
      });

      if (type !== 'build_artifact' && type !== 'cold_artifact') {
        stats.indexable_files += 1;
        stats.indexable_size_bytes += size;
      }

      if (!stats.by_type[type]) {
        stats.by_type[type] = { count: 0, size: 0 };
      }
      stats.by_type[type].count += 1;
      stats.by_type[type].size += size;
    }

    return { classification, stats };
  } catch (err) {
    console.error('[error]', err.message);
    return { classification: {}, stats: { error: err.message } };
  }
}

/**
 * Generate JSON report
 */
function generateJsonReport(classification, stats) {
  return {
    generated_at: new Date().toISOString(),
    repo_root: REPO_ROOT,
    exclusion_patterns: EXCLUDE_PATTERNS,
    statistics: stats,
    files_by_type: Object.fromEntries(
      Object.entries(classification).map(([type, files]) => [
        type,
        {
          count: files.length,
          total_size_bytes: files.reduce((sum, f) => sum + f.size, 0),
          files: files.slice(0, 50), // Limit to first 50 for brevity
        },
      ])
    ),
  };
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(classification, stats) {
  const lines = [
    '# Whole-Codebase Index Scope Audit',
    `Generated: ${new Date().toISOString()}`,
    `Repo Root: ${REPO_ROOT}`,
    '',
    '## Summary',
    `- **Total Files**: ${stats.total_files}`,
    `- **Total Size**: ${(stats.total_size_bytes / 1024 / 1024).toFixed(2)} MB`,
    `- **Indexable Files**: ${stats.indexable_files}`,
    `- **Indexable Size**: ${(stats.indexable_size_bytes / 1024 / 1024).toFixed(2)} MB`,
    '',
    '## Files by Type',
    '',
  ];

  for (const [type, typeStats] of Object.entries(stats.by_type)) {
    const pct = stats.total_files > 0 ? ((typeStats.count / stats.total_files) * 100).toFixed(1) : '0';
    lines.push(`### ${type}`);
    lines.push(`- **Count**: ${typeStats.count} (${pct}%)`);
    lines.push(`- **Size**: ${(typeStats.size / 1024 / 1024).toFixed(2)} MB`);
    lines.push('');
  }

  lines.push('## Exclusion Rules');
  lines.push('');
  for (const pattern of EXCLUDE_PATTERNS) {
    lines.push(`- \`${pattern}\``);
  }

  lines.push('');
  lines.push('## Indexability');
  lines.push('');
  lines.push('**Indexable** (text-safe):');
  lines.push('- source_code');
  lines.push('- config');
  lines.push('- sql');
  lines.push('- docs');
  lines.push('- test');
  lines.push('');
  lines.push('**Metadata-only** (no full-text):');
  lines.push('- generated');
  lines.push('- proto');
  lines.push('');
  lines.push('**Not indexed** (binary/artifacts):');
  lines.push('- build_artifact');
  lines.push('- cold_artifact');

  return lines.join('\n');
}

/**
 * Main
 */
async function main() {
  console.log('[phase-d-scope] Whole-Codebase Index Scope Audit');
  console.log(`[phase-d-scope] Repo Root: ${REPO_ROOT}\n`);

  const { classification, stats } = await auditCodebaseScope();

  const jsonReport = generateJsonReport(classification, stats);
  const mdReport = generateMarkdownReport(classification, stats);

  const jsonPath = path.join(REPO_ROOT, 'docs/reports/whole-codebase-index-scope.json');
  const mdPath = path.join(REPO_ROOT, 'docs/reports/whole-codebase-index-scope.md');

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));
  await fs.writeFile(mdPath, mdReport);

  console.log(`[phase-d-scope] ✅ Scope audit complete`);
  console.log(`[phase-d-scope] JSON: ${jsonPath}`);
  console.log(`[phase-d-scope] Markdown: ${mdPath}`);
  console.log(`\n[summary]`);
  console.log(`  Total files: ${stats.total_files}`);
  console.log(`  Indexable: ${stats.indexable_files} (${(stats.indexable_size_bytes / 1024 / 1024).toFixed(2)} MB)`);
}

main();
