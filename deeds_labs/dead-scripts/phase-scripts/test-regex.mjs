import fs from 'fs';

const content = fs.readFileSync('reports/svelte_raw.log', 'utf8');
const lines = content.split(/\r?\n/);

// Check line 80 byte by byte
const line80 = lines[80];
console.log(`Line 80 length: ${line80.length}`);
console.log(`First 20 chars (codes):`);
for (let i = 0; i < Math.min(20, line80.length); i++) {
    const char = line80[i];
    const code = char.charCodeAt(0);
    console.log(`  [${i}] '${char}' = ${code} (0x${code.toString(16)})`);
}

// Try different regex patterns
const patterns = [
    /^Error:/,
    /Error:/,
    /^E/,
    /E/,
    /rror:/,
];

console.log(`\nRegex tests on line 80:`);
for (const pattern of patterns) {
    const result = line80.trim().match(pattern);
    console.log(`  ${pattern.toString()}: ${result ? 'YES' : 'NO'}`);
}
