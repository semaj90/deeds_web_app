import fs from 'fs';

const filePath = 'logs/phase78-errors.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const errorCounts = {};
const errorPatterns = {};

data.errors.forEach(error => {
    const file = error.filePath;
    if (file.includes('.svelte-kit') || file.includes('node_modules')) {
        return;
    }

    errorCounts[file] = (errorCounts[file] || 0) + 1;

    if (!errorPatterns[file]) {
        errorPatterns[file] = {};
    }
    const code = error.tsCode || 'unknown';
    errorPatterns[file][code] = (errorPatterns[file][code] || 0) + 1;
});

const sortedFiles = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

const globalPatterns = {};

data.errors.forEach(error => {
    const file = error.filePath;
    if (file.includes('.svelte-kit') || file.includes('node_modules')) {
        return;
    }
    const code = error.tsCode || 'unknown';
    globalPatterns[code] = (globalPatterns[code] || 0) + 1;
});

console.log('Top 20 Files with Errors:');
sortedFiles.forEach(([file, count], index) => {
    const topPatterns = Object.entries(errorPatterns[file])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([code, c]) => `${code} (${c})`)
        .join(', ');
    console.log(`${index + 1}. ${count}\t${file}\t[Top Patterns: ${topPatterns}]`);
});

console.log('\nGlobal Top 10 Error Codes (Filtered Files):');
Object.entries(globalPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([code, count]) => {
        console.log(`${code}: ${count}`);
    });

