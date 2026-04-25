#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const srcDir = './src';

// Patterns that commonly cause TypeScript proxy generation issues
const problematicPatterns = [
  // Malformed object properties
  { pattern: /(\w+):\s*([^,\n]*),\s*;/, name: 'comma-semicolon in object' },
  // Empty catch blocks
  { pattern: /}\s*catch\s*{\s*}/, name: 'empty catch block' },
  // Malformed try-catch
  { pattern: /}\s*catch\s*\(\s*\)\s*{/, name: 'empty catch parameter' },
  // Trailing semicolons in comments
  { pattern: /\/\/[^;\n]*;\s*$/, name: 'semicolon in comment' },
  // Switch case issues
  { pattern: /case\s+['"][^'"]*['"]\s*:\s*;/, name: 'semicolon after case' },
  // Export issues
  { pattern: /export\s+const\s+\w+\s*=\s*{\s*;\s*/, name: 'empty export object' },
  // Type annotation issues
  { pattern: /:\s*Record<string,\s*any>\s*\)/, name: 'Record<string, any> type issue' },
];

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

async function validateSyntax() {
  console.log('🔍 Final syntax validation for server files...');

  const files = await getAllServerFiles();
  let totalFiles = 0;
  let totalIssues = 0;
  const issuesFound = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let fileIssues = [];

      for (const { pattern, name } of problematicPatterns) {
        const matches = content.match(new RegExp(pattern, 'gm'));
        if (matches) {
          fileIssues.push(`${name}: ${matches.length} occurrences`);
          totalIssues += matches.length;
        }
      }

      if (fileIssues.length > 0) {
        totalFiles++;
        issuesFound.push({
          file,
          issues: fileIssues
        });
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n📊 Validation Results:`);
  console.log(`Files with issues: ${totalFiles}`);
  console.log(`Total issues: ${totalIssues}`);

  if (issuesFound.length > 0) {
    console.log(`\n🚨 Issues found:`);
    issuesFound.forEach(({ file, issues }) => {
      console.log(`\n${file}:`);
      issues.forEach(issue => console.log(`  - ${issue}`));
    });
  } else {
    console.log('\n✅ No syntax issues found in server files!');
  }

  return { totalFiles, totalIssues, issuesFound };
}

// Run validation
validateSyntax().catch(console.error);