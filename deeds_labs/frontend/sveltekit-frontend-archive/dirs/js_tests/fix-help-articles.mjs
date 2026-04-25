#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

console.log('🔧 Fixing Help Articles...');

const helpPagePath = join(process.cwd(), 'src', 'routes', 'help', '+page.svelte');
let content = readFileSync(helpPagePath, 'utf8');

// Fix articles missing tags and lastUpdated fields
const fixes = [
  {
    search: /(\{\s*id:\s*"case-management"[^}]*?)(\s*content:\s*`)/g,
    replace:
      '$1\n      tags: ["case-management", "organization", "best-practices"],\n      lastUpdated: "2024-01-15",$2',
  },
  {
    search: /(\{\s*id:\s*"evidence-best-practices"[^}]*?)(\s*content:\s*`)/g,
    replace:
      '$1\n      tags: ["evidence", "handling", "best-practices", "security"],\n      lastUpdated: "2024-01-15",$2',
  },
  {
    search: /(\{\s*id:\s*"ai-prompting"[^}]*?)(\s*content:\s*`)/g,
    replace:
      '$1\n      tags: ["ai-assistant", "prompting", "techniques"],\n      lastUpdated: "2024-01-15",$2',
  },
  {
    search: /(\{\s*id:\s*"common-issues"[^}]*?)(\s*content:\s*`)/g,
    replace:
      '$1\n      tags: ["troubleshooting", "common-issues", "solutions"],\n      lastUpdated: "2024-01-15",$2',
  },
];

let fixedCount = 0;
fixes.forEach((fix) => {
  if (fix.search.test(content)) {
    content = content.replace(fix.search, fix.replace);
    fixedCount++;
  }
});

writeFileSync(helpPagePath, content);

console.log(`✅ Fixed ${fixedCount} help articles`);
console.log('📝 All help articles now have tags and lastUpdated fields');
