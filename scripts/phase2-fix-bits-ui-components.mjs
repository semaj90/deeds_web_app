#!/usr/bin/env node
/**
 * Phase 2 - Fix Bits UI Component Imports
 *
 * Fixes: Property 'Root|Content|Portal|etc' does not exist on type 'ComponentCtor'
 *
 * Pattern: Bits UI v2.0 uses named exports, not nested properties
 * Before: <Dialog.Root>
 * After: <DialogRoot>
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
  DropdownMenu: ['Root', 'Trigger', 'Content', 'Item', 'Separator', 'Label'],
  Accordion: ['Root', 'Item', 'Trigger', 'Content'],
  Tabs: ['Root', 'List', 'Trigger', 'Content'],
  RadioGroup: ['Root', 'Item'],
  Checkbox: ['Root'],
  Switch: ['Root'],
  Slider: ['Root', 'Thumb', 'Range'],
  Progress: ['Root'],
  Separator: ['Root'],
  Label: ['Root'],
  Button: ['Root']
};

let totalFixed = 0;
let filesFixed = 0;

function fixBitsUIComponents(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const originalContent = content;

  // Track which components are used
  const usedComponents = new Set();

  // Fix component usage in markup
  for (const [component, subComponents] of Object.entries(BITS_UI_COMPONENTS)) {
    for (const subComponent of subComponents) {
      const dotPattern = new RegExp(`<${component}\\.${subComponent}([\\s>])`, 'g');
      const closingPattern = new RegExp(`</${component}\\.${subComponent}>`, 'g');

      if (dotPattern.test(content) || closingPattern.test(content)) {
        const newName = `${component}${subComponent}`;
        usedComponents.add(newName);

        // Replace opening tags
        content = content.replace(dotPattern, `<${newName}$1`);
        // Replace closing tags
        content = content.replace(closingPattern, `</${newName}>`);

        modified = true;
        totalFixed++;
      }
    }
  }

  // Fix imports if components were used
  if (modified && usedComponents.size > 0) {
    // Find existing bits-ui import
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]bits-ui['"]/;
    const match = content.match(importRegex);

    if (match) {
      const existingImports = match[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s && !s.includes('.'));

      // Add new component imports
      const allImports = [...new Set([...existingImports, ...usedComponents])].sort();
      const newImport = `import { ${allImports.join(', ')} } from 'bits-ui'`;

      content = content.replace(importRegex, newImport);
    } else {
      // Add new import at the top of script section
      const scriptMatch = content.match(/<script[^>]*>/);
      if (scriptMatch) {
        const insertPos = scriptMatch.index + scriptMatch[0].length;
        const newImport = `\n\timport { ${[...usedComponents].sort().join(', ')} } from 'bits-ui';\n`;
        content = content.slice(0, insertPos) + newImport + content.slice(insertPos);
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesFixed++;
    console.log(`✓ Fixed ${filePath}`);
    return true;
  }

  return false;
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        processDirectory(fullPath);
      }
    } else if (entry.name.endsWith('.svelte')) {
      fixBitsUIComponents(fullPath);
    }
  }
}

// Main execution
const srcDir = path.join(__dirname, '..', 'sveltekit-frontend', 'src');
console.log('Phase 2: Fixing Bits UI component imports...\n');
processDirectory(srcDir);

console.log(`\n✓ Complete!`);
console.log(`  Files fixed: ${filesFixed}`);
console.log(`  Total fixes: ${totalFixed}`);
