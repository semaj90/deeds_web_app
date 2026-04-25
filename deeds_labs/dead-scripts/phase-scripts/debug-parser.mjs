import fs from 'fs';

const content = fs.readFileSync('reports/svelte_raw.log', 'utf8');
const lines = content.split(/\r?\n/);

console.log(`Total lines: ${lines.length}`);

let foundFiles = 0;
let foundErrors = 0;

for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track files
    if (trimmed.match(/^[a-zA-Z]:\\[^:]+:\d+:\d+$/)) {
        foundFiles++;
        if (foundFiles <= 3) {
            console.log(`\nFile #${foundFiles} at line ${i}: ${trimmed.substring(0, 80)}`);
            // Check next line for Error
            if (i + 1 < lines.length) {
                const nextTrimmed = lines[i + 1].trim();
                console.log(`  Next line: "${nextTrimmed.substring(0, 100)}"`);
                if (nextTrimmed.match(/^Error:/)) {
                    console.log(`  ✅ Has Error:`);
                    foundErrors++;
                } else {
                    console.log(`  ❌ No Error match`);
                }
            }
        }
    }
}

console.log(`\n📊 Summary:`);
console.log(`  Found files: ${foundFiles}`);
console.log(`  Found errors: ${foundErrors}`);

