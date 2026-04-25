/**
 * Phase 97: Fix comma-to-colon corruption in function arguments (Drizzle on(), etc.)
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('src/lib/server/db/*.ts', { cwd: process.cwd() }); // Target specifically the broken schema file first

let totalFixed = 0;
let filesFixed = 0;

// Pattern: .on(arg1: arg2) -> .on(arg1, arg2)
// This regex captures the .on(...) content and looks for colons used as separators
const onPattern = /\.on\(([^)]+)\)/g;

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf-8');
    const originalContent = content;
    let fileFixCount = 0;

    content = content.replace(onPattern, (match, args) => {
      // If the args part contains a colon followed by a space or specific chars, replace it with a comma
      // Example: table.status: table.priority -> table.status, table.priority
      if (args.includes(':')) {
        const fixedArgs = args.replace(/:\s/g, ', ');
        fileFixCount++;
        return `.on(${fixedArgs})`;
      }
      return match;
    });

    // Also fix foreignKey columns: [table.col1: table.col2] -> [table.col1, table.col2] if that existed (less likely for columns array but possible)

    if (content !== originalContent) {
      writeFileSync(file, content, 'utf-8');
      console.log(`✅ ${file}: Fixed ${fileFixCount} index definitions`);
      totalFixed += fileFixCount;
      filesFixed++;
    }
  } catch (err) {
    console.error(`❌ Error processing ${file}:`, err);
  }
}

console.log(`\n📊 Summary: Fixed ${totalFixed} occurrences in ${filesFixed} files`);
