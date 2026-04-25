#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const srcDir = './src';

// Pattern to find dangling semicolons in object properties
const patterns = [
  // Fix: "property": "value",\n; -> "property": "value",
  {
    regex: /,\s*\n\s*;/g,
    replacement: ',',
    description: 'Remove dangling semicolons after object properties'
  },
  // Fix: }\n; -> }
  {
    regex: /}\s*\n\s*;/g,
    replacement: '}',
    description: 'Remove dangling semicolons after closing braces'
  },
  // Fix: ],\n; -> ],
  {
    regex: /\],\s*\n\s*;/g,
    replacement: '],',
    description: 'Remove dangling semicolons after array elements'
  }
];

async function getAllFiles(dir, extensions = ['.ts', '.js', '.svelte']) {
  const files = [];

  async function traverse(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await traverse(fullPath);
        } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error.message);
    }
  }

  await traverse(dir);
  return files;
}

async function fixDanglingSemicolons() {
  console.log('🔍 Finding files with dangling semicolons...');

  const files = await getAllFiles(srcDir);
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      for (const pattern of patterns) {
        const matches = content.match(pattern.regex);
        if (matches) {
          newContent = newContent.replace(pattern.regex, pattern.replacement);
          fileFixCount += matches.length;
        }
      }

      if (fileFixCount > 0) {
        await fs.writeFile(file, newContent, 'utf8');
        console.log(`✅ Fixed ${fileFixCount} issues in ${file}`);
        totalFiles++;
        totalFixes += fileFixCount;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Dangling semicolon fix complete!`);
  console.log(`📊 Fixed ${totalFixes} issues across ${totalFiles} files`);

  if (totalFixes > 0) {
    console.log('\n🔧 Patterns fixed:');
    patterns.forEach(p => console.log(`   - ${p.description}`));
  }
}

// Run the fix
fixDanglingSemicolons().catch(console.error);