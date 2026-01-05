
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
        // Check for end of table config.
        // Replace '})' with '])' if it appears to be valid end.
        if (line.trim().startsWith('})') || line.includes('})')) {
             if (line.trim() === '})' || line.trim() === '});' || line.includes('})')) {
                 console.log(`Found table config end at line ${i+1}`);
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
        if (/^\s*\](\s*,)?\s*$/.test(line)) {
            console.log(`Removing wrapper end at line ${i+1}`);
            continue;
        }
    }

    newLines.push(line);
}

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Fixed Drizzle schema structure.');
