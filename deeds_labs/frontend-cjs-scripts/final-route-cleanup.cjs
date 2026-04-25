#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const routesDir = './src/routes';

async function getAllTSFiles(dir) {
  const files = [];

  async function traverse(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await traverse(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.server.ts')) {
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

async function finalRouteCleanup() {
  console.log('🔍 Final route cleanup...');

  const files = await getAllTSFiles(routesDir);
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      // Critical fixes for route files
      const fixes = [
        // Fix empty object in actions
        [/export const actions: Actions = \{\s*;\s*\n/g, 'export const actions: Actions = {\n'],
        // Fix case statements with semicolons
        [/case\s+'[^']+'\s*:\s*;/g, (match) => match.replace(':;', ':')],
        // Fix trailing semicolons in comments
        [/\/\/[^;\n]*;\s*$/gm, (match) => match.replace(/;$/, '')],
        // Fix malformed object properties
        [/(\w+):\s*([^,\n]+),\s*;\s*\n/g, '$1: $2,\n'],
        // Fix switch default case
        [/default\s*:\s*;/g, 'default:'],
        // Fix empty catch blocks syntax
        [/}\s*catch\s*{\s*}/g, '} catch (error) {}'],
        // Fix try-catch-finally structure
        [/}\s*catch\s*\(\s*\)\s*{\s*}/g, '} catch (error) {}'],
      ];

      for (const [pattern, replacement] of fixes) {
        const originalContent = newContent;
        newContent = newContent.replace(pattern, replacement);
        if (newContent !== originalContent) {
          fileFixCount++;
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

  console.log(`\n🎉 Final route cleanup complete!`);
  console.log(`📊 Fixed ${totalFixes} issues across ${totalFiles} files`);
}

// Run the cleanup
finalRouteCleanup().catch(console.error);