#!/usr/bin/env node

/**
 * Comprehensive Svelte HTML Attribute Fixer
 * Fixes common React-to-Svelte conversion issues and template placeholders
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔧 Svelte HTML Attribute Fixer');
console.log('===============================\n');

// Configuration
const config = {
  srcDir: 'src',
  extensions: ['.svelte', '.ts', '.js'],
  dryRun: false, // Set to true to see what would be changed without actually changing files
  backup: true, // Create backup files
};

// Replacement patterns
const replacements = [
  // React to Svelte attribute conversions
  {
    pattern: /className=/g,
    replacement: 'class=',
    description: 'className → class',
  },
  { pattern: /htmlFor=/g, replacement: 'for=', description: 'htmlFor → for' },

  // Template placeholders to actual CSS classes
  {
    pattern: /className="\$\{1\}"/g,
    replacement: 'class="container"',
    description: 'Template placeholder → container class',
  },
  {
    pattern: /class="\$\{1\}"/g,
    replacement: 'class="container"',
    description: 'Template placeholder → container class',
  },

  // Common React event handlers to Svelte
  {
    pattern: /onClick=/g,
    replacement: 'on:click=',
    description: 'onClick → on:click',
  },
  {
    pattern: /onChange=/g,
    replacement: 'on:change=',
    description: 'onChange → on:change',
  },
  {
    pattern: /onSubmit=/g,
    replacement: 'on:submit=',
    description: 'onSubmit → on:submit',
  },
  {
    pattern: /onFocus=/g,
    replacement: 'on:focus=',
    description: 'onFocus → on:focus',
  },
  {
    pattern: /onBlur=/g,
    replacement: 'on:blur=',
    description: 'onBlur → on:blur',
  },
  {
    pattern: /onInput=/g,
    replacement: 'on:input=',
    description: 'onInput → on:input',
  },
  {
    pattern: /onKeyDown=/g,
    replacement: 'on:keydown=',
    description: 'onKeyDown → on:keydown',
  },
  {
    pattern: /onKeyUp=/g,
    replacement: 'on:keyup=',
    description: 'onKeyUp → on:keyup',
  },
  {
    pattern: /onMouseEnter=/g,
    replacement: 'on:mouseenter=',
    description: 'onMouseEnter → on:mouseenter',
  },
  {
    pattern: /onMouseLeave=/g,
    replacement: 'on:mouseleave=',
    description: 'onMouseLeave → on:mouseleave',
  },

  // React-style inline styles to Svelte
  {
    pattern: /style=\{\{/g,
    replacement: 'style="',
    description: 'React inline styles → Svelte styles (start)',
  },
  {
    pattern: /\}\}/g,
    replacement: '"',
    description: 'React inline styles → Svelte styles (end)',
  },
];

// Smart CSS class assignments based on common patterns
const smartClassReplacements = [
  {
    pattern: /class="container"/g,
    replacement: 'class="mx-auto px-4 max-w-7xl"',
    context: 'main containers',
  },
  {
    pattern: /class="header"/g,
    replacement: 'class="bg-blue-600 text-white p-4"',
    context: 'headers',
  },
  {
    pattern: /class="card"/g,
    replacement: 'class="bg-white rounded-lg shadow-md p-6"',
    context: 'cards',
  },
  {
    pattern: /class="button"/g,
    replacement: 'class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"',
    context: 'buttons',
  },
  {
    pattern: /class="input"/g,
    replacement: 'class="border rounded px-3 py-2 w-full"',
    context: 'inputs',
  },
  {
    pattern: /class="grid"/g,
    replacement: 'class="grid gap-4"',
    context: 'grids',
  },
  {
    pattern: /class="flex"/g,
    replacement: 'class="flex items-center gap-2"',
    context: 'flex containers',
  },
];

// Statistics
let stats = {
  filesProcessed: 0,
  filesChanged: 0,
  totalReplacements: 0,
  replacementsByType: {},
  errors: [],
};

/**
 * Recursively find all files in a directory
 */
