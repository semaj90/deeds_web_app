
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/lib/server/db/schema-postgres.ts');
console.log(`Processing ${filePath}...`);
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);
const newLines = [];
let inTableConfig = false;
let configBuffer = [];

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.includes('(table) => ({')) {
        inTableConfig = true;
        configBuffer = [line];
        continue;
    }

    if (inTableConfig) {
        configBuffer.push(line);
        // Check for end
        // Simplistic check: line matches }) or }); or }));
         if ((line.trim().startsWith('})') || line.includes('})'))) {
             // Verify it closes the block
             // We assume indented }); or })
             if (line.trim() === '})' || line.trim() === '});' || line.includes('});')) {
                 inTableConfig = false;

                 // Process buffer
                 const bufferContent = configBuffer.join('\n');
                 const hasBadPattern = /^\s*(foreignKeys|indexes|uniqueConstraints|checkConstraints):\s*\[/m.test(bufferContent);

                 if (hasBadPattern) {
                     console.log(`Fixing corrupted table config ending at line ${i+1}`);
                     // Apply fix to buffer lines
                     const fixedBuffer = [];
                     for (let j = 0; j < configBuffer.length; j++) {
                         let bline = configBuffer[j];

                         // 1. Start: ({ -> ([
                         if (j === 0) {
                             bline = bline.replace('(table) => ({', '(table) => ([');
                             fixedBuffer.push(bline);
                             continue;
                         }

                         // 2. End: }) -> ])
                         if (j === configBuffer.length - 1) {
                             bline = bline.replace('})', '])');
                             fixedBuffer.push(bline);
                             continue;
                         }

                         // 3. Middle: Remove matchers
                         let match = bline.match(/^(\s*)(?:foreignKeys|indexes|uniqueConstraints|checkConstraints):\s*\[/);
                        if (match) {
                             let prefixLen = match[0].length;
                             let remainder = bline.substring(prefixLen);
                             if (!remainder.trim()) continue;

                             // If remainder has content, handle trailing bracket
                             remainder = remainder.replace(/\]\s*(,)?\s*$/, '$1');

                             // Indentation
                             let indent = match[1];
                             fixedBuffer.push(indent + remainder);
                             continue;
                        }

                        // Remove closing brackets for text-block wrappers
                        if (/^\s*\]\s*,?\s*$/.test(bline)) continue;

                        fixedBuffer.push(bline);
                     }
                     newLines.push(...fixedBuffer);
                 } else {
                     // Valid table, keep as is
                     newLines.push(...configBuffer);
                 }
                 configBuffer = [];
                 continue;
             }
        }
        continue;
    }

    newLines.push(line);
}

// Flush buffer if EOF reached inside config (shouldn't happen in valid file)
if (configBuffer.length > 0) newLines.push(...configBuffer);

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Fixed Drizzle schema structure.');
