#!/usr/bin/env node
/**
 * Organize TypeScript Files into Barrel Exports
 *
 * Creates organized index.ts barrel exports for:
 * - Utilities (consolidate 127 files → ~30 modules)
 * - Types (organize scattered type files)
 * - Services (group by domain: legal, ai, cache, db)
 * - Stores (centralized state management exports)
 * - Config (environment, setup, constants)
 *
 * Benefits:
 * - Cleaner imports: import { formatDate } from '$lib/utils'
 * - Better tree-shaking
 * - Easier refactoring
 * - Clear public API surface
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src', 'lib');

// =============================================================================
// File Discovery
// =============================================================================
function discoverFiles(dir, extensions = ['.ts', '.tsx']) {
  const files = [];

  function walk(currentPath) {
    const entries = readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, .svelte-kit, archived, tests
        if (entry.name === 'node_modules' ||
            entry.name === '.svelte-kit' ||
            entry.name === '_archive' ||
            entry.name === '__tests__') {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (extensions.includes(ext) && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.test.ts')) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

// =============================================================================
// Extract Exports from File
// =============================================================================
function extractExports(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const exports = [];

    // Named exports: export function foo() {}
    const namedExportRegex = /export\s+(async\s+)?(function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      exports.push({ name: match[3], type: match[2], isDefault: false });
    }

    // Default exports: export default class Foo {}
    const defaultExportRegex = /export\s+default\s+(function|class)?\s*(\w+)?/;
    const defaultMatch = content.match(defaultExportRegex);
    if (defaultMatch) {
      exports.push({
        name: defaultMatch[2] || 'default',
        type: defaultMatch[1] || 'unknown',
        isDefault: true
      });
    }

    // Re-exports: export { foo, bar } from './other'
    const reExportRegex = /export\s+\{([^}]+)\}/g;
    while ((match = reExportRegex.exec(content)) !== null) {
      const names = match[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop());
      names.forEach(name => {
        exports.push({ name, type: 'reexport', isDefault: false });
      });
    }

    return exports;
  } catch (error) {
    console.warn(`Failed to extract exports from ${filePath}:`, error.message);
    return [];
  }
}

// =============================================================================
// Categorize Files
// =============================================================================
function categorizeFiles(files) {
  const categories = {
    utils: [],
    types: [],
    services: {
      legal: [],
      ai: [],
      cache: [],
      database: [],
      auth: [],
      upload: [],
      other: []
    },
    stores: [],
    config: [],
    components: [], // TS logic files for components
    other: []
  };

  for (const file of files) {
    const relativePath = relative(SRC, file);
    const parts = relativePath.split(/[\/\\]/);

    // Type definitions
    if (file.endsWith('.d.ts')) {
      categories.types.push(file);
      continue;
    }

    // Utils
    if (relativePath.includes('utils') || relativePath.includes('helpers')) {
      categories.utils.push(file);
      continue;
    }

    // Stores
    if (relativePath.includes('stores') || relativePath.includes('Store.ts')) {
      categories.stores.push(file);
      continue;
    }

    // Config
    if (relativePath.match(/config|setup|env|constants/i)) {
      categories.config.push(file);
      continue;
    }

    // Services (categorized by domain)
    if (relativePath.includes('services') || relativePath.includes('api')) {
      if (relativePath.includes('legal')) categories.services.legal.push(file);
      else if (relativePath.includes('ai') || relativePath.includes('llm')) categories.services.ai.push(file);
      else if (relativePath.includes('cache') || relativePath.includes('redis')) categories.services.cache.push(file);
      else if (relativePath.includes('database') || relativePath.includes('db')) categories.services.database.push(file);
      else if (relativePath.includes('auth')) categories.services.auth.push(file);
      else if (relativePath.includes('upload') || relativePath.includes('minio')) categories.services.upload.push(file);
      else categories.services.other.push(file);
      continue;
    }

    // Component TS logic files
    if (relativePath.includes('components') && file.endsWith('.ts')) {
      categories.components.push(file);
      continue;
    }

    // Everything else
    categories.other.push(file);
  }

  return categories;
}

// =============================================================================
// Generate Barrel Export File
// =============================================================================
function generateBarrelExport(files, outputPath, description) {
  const exports = [];
  const baseDir = dirname(outputPath);

  for (const file of files) {
    const fileExports = extractExports(file);
    if (fileExports.length === 0) continue;

    const relativePath = relative(baseDir, file)
      .replace(/\\/g, '/')
      .replace(/\.ts$/, '');

    const namedExports = fileExports.filter(e => !e.isDefault).map(e => e.name);
    const hasDefault = fileExports.some(e => e.isDefault);

    if (namedExports.length > 0) {
      exports.push(`export { ${namedExports.join(', ')} } from './${relativePath}';`);
    }

    if (hasDefault) {
      const defaultName = fileExports.find(e => e.isDefault)?.name || 'default';
      exports.push(`export { default as ${defaultName} } from './${relativePath}';`);
    }
  }

  const content = `/**
 * ${description}
 *
 * Auto-generated barrel export file
 * Generated: ${new Date().toISOString()}
 * Files: ${files.length}
 */

