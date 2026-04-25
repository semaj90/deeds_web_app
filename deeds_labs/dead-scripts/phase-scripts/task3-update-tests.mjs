#!/usr/bin/env node
/**
 * Task 3: Bulk Update Test Files with Mock Infrastructure
 * Automatically adds setupTest/cleanupTest to all test files
 * Removes manual fetch mocking boilerplate
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Files already updated (from Task 2)
const ALREADY_UPDATED = [
  'rag-lookup.test.ts',
  'integration.test.ts',
  'case-link.service.test.ts',
  'citation.service.test.ts',
  'llm.service.test.ts',
  'performance.test.ts',
  'rag.service.test.ts',
  'recognizer.test.ts',
  'CitationList.test.ts',
  'healthUpdates.test.ts',
  'agentic-analyzer.test.ts',
  'vector-search-service.test.ts',
  'error-analysis-pipeline.test.ts',
  'embedding-service.test.ts',
  'ErrorBrainModal.test.ts',
  'error-brain-api.test.ts',
  'rag-retriever.test.ts',
  'page.test.ts', // all-routes
];

/**
 * Check if file already has setupTest import
 */
function hasSetupTest(content) {
  return /import.*setupTest.*from.*test-utils\/setup/.test(content);
}

/**
 * Check if file has manual fetch mocking
 */
function hasManualFetchMocking(content) {
  return /vi\.spyOn\(global,\s*['"]fetch['"]\)/.test(content) ||
         /global\.fetch\s*=\s*vi\.fn/.test(content);
}

/**
 * Check if file has manual vi.mock calls for external services
 */
function hasManualServiceMocks(content) {
  return /vi\.mock\(['"]\$lib\/(db|qdrant|redis|ollama)/.test(content);
}

/**
 * Add setupTest/cleanupTest imports and beforeEach/afterEach
 */
function addMockInfrastructure(content, filepath) {
  let updated = content;

  // Step 1: Add import if missing
  if (!hasSetupTest(content)) {
    // Find existing imports from vitest
    const vitestImportMatch = content.match(/import\s*{[^}]+}\s*from\s*['"]vitest['"]/);
    if (vitestImportMatch) {
      // Add setupTest import after vitest imports
      const insertPos = content.indexOf(vitestImportMatch[0]) + vitestImportMatch[0].length;
      updated = updated.slice(0, insertPos) +
                `\nimport { setupTest, cleanupTest } from '$lib/test-utils/setup';` +
                updated.slice(insertPos);
    } else {
      // Add at top after first import
      const firstImport = content.match(/import .+ from .+;/);
      if (firstImport) {
        const insertPos = content.indexOf(firstImport[0]) + firstImport[0].length;
        updated = updated.slice(0, insertPos) +
                  `\nimport { setupTest, cleanupTest } from '$lib/test-utils/setup';` +
                  updated.slice(insertPos);
      }
    }
  }

  // Step 2: Add beforeEach/afterEach if missing
  const hasBeforeEach = /beforeEach\s*\(/.test(updated);
  const hasAfterEach = /afterEach\s*\(/.test(updated);

  if (!hasBeforeEach || !hasAfterEach) {
    // Find first describe block
    const describeMatch = updated.match(/describe\s*\([^,]+,\s*\(\)\s*=>\s*{/);
    if (describeMatch) {
      const insertPos = updated.indexOf(describeMatch[0]) + describeMatch[0].length;
      const hooks = `
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });
`;
      updated = updated.slice(0, insertPos) + hooks + updated.slice(insertPos);
    }
  }

  return updated;
}

/**
 * Remove manual fetch mocking
 */
function removeManualFetchMocking(content) {
  // Remove vi.spyOn(global, 'fetch') blocks
  let updated = content.replace(
    /vi\.spyOn\(global,\s*['"]fetch['"]\)\.mockResolvedValue\([^;]+\);?\s*/g,
    ''
  );

  // Remove global.fetch = vi.fn() blocks
  updated = updated.replace(
    /global\.fetch\s*=\s*vi\.fn\([^)]+\);?\s*/g,
    ''
  );

  // Remove standalone fetch mock setups in beforeEach
  updated = updated.replace(
    /\/\/\s*Mock fetch for.+\n\s*vi\.spyOn\(global, 'fetch'\)[^}]+}\s*as Response\);?\s*/g,
    ''
  );

  return updated;
}

/**
 * Remove manual service mocking (vi.mock for db, qdrant, etc)
 */
function removeManualServiceMocks(content) {
  // Remove vi.mock blocks for lib services
  let updated = content.replace(
    /vi\.mock\(['"](\$lib\/(db|qdrant|redis|ollama|minio)[^'"]+)['"]\s*,\s*\([^}]+}\)\s*\);?\s*/g,
    ''
  );

  return updated;
}

/**
 * Process a single test file
 */
function processFile(filepath) {
  try {
    const content = readFileSync(filepath, 'utf-8');

    // Skip if already updated
    const filename = filepath.split(/[\\\/]/).pop();
    if (ALREADY_UPDATED.includes(filename)) {
      if (VERBOSE) console.log(`⏭️  Skipped (already updated): ${filepath}`);
      return { skipped: true, reason: 'already-updated' };
    }

    // Skip if already has setupTest
    if (hasSetupTest(content)) {
      if (VERBOSE) console.log(`⏭️  Skipped (has setupTest): ${filepath}`);
      return { skipped: true, reason: 'has-setupTest' };
    }

    // Process file
    let updated = content;

    // Add mock infrastructure
    updated = addMockInfrastructure(updated, filepath);

    // Remove manual mocking (optional - only if patterns detected)
    if (hasManualFetchMocking(updated)) {
      updated = removeManualFetchMocking(updated);
    }

    if (hasManualServiceMocks(updated)) {
      updated = removeManualServiceMocks(updated);
    }

    // Check if any changes were made
    if (updated === content) {
      if (VERBOSE) console.log(`⏭️  Skipped (no changes): ${filepath}`);
      return { skipped: true, reason: 'no-changes' };
    }

    // Write file
    if (!DRY_RUN) {
      writeFileSync(filepath, updated, 'utf-8');
      console.log(`✅ Updated: ${filepath}`);
      return { updated: true };
    } else {
      console.log(`🔍 Would update: ${filepath}`);
      return { wouldUpdate: true };
    }

  } catch (err) {
    console.error(`❌ Error processing ${filepath}:`, err.message);
    return { error: true, message: err.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Task 3: Bulk Update Test Files with Mock Infrastructure\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  // Find all test files
  const testFiles = await glob('src/**/*.test.{ts,js}', {
    cwd: process.cwd(),
    absolute: true,
    ignore: ['**/node_modules/**', '**/src.backup/**', '**/src/routes_parked/**'],
  });

  console.log(`📁 Found ${testFiles.length} test files\n`);

  const results = {
    updated: 0,
    skipped: 0,
    errors: 0,
    wouldUpdate: 0,
  };

  for (const file of testFiles) {
    const result = processFile(file);
    if (result.updated) results.updated++;
    if (result.wouldUpdate) results.wouldUpdate++;
    if (result.skipped) results.skipped++;
    if (result.error) results.errors++;
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Updated: ${results.updated}`);
  if (DRY_RUN) console.log(`   🔍 Would update: ${results.wouldUpdate}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);
  console.log(`   ❌ Errors: ${results.errors}`);
  console.log(`\n✅ Task 3 ${DRY_RUN ? 'dry run' : 'execution'} complete!`);

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n💡 Next: Run npm run test:run to verify all tests pass');
  }
}

main().catch(console.error);
