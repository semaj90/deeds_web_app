
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/lib/server/db/schema-postgres.ts');
console.log(`Processing ${filePath}...`);
let content = fs.readFileSync(filePath, 'utf8');

// Backup
fs.writeFileSync(filePath + '.bak_attempt', content);

const lines = content.split(/\r?\n/);
const newLines = [];
let inTableConfig = false;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check for start of table config
    if (line.includes('(table) => ({')) {
        console.log(`Found table config start at line ${i+1}`);
        line = line.replace('(table) => ({', '(table) => ([');
        inTableConfig = true;
        newLines.push(line);
        continue;
    }

    if (inTableConfig) {
        // Check for end of table config
        // Standard Drizzle format often puts `})` at the start of the line or `}));`
        if (line.trim().startsWith('})') || line.includes('})')) {
             // Be careful not to match inside other things.
             // But valid table config end is closing the arrow function.
             if (line.includes('})')) {
                 console.log(`Found table config end at line ${i+1}`);
                 // Replace ONLY the occurrence corresponding to the config close?
                 // Usually it's `})` or `}))`.
                 // We changed ({ to ([
                 // We expect lines of constraints.
                 // Then ending `])`.

                 // If line contains `})`, replace it with `])`.
                 line = line.replace('})', '])');
                 inTableConfig = false;
                 newLines.push(line);
                 continue;
             }
        }

        // Remove wrapper keys
        if (/^\s*(foreignKeys|indexes|uniqueConstraints|checkConstraints):\s*\[/.test(line)) {
            console.log(`Removing wrapper start at line ${i+1}: ${line.trim()}`);
            continue; // Skip this line
        }

        // Remove closing brackets for wrappers
        // Matches lines containing only `],` or `]` with whitespace
        if (/^\s*\](\s*,)?\s*$/.test(line)) {
            console.log(`Removing wrapper end at line ${i+1}`);
            continue;
        }
    }

    newLines.push(line);
}

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Fixed Drizzle schema structure.');