${exports.join('\n')}
`;

  // Ensure directory exists
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, content, 'utf8');
  console.log(`✅ Created ${relative(ROOT, outputPath)} with ${exports.length} exports`);
}

// =============================================================================
// Main Execution
// =============================================================================
async function main() {
  console.log('\n📦 Organizing TypeScript Files into Barrel Exports\n');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log('1️⃣ Discovering TypeScript files...');
  const files = discoverFiles(SRC);
  console.log(`   Found: ${files.length} TypeScript files\n`);

  console.log('2️⃣ Categorizing files by domain...');
  const categories = categorizeFiles(files);

  console.log('   Categories:');
  console.log(`     Utils: ${categories.utils.length}`);
  console.log(`     Types: ${categories.types.length}`);
  console.log(`     Stores: ${categories.stores.length}`);
  console.log(`     Config: ${categories.config.length}`);
  console.log(`     Services (total): ${Object.values(categories.services).flat().length}`);
  console.log(`       - Legal: ${categories.services.legal.length}`);
  console.log(`       - AI: ${categories.services.ai.length}`);
  console.log(`       - Cache: ${categories.services.cache.length}`);
  console.log(`       - Database: ${categories.services.database.length}`);
  console.log(`       - Auth: ${categories.services.auth.length}`);
  console.log(`       - Upload: ${categories.services.upload.length}`);
  console.log(`       - Other: ${categories.services.other.length}`);
  console.log(`     Components: ${categories.components.length}`);
  console.log(`     Other: ${categories.other.length}\n`);

  console.log('3️⃣ Generating barrel export files...\n');

  // Utils barrel
  if (categories.utils.length > 0) {
    generateBarrelExport(
      categories.utils,
      join(SRC, 'utils', 'index.ts'),
      'Unified Utility Functions - Barrel Export'
    );
  }

  // Types barrel
  if (categories.types.length > 0) {
    generateBarrelExport(
      categories.types,
      join(SRC, 'types', 'index.ts'),
      'TypeScript Type Definitions - Barrel Export'
    );
  }

  // Stores barrel
  if (categories.stores.length > 0) {
    generateBarrelExport(
      categories.stores,
      join(SRC, 'stores', 'index.ts'),
      'Svelte Stores - Centralized State Management'
    );
  }

  // Config barrel
  if (categories.config.length > 0) {
    generateBarrelExport(
      categories.config,
      join(SRC, 'config', 'index.ts'),
      'Configuration and Constants - Barrel Export'
    );
  }

  // Service barrels (by domain)
  Object.entries(categories.services).forEach(([domain, files]) => {
    if (files.length > 0) {
      generateBarrelExport(
        files,
        join(SRC, 'services', domain, 'index.ts'),
        `${domain.charAt(0).toUpperCase() + domain.slice(1)} Services - Barrel Export`
      );
    }
  });

  console.log('\n✅ Barrel export generation complete!\n');
  console.log('Next steps:');
  console.log('  1. Review generated index.ts files');
  console.log('  2. Update imports to use barrel exports:');
  console.log('     Before: import { formatDate } from "$lib/utils/date/formatDate"');
  console.log('     After:  import { formatDate } from "$lib/utils"');
  console.log('  3. Run tests to ensure no breaking changes');
  console.log('  4. Update tsconfig.json paths if needed\n');
}

main().catch(console.error);
