#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('🔧 Fixing remaining TypeScript issues...');

// Get all TypeScript and Svelte files
const files = glob.sync('src/**/*.{ts,svelte}');

let fixedFiles = 0;
let totalFixes = 0;

const fixes = [
  // Fix incorrect store usage (services used as stores)
  { from: /\$caseService/g, to: 'caseService' },
  { from: /\$aiService/g, to: 'aiService' },
  { from: /\$ollamaService/g, to: 'ollamaService' },

  // Fix incorrect button variants
  { from: /variant="default"/g, to: 'variant="primary"' },
  { from: /variant="outline"/g, to: 'variant="secondary"' },

  // Fix incorrect lucide icon names
  {
    from: /import \{([^}]*), Scales([^}]*)\} from 'lucide-svelte'/g,
    to: "import {$1, Scale$2} from 'lucide-svelte'",
  },
  { from: /\bScales\b/g, to: 'Scale' },

  // Fix incorrect component library imports
  { from: /createToast/g, to: 'createToaster' },

  // Fix self-closing div tags
  { from: /<div([^>]*)\/>/g, to: '<div$1></div>' },

  // Add .js extensions to relative imports (but not to external packages)
  {
    from: /from ['"](\.\.[^'"]*?)['"](?![^;]*\.(?:js|ts|svelte))/g,
    to: "from '$1.js'",
  },
  {
    from: /import\(['"](\.\.[^'"]*?)['"](?![^;]*\.(?:js|ts|svelte))\)/g,
    to: "import('$1.js')",
  },
];

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8');
    let newContent = content;
    let fileFixes = 0;

    for (const fix of fixes) {
      const before = newContent;
      newContent = newContent.replace(fix.from, fix.to);
      if (newContent !== before) {
        fileFixes++;
      }
    }

    if (newContent !== content) {
      writeFileSync(file, newContent, 'utf8');
      fixedFiles++;
      totalFixes += fileFixes;
      console.log(`✅ Applied ${fileFixes} fixes to ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
  }
}

console.log(`\n🎉 Applied fixes to ${fixedFiles} files (${totalFixes} total fixes)`);
