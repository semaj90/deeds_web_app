
const fs = require('fs');

try {
    const content = fs.readFileSync('errors.log', 'utf8');
    const lines = content.split('\n');

    const fileCounts = {};

    lines.forEach(line => {
        // Look for lines that look like filenames at the start
        // svelte-check output: "src/routes/+page.svelte:10:2: Error: ..."
        const match = line.match(/^([a-zA-Z0-9_\-\/\.\\]+\.(ts|js|svelte)):/);
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
} catch (e) {
    console.error("Error reading log:", e);
}
