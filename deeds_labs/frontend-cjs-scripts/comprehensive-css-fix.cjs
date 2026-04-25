#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const srcDir = './src';

async function getAllSvelteFiles() {
  const files = [];

  async function traverse(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await traverse(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.svelte')) {
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

async function comprehensiveCSSSyntaxFix() {
  console.log('🚀 Starting comprehensive CSS syntax fix across all Svelte files...');

  const files = await getAllSvelteFiles();
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      // CSS Fixes inside <style> blocks
      const cssFixPatterns = [
        // Fix CSS property trailing commas: "background-color: #212529;," -> "background-color: #212529;"
        [/([a-zA-Z-]+):\s*([^;,}]+);\s*,/g, '$1: $2;'],

        // Fix CSS selector trailing commas: ".class-name {," -> ".class-name {"
        [/(\.[a-zA-Z-]+[:\w-]*|[:\w-]+)\s*{\s*,/g, '$1 {'],

        // Fix CSS value trailing commas: "flex: 1 1 calc(33.333% - 1rem);," -> "flex: 1 1 calc(33.333% - 1rem);"
        [/:\s*([^;,}]+);\s*,(\s*[^}]*)/g, ': $1;$2'],

        // Fix margin/padding shorthand trailing commas: "padding: 15px;," -> "padding: 15px;"
        [/(padding|margin|border):\s*([^;,}]+);\s*,/g, '$1: $2;'],

        // Fix complex CSS property trailing commas in multi-line
        [/([a-zA-Z-]+:\s*[^;,}]+);\s*,(\s*[\r\n])/g, '$1;$2'],

        // Fix pseudo-selector trailing commas: ":hover {," -> ":hover {"
        [/(:[a-zA-Z-]+)\s*{\s*,/g, '$1 {'],

        // Fix media query trailing commas: "@media (max-width: 1024px) {," -> "@media (max-width: 1024px) {"
        [/(@media[^{]+)\s*{\s*,/g, '$1 {']
      ];

      for (const [pattern, replacement] of cssFixPatterns) {
        const matches = newContent.match(pattern);
        if (matches) {
          newContent = newContent.replace(pattern, replacement);
          fileFixCount += matches.length;
        }
      }

      if (fileFixCount > 0) {
        await fs.writeFile(file, newContent, 'utf8');
        console.log(`✅ Fixed ${fileFixCount} CSS syntax issues in ${file}`);
        totalFiles++;
        totalFixes += fileFixCount;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Comprehensive CSS syntax fix complete!`);
  console.log(`📊 Fixed ${totalFixes} CSS syntax issues across ${totalFiles} Svelte files`);
  console.log(`📁 Total files scanned: ${files.length}`);
}

// Run the comprehensive fix
comprehensiveCSSSyntaxFix().catch(console.error);