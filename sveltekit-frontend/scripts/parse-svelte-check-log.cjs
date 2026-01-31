const fs = require('fs');
const path = require('path');

// Read the svelte-check log
const logPath = path.join(__dirname, '..', 'tests', 'logs', 'svelte-check-20260131-091133.log');
const content = fs.readFileSync(logPath, 'utf8');

// Parse file paths and count errors per file
const fileErrors = {};
const lines = content.split('\n');

for (const line of lines) {
    // Match file paths like: c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\...
    const match = line.match(/^c:[\\\/]Users[\\\/]james[\\\/]Videos[\\\/]deeds-web-app[\\\/]sveltekit-frontend[\\\/](.+?):(\d+):(\d+)/);
    if (match) {
        const file = match[1].replace(/\\\\/g, '/').replace(/\\/g, '/');
        fileErrors[file] = (fileErrors[file] || 0) + 1;
    }
}

// Sort by error count descending
const sorted = Object.entries(fileErrors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100);

// Output as tab-separated
const output = sorted.map(([file, count]) => `${count}\t${file}`).join('\n');

const outputPath = path.join(__dirname, '..', 'tests', 'logs', 'top-100-files.txt');
fs.writeFileSync(outputPath, output);

console.log(`Saved ${sorted.length} files to ${outputPath}`);
console.log('\nTop 20 files with most errors:');
sorted.slice(0, 20).forEach(([file, count], i) => {
    console.log(`${i + 1}. ${count} errors: ${file}`);
});