function findFiles(dir, extensions) {
  const files = [];

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules and other build directories
        if (!['node_modules', '.git', '.svelte-kit', 'build', 'dist'].includes(item)) {
          traverse(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  traverse(dir);
  return files;
}

/**
 * Create a backup of a file
 */
function createBackup(filePath) {
  if (!config.backup) return;

  const backupPath = filePath + '.backup';
  fs.copyFileSync(filePath, backupPath);
  console.log(`  📋 Backup created: ${path.basename(backupPath)}`);
}

/**
 * Process a single file
 */
function processFile(filePath) {
  try {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    let content = originalContent;
    let fileChanges = 0;
    const changedPatterns = [];

    // Apply basic replacements
    for (const replacement of replacements) {
      const before = content;
      if (typeof replacement.replacement === 'function') {
        content = content.replace(replacement.pattern, replacement.replacement);
      } else {
        content = content.replace(replacement.pattern, replacement.replacement);
      }

      if (content !== before) {
        const matches = (before.match(replacement.pattern) || []).length;
        fileChanges += matches;
        changedPatterns.push(`${replacement.description} (${matches}x)`);

        if (!stats.replacementsByType[replacement.description]) {
          stats.replacementsByType[replacement.description] = 0;
        }
        stats.replacementsByType[replacement.description] += matches;
      }
    }

    // Apply smart class replacements for empty placeholders
    if (content.includes('class="container"')) {
      for (const smartReplacement of smartClassReplacements) {
        const before = content;
        content = content.replace(smartReplacement.pattern, smartReplacement.replacement);
        if (content !== before) {
          const matches = (before.match(smartReplacement.pattern) || []).length;
          fileChanges += matches;
          changedPatterns.push(`Smart CSS classes for ${smartReplacement.context} (${matches}x)`);
        }
      }
    }

    // Update statistics
    stats.filesProcessed++;
    stats.totalReplacements += fileChanges;

    if (fileChanges > 0) {
      stats.filesChanged++;

      console.log(`📝 ${path.relative(process.cwd(), filePath)}`);
      changedPatterns.forEach((pattern) => console.log(`  ✅ ${pattern}`));

      if (!config.dryRun) {
        createBackup(filePath);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  💾 File updated`);
      } else {
        console.log(`  👀 Would update file (dry run)`);
      }
      console.log();
    }
  } catch (error) {
    stats.errors.push(`${filePath}: ${error.message}`);
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

/**
 * Fix a specific problematic file with custom logic
 */
function fixUiDemoFile() {
  const uiDemoPath = path.join(config.srcDir, 'routes', 'ui-demo', '+page.svelte');

  if (!fs.existsSync(uiDemoPath)) {
    console.log('ℹ️ ui-demo file not found, skipping specific fix');
    return;
  }

  console.log('🎯 Applying specific fix for ui-demo page...\n');

  const content = `<script lang="ts">
  import HeadlessDemo from "$lib/components/HeadlessDemo.svelte";
  import BitsDemo from "$lib/components/BitsDemo.svelte";
  import { onMount } from 'svelte';
  
  let mounted = false;
  
  onMount(() => {
    mounted = true;
  });
</script>

<svelte:head>
  <title>Headless UI Components Demo - Legal Case Management</title>
  <meta name="description" content="Demo of PicoCSS, UnoCSS, Melt UI, and Bits UI integration" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="bg-blue-600 text-white py-8">
    <div class="mx-auto px-4 max-w-7xl">
      <h1 class="text-3xl font-bold mb-2">
        🏛️ Legal Case Management System
      </h1>
      <p class="text-blue-100 mb-6">
        Demonstrating PicoCSS + UnoCSS + Melt UI + Bits UI Integration
      </p>
      
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="flex items-center gap-2 bg-blue-700 rounded p-3">
          <span class="text-2xl">🎨</span>
          <span>PicoCSS</span>
        </div>
        <div class="flex items-center gap-2 bg-blue-700 rounded p-3">
          <span class="text-2xl">⚡</span>
          <span>UnoCSS</span>
        </div>
        <div class="flex items-center gap-2 bg-blue-700 rounded p-3">
          <span class="text-2xl">🧩</span>
          <span>Melt UI</span>
        </div>
        <div class="flex items-center gap-2 bg-blue-700 rounded p-3">
          <span class="text-2xl">🔧</span>
          <span>Bits UI</span>
        </div>
      </div>
    </div>
  </header>
  
  {#if mounted}
    <main class="py-8">
      <div class="mx-auto px-4 max-w-7xl space-y-8">
        
        <!-- Styling Examples -->
        <section class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-bold mb-4 text-gray-800">📋 PicoCSS + Custom Styling</h2>
          <div class="bg-gray-50 rounded p-4">
            <div class="mb-4">
              <h3 class="text-lg font-semibold">Case Information</h3>
            </div>
            <div class="grid md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700" for="field-1">Case Number</label>
                <input type="text" class="border rounded px-3 py-2 w-full" value="CAS-2025-001234" readonly id="field-1" />
              </div>
              
              <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700" for="field-2">Case Status</label>
                <select class="border rounded px-3 py-2 w-full" id="field-2">
                  <option>Active Investigation</option>
                  <option>Pending Review</option>
                  <option>Closed</option>
                </select>
              </div>
              
              <div class="space-y-2 md:col-span-2">
                <label class="block text-sm font-medium text-gray-700" for="field-3">Priority Level</label>
                <div class="flex gap-2">
                  <div class="px-3 py-1 bg-red-100 text-red-800 rounded text-sm">High Priority Case</div>
                  <div class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">Medium Priority Case</div>
                  <div class="px-3 py-1 bg-green-100 text-green-800 rounded text-sm">Low Priority Case</div>
                </div>
              </div>
            </div>
            <div class="flex gap-2 mt-4">
              <button class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Changes</button>
              <button class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">Cancel</button>
            </div>
          </div>
        </section>
        
        <!-- UnoCSS Utilities -->
        <section class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-bold mb-4 text-gray-800">⚡ UnoCSS Utilities</h2>
          <div class="grid gap-4">
            <div class="grid md:grid-cols-3 gap-4">
              <div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-2">
                  <h4 class="font-semibold text-gray-800">State vs. Johnson</h4>
                  <span class="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Active</span>
                </div>
                <p class="text-gray-600 text-sm mb-3">Criminal case involving financial fraud</p>
                <div class="flex gap-2">
                  <button class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">View Details</button>
                  <button class="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Edit</button>
                </div>
              </div>
              
              <div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-2">
                  <h4 class="font-semibold text-gray-800">Miller Corp Dispute</h4>
                  <span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">Pending</span>
                </div>
                <p class="text-gray-600 text-sm mb-3">Contract dispute resolution</p>
                <div class="flex gap-2">
                  <button class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">View Details</button>
                  <button class="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Edit</button>
                </div>
              </div>
              
              <div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-2">
                  <h4 class="font-semibold text-gray-800">Estate Settlement</h4>
                  <span class="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">Closed</span>
                </div>
                <p class="text-gray-600 text-sm mb-3">Probate and estate administration</p>
                <div class="flex gap-2">
                  <button class="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700">View Archive</button>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        <!-- Melt UI Demo -->
        <section class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-bold mb-4 text-gray-800">🧩 Melt UI Headless Components</h2>
          <div class="border rounded p-4">
            <div class="text-center text-gray-600">
              <HeadlessDemo />
            </div>
          </div>
        </section>
        
        <!-- Bits UI Demo -->
        <section class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-bold mb-4 text-gray-800">🔧 Bits UI Components</h2>
          <div class="border rounded p-4">
            <div class="text-center text-gray-600">
              <BitsDemo />
            </div>
          </div>
        </section>
        
        <!-- Alert Examples -->
        <section class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-bold mb-4 text-gray-800">🚨 Alert System</h2>
          <div class="space-y-4">
            <div class="border-l-4 border-green-500 bg-green-50 p-4">
              <div class="flex">
                <div class="ml-3">
                  <strong class="text-green-800">Success!</strong>
                  <span class="text-green-700"> Case has been successfully saved and is now active.</span>
                </div>
              </div>
            </div>
            
            <div class="border-l-4 border-yellow-500 bg-yellow-50 p-4">
              <div class="flex">
                <div class="ml-3">
                  <strong class="text-yellow-800">Warning!</strong>
                  <span class="text-yellow-700"> This case has a pending deadline in 3 days.</span>
                </div>
              </div>
            </div>
            
            <div class="border-l-4 border-red-500 bg-red-50 p-4">
              <div class="flex">
                <div class="ml-3">
                  <strong class="text-red-800">Error!</strong>
                  <span class="text-red-700"> Unable to upload evidence file. Please try again.</span>
                </div>
              </div>
            </div>
            
            <div class="border-l-4 border-blue-500 bg-blue-50 p-4">
              <div class="flex">
                <div class="ml-3">
                  <strong class="text-blue-800">Info:</strong>
                  <span class="text-blue-700"> New evidence has been added to this case by another team member.</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        <!-- File Upload Demo -->
        <section class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-bold mb-4 text-gray-800">📎 Evidence Upload</h2>
          <div class="border-2 border-dashed border-gray-300 rounded-lg p-8">
            <div class="text-center">
              <div class="mx-auto mb-4">
                <span class="text-6xl">📄</span>
                <h3 class="text-lg font-medium text-gray-900 mb-2">Drop evidence files here</h3>
                <p class="text-gray-600 mb-2">
                  Or click to browse files
                </p>
                <p class="text-sm text-gray-500">
                  Supported: PDF, DOC, IMG, VIDEO
                </p>
              </div>
            </div>
            
            <div class="mt-6">
              <div class="bg-gray-200 rounded-full h-2">
                <div class="bg-blue-600 h-2 rounded-full" style="width: 75%"></div>
              </div>
              <p class="text-sm text-gray-600 mt-1">Uploading evidence_report.pdf... 75%</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  {:else}
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p class="text-gray-600">Loading UI components...</p>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Additional custom styles if needed */
  .transition-shadow {
    transition: box-shadow 0.2s ease-in-out;
  }
</style>
`;

  if (!config.dryRun) {
    createBackup(uiDemoPath);
    fs.writeFileSync(uiDemoPath, content, 'utf8');
  }

  console.log('✅ Fixed ui-demo page with proper Svelte syntax and styling\n');
}

/**
 * Main execution function
 */
function main() {
  const srcPath = path.resolve(config.srcDir);

  if (!fs.existsSync(srcPath)) {
    console.error(`❌ Source directory not found: ${srcPath}`);
    process.exit(1);
  }

  console.log(`📂 Scanning directory: ${srcPath}`);
  console.log(`🔍 Looking for files: ${config.extensions.join(', ')}`);
  console.log(`🚀 Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'APPLY CHANGES'}`);
  console.log(`💾 Backup: ${config.backup ? 'ENABLED' : 'DISABLED'}`);
  console.log();

  // Fix the specific problematic file first
  fixUiDemoFile();

  // Find all files to process
  const files = findFiles(srcPath, config.extensions);
  console.log(`📋 Found ${files.length} files to process\n`);

  // Process each file
  for (const file of files) {
    processFile(file);
  }

  // Print summary
  console.log('📊 SUMMARY');
  console.log('==========');
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files changed: ${stats.filesChanged}`);
  console.log(`Total replacements: ${stats.totalReplacements}`);
  console.log();

  if (Object.keys(stats.replacementsByType).length > 0) {
    console.log('Replacements by type:');
    for (const [type, count] of Object.entries(stats.replacementsByType)) {
      console.log(`  • ${type}: ${count}`);
    }
    console.log();
  }

  if (stats.errors.length > 0) {
    console.log('❌ Errors encountered:');
    stats.errors.forEach((error) => console.log(`  • ${error}`));
    console.log();
  }

  if (stats.filesChanged > 0) {
    console.log(`✅ Successfully fixed ${stats.filesChanged} files!`);
    if (config.backup) {
      console.log('💾 Backup files created (*.backup)');
    }
  } else {
    console.log('ℹ️ No files needed fixing.');
  }

  console.log('\n🎉 HTML attribute fixing complete!');
}

// Run the script
main();
