const fs = require('fs');
const content = fs.readFileSync('src/lib/machines/enhanced-legal-upload-analytics-machine.ts', 'utf8');

let level = 0;
let inString = false;
let stringChar = '';
let inComment = false; // //
let inBlockComment = false; // /* */

const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (inString) {
            if (char === stringChar && line[j-1] !== '\\') {
                inString = false;
            }
        } else if (inComment) {
            // Newline ends comment, hit loop end
        } else if (inBlockComment) {
            if (char === '*' && line[j+1] === '/') {
                inBlockComment = false;
                j++;
            }
        } else {
            if (char === '/' && line[j+1] === '/') {
                inComment = true;
                j = line.length; // Skip rest of line
            } else if (char === '/' && line[j+1] === '*') {
                inBlockComment = true;
                j++;
            } else if (char === '"' || char === "'" || char === '`') {
                inString = true;
                stringChar = char;
            } else if (char === '{') {
                level++;
            } else if (char === '}') {
                level--;
            }
        }
    }
    inComment = false;

    // Check specific marker
    if (line.includes('{ // start options')) {
        console.log(`Level at "{ // start options" (line ${i+1}): ${level}`);
    }
    // Check specific marker
    if (line.includes('error: {')) {
        console.log(`Level at "error: {" (line ${i+1}): ${level + 1}`); // +1 because { is on this line
    }
}

console.log(`Final Level: ${level}`);
