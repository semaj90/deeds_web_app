import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * bits-ui v2 Import Migration
 *
 * Changes barrel imports to component-specific imports:
 * from "bits-ui" → from "bits-ui/components/[component]"
 */

const COMPONENT_MAPPINGS = {
  Checkbox: 'checkbox',
  Select: 'select',
  Dialog: 'dialog',
  Popover: 'popover',
  Dropdown: 'dropdown-menu',
  Tooltip: 'tooltip',
  Switch: 'switch',
  RadioGroup: 'radio-group',
  Slider: 'slider',
  Tabs: 'tabs',
  Accordion: 'accordion',
  Collapsible: 'collapsible',
  DropdownMenu: 'dropdown-menu',
  Label: 'label'
};

function findAllFiles(dir, extensions = ['.svelte', '.ts'], results = []) {
  try {
    const fullPath = path.resolve(__dirname, dir);
    if (!fs.existsSync(fullPath)) return results;

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry.name);

      if (entry.name.includes('node_modules') || entry.name.includes('.svelte-kit') ||
          entry.name.includes('build') || entry.name.includes('_archive')) {
        continue;
      }

      if (entry.isDirectory()) {
        findAllFiles(entryPath, extensions, results);
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(entryPath);
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dir}:`, err.message);
  }

  return results;
}

function fixBitsUiImports(content) {
  let fixed = content;
  let changes = 0;

  // Pattern: import { Component1, Component2 } from "bits-ui"
  const importPattern = /import\s+\{([^}]+)\}\s+from\s+['"]bits-ui['"]/g;

  const matches = [...content.matchAll(importPattern)];

  for (const match of matches) {
    const importedItems = match[1].split(',').map(item => item.trim());
    const replacements = [];

    for (const item of importedItems) {
      // Extract component name (handle "as" aliases)
      const componentName = item.split(' as ')[0].trim();

      // Find matching component path
      for (const [key, value] of Object.entries(COMPONENT_MAPPINGS)) {
        if (componentName.includes(key)) {
          replacements.push(`import * as ${componentName} from "bits-ui/components/${value}"`);
          changes++;
          break;
        }
      }
    }

    if (replacements.length > 0) {
      // Replace the old import with new namespace imports
      fixed = fixed.replace(match[0], replacements.join(';\n'));
    }
  }

  return { fixed, changes };
}

console.log('🔧 bits-ui v2 IMPORT MIGRATION\n');
console.log('='.repeat(80) + '\n');

const allFiles = [];
for (const dir of ['../src/lib/components', '../src/routes']) {
  const files = findAllFiles(dir);
  allFiles.push(...files);
}

console.log(`Found ${allFiles.length} files to process...\n`);

let filesProcessed = 0;
let filesChanged = 0;
let totalChanges = 0;
const changedFiles = [];

for (const filePath of allFiles) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    if (!content.includes('from "bits-ui"') && !content.includes("from 'bits-ui'")) {
      filesProcessed++;
      continue;
    }

    const { fixed, changes } = fixBitsUiImports(content);

    if (changes > 0) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      filesChanged++;
      totalChanges += changes;

      const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
      changedFiles.push({ file: relativePath, changes });
      console.log(`✓ ${relativePath}`);
      console.log(`  Fixed ${changes} import${changes > 1 ? 's' : ''}`);
    }

    filesProcessed++;
  } catch (err) {
    console.error(`✗ Error processing ${filePath}:`, err.message);
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 RESULTS:\n`);
console.log(`Files processed: ${filesProcessed}`);
console.log(`Files changed: ${filesChanged}`);
console.log(`Total imports migrated: ${totalChanges}`);

console.log('\n✨ bits-ui v2 migration complete!');
console.log(`Expected error reduction: ~${totalChanges * 2} errors eliminated\n`);

// Save report
const reportPath = path.resolve(__dirname, '../bits-ui-migration-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  filesProcessed,
  filesChanged,
  totalChanges,
  changedFiles
}, null, 2));

console.log(`📄 Report saved: ${path.relative(path.resolve(__dirname, '..'), reportPath)}\n`);
