const fs = require('fs');
const { exec } = require('child_process');

console.log('Running svelte-check...');

exec('npx svelte-check --threshold error --output human', { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error && !stdout) {
        console.error('Error running svelte-check:', error);
        return;
    }

    const output = stdout + stderr;
    const lines = output.split('\n');
    const fileErrors = {};
    let currentFile = null;

    const fileRegex = /^([a-zA-Z]:\\[^:]+|[^:]+):(\d+):(\d+)/;

    // Process output
    for (const line of lines) {
        const match = line.match(fileRegex);
        if (match) {
            const filePath = match[1].trim();
            if (!fileErrors[filePath]) {
                fileErrors[filePath] = 0;
            }
            fileErrors[filePath]++;
        }
    }

    // Convert to array and sort
    const sortedFiles = Object.entries(fileErrors)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15);

    console.log('\nTOP 15 ERROR FILES:');
    sortedFiles.forEach(([file, count], index) => {
        console.log(`${index + 1}. ${file} (${count} errors)`);
    });

    const totalErrors = Object.values(fileErrors).reduce((sum, count) => sum + count, 0);
    console.log(`\nTotal Errors Detected: ${totalErrors}`);
});
