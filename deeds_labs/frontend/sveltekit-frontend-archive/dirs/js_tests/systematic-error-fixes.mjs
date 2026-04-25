#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

console.log('🔧 Systematic TypeScript Error Fixes...');

let fixedCount = 0;
let filesProcessed = 0;

// Fix files in directory
function processDirectory(dir) {
  const files = readdirSync(dir);

  files.forEach((file) => {
    const filepath = join(dir, file);
    const stat = statSync(filepath);

    if (stat.isDirectory()) {
      processDirectory(filepath);
    } else if (extname(file) === '.svelte') {
      processFile(filepath);
    }
  });
}

// Process individual file
function processFile(filepath) {
  try {
    let content = readFileSync(filepath, 'utf8');
    let hasChanges = false;

    // Common fixes
    const fixes = [
      // Fix activeCase null checks
      {
        pattern: /activeCase\.(\w+)/g,
        replacement: 'activeCase?.${1}',
        description: 'Add null check for activeCase',
      },
      // Fix selectedCase null checks
      {
        pattern: /selectedCase\.(\w+)/g,
        replacement: 'selectedCase?.${1}',
        description: 'Add null check for selectedCase',
      },
      // Fix activeCase property access
      {
        pattern: /activeCase\?.openedAt/g,
        replacement: 'activeCase?.createdAt',
        description: 'Replace openedAt with createdAt',
      },
      // Fix notification calls
      {
        pattern: /notifications\.add\('([^']+)',\s*'([^']+)'\)/g,
        replacement:
          "notifications.add({\\n          type: '${2}',\\n          title: '${2}',\\n          message: '${1}'\\n        })",
        description: 'Fix notification calls',
      },
      // Fix notification calls with variables
      {
        pattern: /notifications\.add\(([^,]+),\s*'([^']+)'\)/g,
        replacement:
          "notifications.add({\\n          type: '${2}',\\n          title: '${2}',\\n          message: ${1}\\n        })",
        description: 'Fix notification calls with variables',
      },
      // Fix tabindex string to number
      {
        pattern: /tabindex="([^"]+)"/g,
        replacement: 'tabindex={${1}}',
        description: 'Fix tabindex string to number',
      },
      // Fix rows string to number
      {
        pattern: /rows="([^"]+)"/g,
        replacement: 'rows={${1}}',
        description: 'Fix rows string to number',
      },
      // Fix Button icon prop
      {
        pattern: /icon="([^"]+)"/g,
        replacement: 'data-icon="${1}"',
        description: 'Fix Button icon prop',
      },
      // Fix Modal onClose prop
      {
        pattern: /onClose=\{/g,
        replacement: 'on:close={',
        description: 'Fix Modal onClose prop',
      },
      // Fix class prop in context menu
      {
        pattern: /class="([^"]+)"/g,
        replacement: 'className="${1}"',
        description: 'Fix class prop in context menu',
      },
      // Add null check for evidence.type
      {
        pattern: /evidence\.type/g,
        replacement: 'evidence.evidenceType || evidence.type',
        description: 'Fix evidence.type property',
      },
      // Fix null date handling
      {
        pattern: /new Date\(([^)]+\.collectedAt)\)/g,
        replacement: 'new Date(${1} || new Date())',
        description: 'Fix null date handling',
      },
      // Fix caseId string|null to string
      {
        pattern: /caseId=\{[^}]*\?\.\w+\}/g,
        replacement: 'caseId={${1} || ""}',
        description: 'Fix caseId null handling',
      },
    ];

    fixes.forEach((fix) => {
      const before = content;
      content = content.replace(fix.pattern, fix.replacement);
      if (content !== before) {
        hasChanges = true;
        fixedCount++;
      }
    });

    if (hasChanges) {
      writeFileSync(filepath, content);
      filesProcessed++;
      console.log(`✅ Fixed ${filepath.split('/').pop()}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filepath}:`, error.message);
  }
}

// Process src directory
const srcDir = join(process.cwd(), 'src');
processDirectory(srcDir);

console.log(`\n🎉 Fixed ${fixedCount} issues in ${filesProcessed} files`);
