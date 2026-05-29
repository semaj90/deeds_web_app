#!/usr/bin/env node
/**
 * Phase 2 Atlas: TypeScript AST CALLS Extractor
 *
 * Extracts function call relationships from TypeScript source code
 * and builds the knowledge graph foundation (5K-10K edges expected)
 *
 * Input: 3000 source files in codebase
 * Process: Parse AST → find function calls → resolve targets
 * Output: CALLS edges → Neo4j + Redis cache
 */

import { Project, SyntaxKind } from 'ts-morph';
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Config
const SVELTEKIT_ROOT = path.join(projectRoot, 'sveltekit-frontend');
const TS_CONFIG = path.join(SVELTEKIT_ROOT, 'tsconfig.json');
const SRC_GLOB = [path.join(SVELTEKIT_ROOT, 'src/**/*.ts'), path.join(SVELTEKIT_ROOT, 'src/**/*.svelte.ts')];
const OUT_DIR = path.join(projectRoot, 'scripts/atlas/out');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--write');
const SAMPLE_ONLY = args.includes('--sample');

// Create output directory
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function extractCallsFromFile(sourceFile) {
  const filePath = sourceFile.getFilePath();
  const calls = [];

  try {
    // Get all call expressions in the file
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
      const expr = call.getExpression();
      let callee = null;

      // Case 1: Direct function call (e.g., `foo()`)
      if (expr.getKind() === SyntaxKind.Identifier) {
        callee = expr.getText();
      }
      // Case 2: Property access (e.g., `obj.method()`)
      else if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        callee = expr.getText();
      }
      // Case 3: Method on "this" (e.g., `this.method()`)
      else if (expr.getText().startsWith('this.')) {
        callee = expr.getText().substring(5); // Remove "this."
      }

      if (callee) {
        const lineNum = call.getStartLineNumber();
        const enclosingFunc = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
          .find(f => f.getStart() < call.getStart() && f.getEnd() > call.getEnd());

        const caller = enclosingFunc?.getName() || '(module)';

        calls.push({
          source_file: filePath,
          line_num: lineNum,
          caller,
          callee,
          type: 'function_call',
          kind: expr.getKind() === SyntaxKind.PropertyAccessExpression ? 'method' : 'function'
        });
      }
    }
  } catch (err) {
    console.warn(`⚠️  Error parsing ${filePath}: ${err.message}`);
  }

  return calls;
}

async function main() {
  console.log('🚀 Phase 2 Atlas: TypeScript CALLS Extractor');
  console.log(`📊 TypeScript Config: ${TS_CONFIG}`);
  console.log(`📂 Source Glob: ${SRC_GLOB.join(', ')}`);
  console.log(`⚙️  Mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`📋 Samples: ${SAMPLE_ONLY ? 'First 100 files only' : 'All files'}\n`);

  try {
    console.log('📖 Loading TypeScript project...');
    const project = new Project({
      tsConfigFilePath: TS_CONFIG
    });

    // Get source files directly from project (includes tsconfig includes)
    let sourceFiles = project.getSourceFiles();

    // Filter to src directory only (skip node_modules, etc)
    sourceFiles = sourceFiles.filter(f => {
      const filePath = f.getFilePath();
      return filePath.includes('/src/') && (filePath.endsWith('.ts') || filePath.endsWith('.svelte.ts'));
    });

    const uniqueFiles = sourceFiles.slice(0, SAMPLE_ONLY ? 100 : undefined);

    console.log(`   Found ${uniqueFiles.length} source files\n`);

    console.log('🔍 Extracting function calls...\n');

    let totalCalls = 0;
    let filesProcessed = 0;
    const allCalls = [];

    for (const file of uniqueFiles) {
      const calls = extractCallsFromFile(file);
      totalCalls += calls.length;
      allCalls.push(...calls);
      filesProcessed++;

      if (filesProcessed % 50 === 0) {
        console.log(`  ✓ Processed ${filesProcessed} files, found ${totalCalls} calls`);
      }
    }

    console.log(`\n✅ Extraction Complete`);
    console.log(`   Files processed: ${filesProcessed}`);
    console.log(`   Total CALLS edges: ${totalCalls}`);
    console.log(`   Avg calls per file: ${(totalCalls / filesProcessed).toFixed(1)}`);

    // Group by caller for stats
    const callerStats = {};
    for (const call of allCalls) {
      if (!callerStats[call.caller]) {
        callerStats[call.caller] = 0;
      }
      callerStats[call.caller]++;
    }

    const topCallers = Object.entries(callerStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    console.log(`\n📊 Top Callers:`);
    topCallers.forEach(([caller, count], i) => {
      console.log(`   ${i + 1}. ${caller}: ${count} calls`);
    });

    if (!DRY_RUN && allCalls.length > 0) {
      // Write CALLS edges to NDJSON
      const outFile = path.join(OUT_DIR, `calls-edges-${new Date().toISOString().slice(0, 10)}.ndjson`);

      console.log(`\n💾 Writing CALLS edges to: ${outFile}`);

      const lines = allCalls.map(c => JSON.stringify(c)).join('\n');
      const fs = await import('fs').then(m => m.promises);
      await fs.writeFile(outFile, lines + '\n');

      console.log(`   ✓ Wrote ${allCalls.length} CALLS edges\n`);

      console.log('📌 Next Steps:');
      console.log(`   1. Sync to Neo4j: CREATE (f1:File)-[c:CALLS]->(f2:File)`);
      console.log(`   2. Cache in Redis: db_calls:\${caller} → set of callees`);
      console.log(`   3. Phase 3: Extract USES_DB edges (table operations)`);
    } else if (DRY_RUN) {
      console.log(`\n📋 DRY-RUN: No files written. Use --write to persist.\n`);
      console.log(`📊 Sample CALLS edges (first 5):`);
      allCalls.slice(0, 5).forEach((call, i) => {
        console.log(`   ${i + 1}. ${call.caller}() → ${call.callee}() [${call.source_file.split('/').slice(-1)[0]}:${call.line_num}]`);
      });
    }

  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
