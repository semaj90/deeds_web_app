#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const srcDir = './src';

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

async function fixRemainingSyntax() {
  console.log('🔍 Finding remaining syntax issues...');

  const files = await getAllFiles(srcDir);
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      // Fix various syntax patterns
      const fixes = [
        // Fix comma-semicolon patterns in object properties
        [/(\w+:\s*[^,\n]+),\s*;/g, '$1,'],
        // Fix trailing comma-semicolon in objects
        [/,\s*;\s*(\n|$)/g, ',\n'],
        // Fix empty catch blocks
        [/}\s*catch\s*{\s*}/g, '} catch (error) {}'],
        // Fix catch blocks with empty parameters
        [/}\s*catch\s*\(\s*\)\s*{/g, '} catch (error) {'],
        // Fix object property syntax errors
        [/(\w+):\s*([^,\n]+),\s*;\s*\n/g, '$1: $2,\n'],
        // Fix more specific patterns found in routes
        [/id:\s*users\.id,\s*;/g, 'id: users.id,'],
        [/status:\s*cases\.status,\s*;/g, 'status: cases.status,'],
        [/prompt:\s*aiHistory\.prompt,\s*;/g, 'prompt: aiHistory.prompt,'],
        [/},\s*;/g, '},'],
      ];

      for (const [pattern, replacement] of fixes) {
        const matches = content.match(pattern);
        if (matches) {
          newContent = newContent.replace(pattern, replacement);
          fileFixCount += matches.length;
        }
      }

      if (fileFixCount > 0) {
        await fs.writeFile(file, newContent, 'utf8');
        console.log(`✅ Fixed ${fileFixCount} remaining issues in ${file}`);
        totalFiles++;
        totalFixes += fileFixCount;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Remaining syntax fix complete!`);
  console.log(`📊 Fixed ${totalFixes} issues across ${totalFiles} files`);
}

// Run the fix
fixRemainingSyntax().catch(console.error);