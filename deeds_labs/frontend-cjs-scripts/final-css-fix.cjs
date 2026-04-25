#!/usr/bin/env node

const fs = require('fs').promises;

async function fixCSSTrailingCommas() {
  console.log('🚀 Fixing CSS trailing comma syntax issues...');

  const filePath = './src/routes/+page.svelte';

  try {
    const content = await fs.readFile(filePath, 'utf8');
    let newContent = content;
    let fixCount = 0;

    // Fix CSS trailing commas - specific patterns identified from build errors
    const cssTrailingCommaFixes = [
      // Fix selector trailing commas like ".yorha-3d-panel:hover {,"
      [/(\.[a-zA-Z-]+[:\w-]*)\s*{\s*,/g, '$1 {'],
      // Fix property trailing commas like "height: 100%;,"
      [/([a-zA-Z-]+):\s*([^;,}]+);\s*,/g, '$1: $2;'],
      // Fix value trailing commas like "flex-wrap: wrap;,"
      [/:\s*([^;,}]+);\s*,/g, ': $1;'],
    ];

    for (const [pattern, replacement] of cssTrailingCommaFixes) {
      const matches = newContent.match(pattern);
      if (matches) {
        newContent = newContent.replace(pattern, replacement);
        fixCount += matches.length;
        console.log(`✅ Fixed ${matches.length} CSS trailing comma issues`);
      }
    }

    if (fixCount > 0) {
      await fs.writeFile(filePath, newContent, 'utf8');
      console.log(`✅ Fixed ${fixCount} CSS syntax issues in ${filePath}`);
    } else {
      console.log('✅ No CSS trailing comma issues found');
    }

  } catch (error) {
    console.error(`❌ Error fixing CSS syntax:`, error.message);
  }

  console.log(`\n🎉 CSS syntax fix complete!`);
}

// Run the fix
fixCSSTrailingCommas().catch(console.error);