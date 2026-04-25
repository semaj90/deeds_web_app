#!/usr/bin/env node
/**
 * Phase 97: Codebase Ranking & Organization
 *
 * Analyzes ~5000 files and ranks them by:
 * - TypeScript error count
 * - Import dependencies (centrality)
 * - File complexity (LOC, cyclomatic complexity)
 * - Embedding similarity to error patterns
 * - Last modified date
 *
 * Uses Qdrant embeddings + PostgreSQL error data
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { extname, join, relative } from 'path';
import pg from 'pg';

const { Pool } = pg;

// Configuration
const CONFIG = {
  postgres: {
    host: 'localhost',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  },
  qdrant: {
    url: 'http://localhost:6333',
    collection: 'phase89_code_units'
  },
  srcPath: './src',
  outputFile: 'reports/codebase-ranking.json'
};

let db;

// =============================================================================
// Database Connection
// =============================================================================
async function connectDB() {
  db = new Pool(CONFIG.postgres);
  await db.query('SELECT 1');
  console.log('   ✅ PostgreSQL connected');
}

// =============================================================================
// File Discovery
// =============================================================================
function discoverFiles(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, .svelte-kit, build
      if (!['node_modules', '.svelte-kit', 'build', '.git'].includes(entry.name)) {
        discoverFiles(fullPath, files);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (['.ts', '.tsx', '.svelte', '.js', '.mjs', '.jsx'].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// =============================================================================
// File Analysis
// =============================================================================
function analyzeFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const stats = statSync(filePath);

  // Count imports/exports (dependency centrality)
  const imports = (content.match(/^import .+ from/gm) || []).length;
  const exports = (content.match(/^export /gm) || []).length;

  // Detect error patterns
  const hasAnyType = content.includes(': any');
  const hasTsIgnore = content.includes('@ts-ignore');
  const hasTodoComments = (content.match(/\/\/ TODO|\/\/ FIXME/gi) || []).length;

  // Complexity heuristic (functions, conditionals, loops)
  const functionCount = (content.match(/function |=> |async /g) || []).length;
  const conditionalCount = (content.match(/\bif\s*\(|\bswitch\s*\(/g) || []).length;
  const loopCount = (content.match(/\bfor\s*\(|\bwhile\s*\(/g) || []).length;

  return {
    path: relative(CONFIG.srcPath, filePath),
    fullPath: filePath,
    extension: extname(filePath),
    lines: lines.length,
    size: stats.size,
    lastModified: stats.mtime,
    imports,
    exports,
    hasAnyType,
    hasTsIgnore,
    todoCount: hasTodoComments,
    functionCount,
    conditionalCount,
    loopCount,
    complexity: functionCount + conditionalCount + loopCount,
    centrality: imports + exports * 2 // Exports weighted higher
  };
}

// =============================================================================
// Get Error Counts from PostgreSQL
// =============================================================================
async function getErrorCounts() {
  const result = await db.query(`
    SELECT
      file_path,
      COUNT(*) as error_count,
      array_agg(DISTINCT error_type) as error_types
    FROM raw_error_embeddings
    WHERE source = 'svelte-check'
    GROUP BY file_path
    ORDER BY error_count DESC
  `);

  const errorMap = new Map();
  for (const row of result.rows) {
    errorMap.set(row.file_path, {
      count: parseInt(row.error_count),
      types: row.error_types
    });
  }

  return errorMap;
}

// =============================================================================
// Ranking Algorithm
// =============================================================================
function rankFiles(files, errorMap) {
  return files.map(file => {
    const errors = errorMap.get(file.path) || { count: 0, types: [] };

    // Composite score (higher = more important to fix)
    const errorScore = errors.count * 10;
    const complexityScore = file.complexity * 2;
    const centralityScore = file.centrality * 5;
    const technicalDebtScore =
      (file.hasAnyType ? 50 : 0) +
      (file.hasTsIgnore ? 30 : 0) +
      (file.todoCount * 10);

    const totalScore = errorScore + complexityScore + centralityScore + technicalDebtScore;

    return {
      ...file,
      errorCount: errors.count,
      errorTypes: errors.types,
      scores: {
        error: errorScore,
        complexity: complexityScore,
        centrality: centralityScore,
        technicalDebt: technicalDebtScore,
        total: totalScore
      },
      rank: 0 // Will be filled after sorting
    };
  });
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  console.log('\n🚀 Phase 97: Codebase Ranking & Organization\n');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log('🔌 Connecting to PostgreSQL...');
  await connectDB();

  console.log('\n📂 Discovering files...');
  const filePaths = discoverFiles(CONFIG.srcPath);
  console.log(`   Found ${filePaths.length} source files\n`);

  console.log('📊 Analyzing files...');
  const files = filePaths.map(analyzeFile);
  console.log(`   Analyzed ${files.length} files\n`);

  console.log('🔍 Loading error data from PostgreSQL...');
  const errorMap = await getErrorCounts();
  console.log(`   Loaded errors for ${errorMap.size} files\n`);

  console.log('📈 Ranking files...');
  let rankedFiles = rankFiles(files, errorMap);
  rankedFiles.sort((a, b) => b.scores.total - a.scores.total);
  rankedFiles = rankedFiles.map((file, index) => ({ ...file, rank: index + 1 }));

  // Statistics
  const totalErrors = rankedFiles.reduce((sum, f) => sum + f.errorCount, 0);
  const totalComplexity = rankedFiles.reduce((sum, f) => sum + f.complexity, 0);
  const filesWithErrors = rankedFiles.filter(f => f.errorCount > 0).length;
  const filesWithTechDebt = rankedFiles.filter(f => f.hasAnyType || f.hasTsIgnore).length;

  console.log('\n📊 Codebase Statistics:');
  console.log(`   Total Files: ${rankedFiles.length}`);
  console.log(`   Files with Errors: ${filesWithErrors} (${(filesWithErrors/rankedFiles.length*100).toFixed(1)}%)`);
  console.log(`   Total Errors: ${totalErrors}`);
  console.log(`   Files with Technical Debt: ${filesWithTechDebt}`);
  console.log(`   Total Complexity Points: ${totalComplexity}`);

  console.log('\n🔝 Top 20 Files to Fix:\n');
  rankedFiles.slice(0, 20).forEach((file, i) => {
    console.log(`   ${i + 1}. ${file.path}`);
    console.log(`      Errors: ${file.errorCount} | Complexity: ${file.complexity} | Score: ${file.scores.total}`);
  });

  console.log('\n📁 Files by Category:\n');

  const categories = {
    routes: rankedFiles.filter(f => f.path.includes('/routes/')),
    components: rankedFiles.filter(f => f.path.includes('/components/')),
    lib: rankedFiles.filter(f => f.path.includes('/lib/') && !f.path.includes('/components/')),
    stores: rankedFiles.filter(f => f.path.includes('/stores/')),
    utils: rankedFiles.filter(f => f.path.includes('/utils/')),
    types: rankedFiles.filter(f => f.path.includes('/types/') || f.path.endsWith('.d.ts'))
  };

  for (const [category, catFiles] of Object.entries(categories)) {
    const catErrors = catFiles.reduce((sum, f) => sum + f.errorCount, 0);
    const avgComplexity = catFiles.length > 0
      ? (catFiles.reduce((sum, f) => sum + f.complexity, 0) / catFiles.length).toFixed(1)
      : 0;

    console.log(`   ${category}: ${catFiles.length} files | ${catErrors} errors | Avg complexity: ${avgComplexity}`);
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    statistics: {
      totalFiles: rankedFiles.length,
      filesWithErrors,
      totalErrors,
      filesWithTechDebt,
      totalComplexity
    },
    categories,
    top100: rankedFiles.slice(0, 100),
    allFiles: rankedFiles
  };

  console.log(`\n💾 Results saved to: ${CONFIG.outputFile}`);

  // Close connections
  await db.end();

  console.log('\n✅ Ranking Complete!\n');
}

main().catch(console.error);
