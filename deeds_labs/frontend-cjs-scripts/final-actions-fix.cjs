#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function fixRemainingActionsErrors() {
  console.log('🚀 Final fix for remaining Actions syntax issues...');

  const files = [];
  async function findFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await findFiles(fullPath);
      } else if (entry.name.endsWith('+page.server.ts') || entry.name.endsWith('+layout.server.ts')) {
        files.push(fullPath);
      }
    }
  }

  await findFiles('./src');

  let totalFixes = 0;
  let filesFixed = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let changed = false;

      // Fix remaining Actions patterns that weren't caught
      const additionalFixes = [
        // Actions type with trailing comma: "Actions = {," -> "Actions = {"
        [/(:\s*Actions\s*=\s*{)\s*,/g, '$1'],
        [/(export\s+const\s+actions\s*:\s*Actions\s*=\s*{)\s*,/g, '$1'],
        // Any missed return objects with trailing comma
        [/(return\s*{\s*[a-zA-Z_$][a-zA-Z0-9_$]*:\s*{)\s*,/g, '$1'],
        // Load function returns with trailing comma
        [/(export\s+(?:async\s+)?function\s+load\s*\([^)]*\)\s*[^{]*{\s*[^}]*return\s*{)\s*,/gs, '$1'],
      ];

      for (const [pattern, replacement] of additionalFixes) {
        const beforeContent = newContent;
        newContent = newContent.replace(pattern, replacement);
        if (beforeContent !== newContent) {
          changed = true;
          const matches = (beforeContent.match(pattern) || []).length;
          totalFixes += matches;
        }
      }

      if (changed) {
        await fs.writeFile(file, newContent, 'utf8');
        console.log(`✅ Fixed additional syntax issues in ${file}`);
        filesFixed++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Final Actions fix complete!`);
  console.log(`📊 Fixed ${totalFixes} additional issues across ${filesFixed} files`);
}

fixRemainingActionsErrors().catch(console.error);