const fs = require('fs');
const content = fs.readFileSync('errors.log', 'utf8');
const lines = content.split('\n');
const fileCounts = {};

lines.forEach(line => {
    // Match line starting with absolute path (c:\...) or relative path (src\...) and containing :number:number
    // Example: c:\Users\james\...\src\lib\components\CaseOutcomePrediction.svelte:183:33
    // We want to normalize to relative path from src
    
    // Regex for grabbing the path before the :row:col pattern
    const match = line.match(/^\s*(.*src[\\\/].+):(\d+):(\d+)/);
    
    if (match) {
        let filePath = match[1].trim();
        // Normalize slashes
        filePath = filePath.replace(/\\/g, '/');
        // Extract relative path starting with src/
        const srcIndex = filePath.indexOf('src/');
        if (srcIndex !== -1) {
            filePath = filePath.substring(srcIndex);
        }
        
        fileCounts[filePath] = (fileCounts[filePath] || 0) + 1;
    }
});

const sortedFiles = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

console.log('Top 10 Error Files:');
sortedFiles.forEach(([file, count]) => {
    console.log(`${file}: ${count} errors`);
});
