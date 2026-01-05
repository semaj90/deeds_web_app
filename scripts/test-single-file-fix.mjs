#!/usr/bin/env node
/**
 * Test Script - Dry Run on Single File
 *
 * Tests the Bits UI fix on a single file without modifying it
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BITS_UI_COMPONENTS = {
  Dialog: ['Root', 'Portal', 'Overlay', 'Content', 'Title', 'Description', 'Close'],
  Select: ['Root', 'Trigger', 'Content', 'Item', 'Value', 'Label', 'Group'],
  Popover: ['Root', 'Trigger', 'Content', 'Close'],
  Tooltip: ['Root', 'Trigger', 'Content'],
};

function testBitsUIFix(filePath) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${filePath}`);
  console.log('='.repeat(70));

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  let fixCount = 0;
  const usedComponents = new Set();
  const changes = [];

  // Fix component usage in markup
  for (const [component, subComponents] of Object.entries(BITS_UI_COMPONENTS)) {
    for (const subComponent of subComponents) {
      const dotPattern = new RegExp(`<${component}\\.${subComponent}([\\s>])`, 'g');
      const closingPattern = new RegExp(`</${component}\\.${subComponent}>`, 'g');

      let match;
      while ((match = dotPattern.exec(content)) !== null) {
        const newName = `${component}${subComponent}`;
        usedComponents.add(newName);
        fixCount++;
        changes.push({
          line: content.substring(0, match.index).split('\n').length,
          old: `<${component}.${subComponent}`,
          new: `<${newName}`
        });
      }

      while ((match = closingPattern.exec(content)) !== null) {
        const newName = `${component}${subComponent}`;
        changes.push({
          line: content.substring(0, match.index).split('\n').length,
          old: `</${component}.${subComponent}>`,
          new: `</${newName}>`
        });
      }

      if (dotPattern.test(content) || closingPattern.test(content)) {
        const newName = `${component}${subComponent}`;
        newContent = newContent.replace(dotPattern, `<${newName}$1`);
        newContent = newContent.replace(closingPattern, `</${newName}>`);
      }
    }
  }

  // Show results
  if (fixCount > 0) {
    console.log(`\n✓ Found ${fixCount} fixes needed`);
    console.log(`\nComponents that need importing:`);
    console.log(`  ${[...usedComponents].sort().join(', ')}`);

    console.log(`\nChanges to be made:`);
    changes.forEach((change, i) => {
      console.log(`  ${i + 1}. Line ${change.line}: ${change.old} → ${change.new}`);
    });

    // Show import fix
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]bits-ui['"]/;
    const match = content.match(importRegex);

    console.log(`\nImport statement:`);
    if (match) {
      const existingImports = match[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s && !s.includes('.'));

      const allImports = [...new Set([...existingImports, ...usedComponents])].sort();
      const newImport = `import { ${allImports.join(', ')} } from 'bits-ui'`;

      console.log(`  OLD: ${match[0]}`);
      console.log(`  NEW: ${newImport}`);
    } else {
      console.log(`  NEW: import { ${[...usedComponents].sort().join(', ')} } from 'bits-ui';`);
    }

    // Show diff preview (first 10 lines of changes)
    console.log(`\n📝 Preview of changes (first 200 chars):`);
    const lines = newContent.split('\n');
    const changedLines = changes.slice(0, 3).map(c => c.line);
    changedLines.forEach(lineNum => {
      const line = lines[lineNum - 1];
      if (line) {
        console.log(`  Line ${lineNum}: ${line.trim().substring(0, 80)}...`);
      }
    });

    return { success: true, fixCount, usedComponents: [...usedComponents] };
  } else {
    console.log(`\n✓ No Bits UI fixes needed in this file`);
    return { success: true, fixCount: 0, usedComponents: [] };
  }
}

// Test on a specific file
const testFile = process.argv[2] || 'sveltekit-frontend/src/lib/components/ui/dialog/Dialog.svelte';
const fullPath = path.join(__dirname, '..', testFile);

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║         DRY RUN: Test Bits UI Fix on Single File                  ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

const result = testBitsUIFix(fullPath);

if (result.success && result.fixCount > 0) {
  console.log(`\n✅ Test successful! Found ${result.fixCount} fixes.`);
  console.log(`\n💡 To apply these fixes, run:`);
  console.log(`   node scripts/phase2-fix-bits-ui-components.mjs`);
} else if (result.success) {
  console.log(`\n✅ File is already correct or doesn't use Bits UI components.`);
} else {
  console.log(`\n❌ Test failed.`);
}
