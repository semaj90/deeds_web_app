#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('🔄 Converting Svelte 4 event handlers to Svelte 5 onclick syntax...');

// Find all Svelte files
const svelteFiles = glob.sync('src/**/*.svelte');

let totalFiles = 0;
let modifiedFiles = 0;
let totalConversions = 0;

for (const file of svelteFiles) {
  totalFiles++;

  try {
    const content = readFileSync(file, 'utf-8');
    let modified = content;
    let fileConversions = 0;

    // Convert common event handlers
    const conversions = [
      { from: /\bon:click=/g, to: 'onclick=' },
      { from: /\bon:change=/g, to: 'onchange=' },
      { from: /\bon:input=/g, to: 'oninput=' },
      { from: /\bon:submit=/g, to: 'onsubmit=' },
      { from: /\bon:keydown=/g, to: 'onkeydown=' },
      { from: /\bon:keyup=/g, to: 'onkeyup=' },
      { from: /\bon:mouseenter=/g, to: 'onmouseenter=' },
      { from: /\bon:mouseleave=/g, to: 'onmouseleave=' },
      { from: /\bon:focus=/g, to: 'onfocus=' },
      { from: /\bon:blur=/g, to: 'onblur=' },
      { from: /\bon:load=/g, to: 'onload=' },
      { from: /\bon:error=/g, to: 'onerror=' },
      { from: /\bon:drop=/g, to: 'ondrop=' },
      { from: /\bon:dragover=/g, to: 'ondragover=' },
    ];

    for (const { from, to } of conversions) {
      const matches = modified.match(from);
      if (matches) {
        modified = modified.replace(from, to);
        fileConversions += matches.length;
      }
    }

    if (fileConversions > 0) {
      writeFileSync(file, modified);
      modifiedFiles++;
      totalConversions += fileConversions;
      console.log(`✅ ${file}: ${fileConversions} conversions`);
    }

  } catch (error) {
    console.log(`❌ Error processing ${file}:`, error.message);
  }
}

console.log('\n📊 Conversion Summary:');
console.log(`📁 Total files scanned: ${totalFiles}`);
console.log(`✏️  Files modified: ${modifiedFiles}`);
console.log(`🔄 Total conversions: ${totalConversions}`);
console.log('✅ Svelte 5 onclick conversion complete!');