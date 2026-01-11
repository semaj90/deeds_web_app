
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/lib/server/db/schema-postgres.ts');
console.log(`Processing ${filePath}...`);
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);
const newLines = [];
let inTableConfig = false;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check for start of table config
    if (line.includes('(table) => ({')) {
        line = line.replace('(table) => ({', '(table) => ([');
        inTableConfig = true;
        newLines.push(line);
        continue;
    }

    if (inTableConfig) {
        // Check for end of table config
        // Assuming strict formatting "})" or "}));" or similar at end of block
        if (line.trim().startsWith('})') || line.includes('})')) {
             // Only replace if it looks like the config close
             if (line.trim() === '})' || line.trim() === '});' || line.includes('});')) {
                 line = line.replace('})', '])');
                 inTableConfig = false;
                 newLines.push(line);
                 continue;
             }
        }

        // Handle wrapper properties
        let match = line.match(/^(\s*)(?:foreignKeys|indexes|uniqueConstraints|checkConstraints):\s*\[/);
        if (match) {
             let prefixLen = match[0].length;
             let remainder = line.substring(prefixLen);

             // If remainder is empty or whitespace, skip line (it was multi-line start)
             if (!remainder.trim()) {
                 continue;
             }

             // Single line content: Remove closing bracket at end
             // e.g. "index(...)]," -> "index(...),"
             remainder = remainder.replace(/\]\s*(,)?\s*$/, '$1');
             if (!remainder.endsWith(',')) remainder += ','; // Ensure comma? No, might depend on context.

             // Re-add indentation
             let indent = match[1];
             newLines.push(indent + remainder);
             continue;
        }

        // Handle multi-line closing brackets
        if (/^\s*\]\s*,?\s*$/.test(line)) {
            continue;
        }
    }

    newLines.push(line);
}

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Fixed Drizzle schema structure.');
