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
        } else if (entry.isFile() &&
                   (entry.name.endsWith('+page.server.ts') ||
                    entry.name.endsWith('+layout.server.ts') ||
                    entry.name.endsWith('+server.ts') ||
                    entry.name.endsWith('.server.ts'))) {
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

async function fixTrailingCommaIssues() {
  console.log('🚀 Starting comprehensive trailing comma fix for server files...');

  const files = await getAllServerFiles();
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      // Critical patterns causing TS1136 "Property assignment expected" errors
      const trailingCommaFixes = [
        // Fix object property opening brace with immediate comma: "{ obj: {, prop:" -> "{ obj: { prop:"
        [/({[\s]*[a-zA-Z_$][a-zA-Z0-9_$]*:\s*{)\s*,/g, '$1'],

        // Fix actions export with immediate comma: "actions = {," -> "actions = {"
        [/(actions\s*[:=]\s*{)\s*,/g, '$1'],

        // Fix return object with immediate comma: "return {," -> "return {"
        [/(return\s*{)\s*,/g, '$1'],

        // Fix export const actions with immediate comma: "export const actions = {," -> "export const actions = {"
        [/(export\s+const\s+actions\s*[:=]\s*{)\s*,/g, '$1'],

        // Fix any object literal opening with immediate comma: "name: {," -> "name: {"
        [/([a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*{)\s*,/g, '$1'],

        // Fix function return object with immediate comma: "=> {," -> "=> {"
        [/(=>\s*{)\s*,/g, '$1'],

        // Fix double semicolons: ";;" -> ";"
        [/;;/g, ';'],

        // Fix malformed Actions type annotation: "};;null as any as Actions;" -> "} satisfies Actions;"
        [/};\s*;\s*null\s+as\s+any\s+as\s+Actions;/g, '} satisfies Actions;'],

        // Fix variable declarations with immediate comma: "let obj = {," -> "let obj = {"
        [/(let|const|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*{,/g, '$1 $2 = {'],

        // Fix interface/type object with immediate comma: ": {," -> ": {"
        [/(:\s*{)\s*,/g, '$1']
      ];

      for (const [pattern, replacement] of trailingCommaFixes) {
        const beforeContent = newContent;
        newContent = newContent.replace(pattern, replacement);
        if (beforeContent !== newContent) {
          const matches = beforeContent.match(pattern);
          if (matches) {
            fileFixCount += matches.length;
          }
        }
      }

      if (fileFixCount > 0) {
        await fs.writeFile(file, newContent, 'utf8');
        console.log(`✅ Fixed ${fileFixCount} trailing comma issues in ${file}`);
        totalFiles++;
        totalFixes += fileFixCount;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Trailing comma fix complete!`);
  console.log(`📊 Fixed ${totalFixes} trailing comma issues across ${totalFiles} server files`);
  console.log(`📁 Total files scanned: ${files.length}`);
}

// Run the comprehensive fix
fixTrailingCommaIssues().catch(console.error);