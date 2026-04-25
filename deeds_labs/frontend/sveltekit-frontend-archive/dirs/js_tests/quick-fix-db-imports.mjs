#!/usr/bin/env node

/**
 * Quick Fix for Database Import Paths
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function findFiles(dir, extension = '.ts') {
  let results = [];
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      results = results.concat(findFiles(filePath, extension));
    } else if (file.endsWith(extension)) {
      results.push(filePath);
    }
  }

  return results;
}

const routesDir = join(process.cwd(), 'src/routes');
const files = findFiles(routesDir);

let fixedCount = 0;

console.log('🔧 Quick-fixing database import paths...\n');

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf-8');
    let modified = false;

    // Fix all variations of database import paths
    const fixes = [
      // Main database imports
      { from: /lib\/server\/db\.js/g, to: 'lib/server/db/index.js' },
      {
        from: /lib\/server\/database\/connection\.js/g,
        to: 'lib/server/db/index.js',
      },
      { from: /lib\/server\/db\/pg\.js/g, to: 'lib/server/db/index.js' },

      // Schema imports
      {
        from: /lib\/server\/db\/schema-postgres\.js/g,
        to: 'lib/server/db/schema.js',
      },
      {
        from: /lib\/server\/db\/schema-canvas\.js/g,
        to: 'lib/server/db/schema.js',
      },
      {
        from: /lib\/server\/database\/vector-schema\.js/g,
        to: 'lib/server/db/schema.js',
      },
    ];

    for (const fix of fixes) {
      if (fix.from.test(content)) {
        content = content.replace(fix.from, fix.to);
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(file, content);
      console.log(`✅ Fixed: ${file.replace(process.cwd(), '.')}`);
      fixedCount++;
    }
  } catch (error) {
    // Skip files that can't be read
  }
}

console.log(`\n🎉 Fixed ${fixedCount} files`);
console.log('✅ All database import paths should now be correct!');
