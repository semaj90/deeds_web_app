
import fs from 'fs';
import readline from 'readline';

const logFile = 'reports/svelte-check-machine.log';

if (!fs.existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`);
    process.exit(1);
}

const fileStream = fs.createReadStream(logFile);
const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
});

const errorsByFile = {};
const errorsByMessage = {};
let totalErrors = 0;

rl.on('line', (line) => {
    // Format: TIMESTAMP SEVERITY "file" line:col "message"
    // Example: 1768266176871 ERROR "src\\FixSynthesizer.ts" 75:14 "',' expected."

    // We only care about ERROR
    if (!line.includes(' ERROR ')) return;

    // Simple parser
    const parts = line.match(/^\d+\s+ERROR\s+"(.+)"\s+(\d+):(\d+)\s+"(.*)"$/);
    if (!parts) return;

    const rawFile = parts[1]; // src\\FixSynthesizer.ts
    const message = parts[4];

    // Unescape parsed file path (basic)
    const filePath = rawFile.replace(/\\\\/g, '\\');

    totalErrors++;

    // Count by file
    errorsByFile[filePath] = (errorsByFile[filePath] || 0) + 1;

    // Count by message
    let genericMessage = message
        .replace(/'[^']*'/g, "'...'")
        .replace(/"[^"]*"/g, '"..."')
        .replace(/module \.\.\./, "module '...'");

    if (genericMessage.length > 100) genericMessage = genericMessage.substring(0, 100) + '...';

    errorsByMessage[genericMessage] = (errorsByMessage[genericMessage] || 0) + 1;
});rl.on('close', () => {
    console.log(`\nParsed ${totalErrors} errors.\n`);

    console.log('--- Top 100 Files by Error Count ---');
    const sortedFiles = Object.entries(errorsByFile)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100);

    sortedFiles.forEach(([file, count], index) => {
        console.log(`${index + 1}. ${file} (${count} errors)`);
    });

    console.log('\n--- Top 20 Common Error Patterns ---');
    const sortedMessages = Object.entries(errorsByMessage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    sortedMessages.forEach(([msg, count], index) => {
        console.log(`${index + 1}. [${count}] ${msg}`);
    });
});
