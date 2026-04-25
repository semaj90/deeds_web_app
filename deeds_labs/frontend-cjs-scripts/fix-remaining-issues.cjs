#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const srcDir = './src';

async function getAllServerFiles() {
  const files = [];

  async function traverse(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await traverse(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('+page.server.ts') || entry.name.endsWith('+layout.server.ts') || entry.name.endsWith('+server.ts'))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error.message);
    }
  }

  await traverse(srcDir);
  return files;
}

async function fixRemainingIssues() {
  console.log('🔧 Fixing remaining server file issues...');

  const files = await getAllServerFiles();
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      // Fix semicolons in comments
      const commentSemicolonPattern = /\/\/([^;\n]*);(\s*)$/gm;
      const commentMatches = content.match(commentSemicolonPattern);
      if (commentMatches) {
        newContent = newContent.replace(commentSemicolonPattern, '//$1$2');
        fileFixCount += commentMatches.length;
      }

      // Fix Record<string, any> type issues - replace with proper object type
      const recordTypePattern = /Record<string,\s*any>/g;
      const recordMatches = content.match(recordTypePattern);
      if (recordMatches) {
        newContent = newContent.replace(recordTypePattern, '{ [key: string]: any }');
        fileFixCount += recordMatches.length;
      }

      // Fix specific malformed patterns found in the validation
      const specificFixes = [
        // Fix array filter join syntax
        [/filter\(item => item\.join\)/g, 'filter(Boolean).join'],
        // Fix malformed object spread
        [/:\s*Record<string,\s*any>\s*\)/g, ': { [key: string]: any })'],
      ];

      for (const [pattern, replacement] of specificFixes) {
        const matches = newContent.match(pattern);
        if (matches) {
          newContent = newContent.replace(pattern, replacement);
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

  console.log(`\n🎉 Remaining issues fix complete!`);
  console.log(`📊 Fixed ${totalFixes} issues across ${totalFiles} files`);
}

// Run the fix
fixRemainingIssues().catch(console.error);