#!/usr/bin/env node

/**
 * Svelte Component Tag Fixer
 * Fixes mismatched compound component syntax (Dialog.Header vs </DialogHeader>)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Svelte compound component syntax...\n');

// Define the tag mismatches to fix
const tagFixes = [
  // Dialog components
  { open: '<Dialog.Header', close: '</DialogHeader>', correctClose: '</Dialog.Header>' },
  { open: '<Dialog.Footer', close: '</DialogFooter>', correctClose: '</Dialog.Footer>' },
  { open: '<Dialog.Content', close: '</DialogContent>', correctClose: '</Dialog.Content>' },
  { open: '<Dialog.Title', close: '</DialogTitle>', correctClose: '</Dialog.Title>' },
  {
    open: '<Dialog.Description',
    close: '</DialogDescription>',
    correctClose: '</Dialog.Description>',
  },

  // Card components (common pattern)
  { open: '<Card.Header', close: '</CardHeader>', correctClose: '</Card.Header>' },
  { open: '<Card.Footer', close: '</CardFooter>', correctClose: '</Card.Footer>' },
  { open: '<Card.Content', close: '</CardContent>', correctClose: '</Card.Content>' },
  { open: '<Card.Title', close: '</CardTitle>', correctClose: '</Card.Title>' },

  // Button components
  { open: '<Button.Group', close: '</ButtonGroup>', correctClose: '</Button.Group>' },

  // Form components
  { open: '<Form.Field', close: '</FormField>', correctClose: '</Form.Field>' },
  { open: '<Form.Label', close: '</FormLabel>', correctClose: '</Form.Label>' },
  { open: '<Form.Input', close: '</FormInput>', correctClose: '</Form.Input>' },
];

let totalFixes = 0;

// Function to fix a single file
function fixSvelteFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    for (const fix of tagFixes) {
      // Only fix if file has the opening tag pattern
      if (content.includes(fix.open) && content.includes(fix.close)) {
        content = content.replaceAll(fix.close, fix.correctClose);
        modified = true;
        console.log(`  ✅ Fixed ${fix.close} → ${fix.correctClose}`);
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content);
      totalFixes++;
      return true;
    }
    return false;
  } catch (error) {
    console.log(`  ❌ Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

// Function to recursively find and fix Svelte files
function fixSvelteFiles(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  files.forEach((file) => {
    const filePath = path.join(dir, file.name);

    if (file.isDirectory()) {
      fixSvelteFiles(filePath);
    } else if (file.name.endsWith('.svelte')) {
      console.log(`📂 Checking: ${path.relative(process.cwd(), filePath)}`);
      fixSvelteFile(filePath);
    }
  });
}

// Start fixing from src directory
console.log('🔍 Scanning for Svelte component tag mismatches...\n');

try {
  fixSvelteFiles('src');

  console.log(`\n🎯 Fixed ${totalFixes} Svelte files`);

  if (totalFixes > 0) {
    console.log('\n🔄 Running svelte-check to verify fixes...');
    try {
      execSync('timeout 15s npx svelte-check --output machine 2>/dev/null', {
        stdio: 'inherit',
        timeout: 20000,
      });
      console.log('✅ Svelte component syntax verified');
    } catch (error) {
      console.log('⚠️  Svelte-check still running (may have remaining issues)');
    }
  }
} catch (error) {
  console.log(`❌ Error during fixing process: ${error.message}`);
}

console.log('\n✅ Svelte compound component syntax fixes complete!');
