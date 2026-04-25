
const fs = require('fs');

const content = fs.readFileSync('errors.log', 'utf8');
const lines = content.split('\n');

const fileCounts = {};

lines.forEach(line => {
    // Look for lines starting with "src/" potentially preceded by whitespace
    const match = line.match(/^\s*(src\/[^:]+):/);
    if (match) {
        const file = match[1];
        fileCounts[file] = (fileCounts[file] || 0) + 1;
    }
});

const sortedFiles = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

console.log('Top 10 Error Files:');
sortedFiles.forEach(([file, count]) => {
    console.log(`${file}: ${count} errors`);
});
