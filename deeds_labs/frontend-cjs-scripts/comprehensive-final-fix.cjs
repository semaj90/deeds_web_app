#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const srcDir = './src';

async function getAllFiles() {
  const files = [];

  async function traverse(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await traverse(fullPath);
        } else if (entry.isFile() && (
          entry.name.endsWith('.ts') ||
          entry.name.endsWith('.svelte') ||
          entry.name.endsWith('.js')
        )) {
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

async function comprehensiveFinalFix() {
  console.log('🚀 Starting comprehensive final fix...');

  const files = await getAllFiles();
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      // Fix 1: Semicolons in comments
      const commentSemicolonPattern = /\/\/([^;\n]*);(\s*)$/gm;
      const commentMatches = content.match(commentSemicolonPattern);
      if (commentMatches) {
        newContent = newContent.replace(commentSemicolonPattern, '//$1$2');
        fileFixCount += commentMatches.length;
      }

      // Fix 2: Record<string, any> type issues
      const recordTypePattern = /Record<string,\s*any>/g;
      const recordMatches = content.match(recordTypePattern);
      if (recordMatches) {
        newContent = newContent.replace(recordTypePattern, '{ [key: string]: any }');
        fileFixCount += recordMatches.length;
      }

      // Fix 3: Malformed object properties
      const malformedObjectPattern = /errors:\s*{\s*\[key:\s*string\]:\s*any\s*},/g;
      const objectMatches = content.match(malformedObjectPattern);
      if (objectMatches) {
        newContent = newContent.replace(malformedObjectPattern, 'errors: {} as { [key: string]: any },');
        fileFixCount += objectMatches.length;
      }

      // Fix 4: Array filter join syntax
      const filterJoinPattern = /\.filter\(item\s*=>\s*item\.join\)/g;
      const filterMatches = content.match(filterJoinPattern);
      if (filterMatches) {
        newContent = newContent.replace(filterJoinPattern, '.filter(Boolean).join');
        fileFixCount += filterMatches.length;
      }

      // Fix 5: Case statement trailing semicolons
      const caseStatementPattern = /case\s+['"`]([^'"`]+)['"`]:\s*;/g;
      const caseMatches = content.match(caseStatementPattern);
      if (caseMatches) {
        newContent = newContent.replace(caseStatementPattern, "case '$1':");
        fileFixCount += caseMatches.length;
      }

      // Fix 6: Malformed spread operators
      const spreadPattern = /\.\.\.\(\s*vector\s*\?\s*{\s*embedding:\s*vector\s*as\s*any\s*}\s*:\s*{\s*\[key:\s*string\]:\s*any\s*}\s*\)/g;
      const spreadMatches = content.match(spreadPattern);
      if (spreadMatches) {
        newContent = newContent.replace(spreadPattern, '...(vector ? { embedding: vector as any } : {})');
        fileFixCount += spreadMatches.length;
      }

      // Fix 7: Duplicate property definitions
      const duplicatePattern = /(\w+:\s*[^,}]+),(\s*\w+:\s*[^,}]+),(\s*\1:\s*[^,}]+)/g;
      const duplicateMatches = content.match(duplicatePattern);
      if (duplicateMatches) {
        newContent = newContent.replace(duplicatePattern, '$1,$2');
        fileFixCount += duplicateMatches.length;
      }

      // Fix 8: Missing commas in object literals
      const missingCommaPattern = /(\w+:\s*[^,}\n]+)\n(\s*\w+:)/g;
      const commaMatches = content.match(missingCommaPattern);
      if (commaMatches) {
        newContent = newContent.replace(missingCommaPattern, '$1,\n$2');
        fileFixCount += commaMatches.length;
      }

      // Fix 9: Trailing semicolon after actions export
      const trailingSemicolonPattern = /^(\s*)};(\s*);(null as any as Actions);$/gm;
      const trailingMatches = content.match(trailingSemicolonPattern);
      if (trailingMatches) {
        newContent = newContent.replace(trailingSemicolonPattern, '$1};');
        fileFixCount += trailingMatches.length;
      }

      // Fix 10: Malformed type annotations
      const typeAnnotationPattern = /:\s*{\s*\[key:\s*string\]:\s*any\s*}\s*\)/g;
      const typeMatches = content.match(typeAnnotationPattern);
      if (typeMatches) {
        newContent = newContent.replace(typeAnnotationPattern, ': { [key: string]: any })');
        fileFixCount += typeMatches.length;
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

  console.log(`\n🎉 Comprehensive final fix complete!`);
  console.log(`📊 Fixed ${totalFixes} issues across ${totalFiles} files`);

  // Now regenerate types
  console.log('\n🔄 Regenerating SvelteKit types...');
  const { exec } = require('child_process');

  return new Promise((resolve) => {
    exec('rm -rf .svelte-kit && npx svelte-kit sync', (error, stdout, stderr) => {
      if (error) {
        console.error('Type regeneration failed:', error);
      } else {
        console.log('✅ Types regenerated successfully');
      }
      resolve();
    });
  });
}

// Run the comprehensive fix
comprehensiveFinalFix().catch(console.error);