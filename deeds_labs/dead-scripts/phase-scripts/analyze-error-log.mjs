import fs from 'fs';
import readline from 'readline';

const logFile = 'reports/svelte-check-full.log';

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

// Regex to capture file path line: "c:\path\to\file.ts:line:col"
// Use greedy match for the path part to handle the drive letter colon (e.g. C:\...)
const fileLineRegex = /^(.*):(\d+):(\d+)\s*$/;
const errorLineRegex = /^Error:\s+(.+)$/;

let currentFile = null;
let lineCount = 0;
rl.on('line', (line) => {
    lineCount++;
    if (lineCount <= 5) {
        console.log(`DEBUG Line ${lineCount}: ${JSON.stringify(line)}`);
    }
    if (lineCount % 10000 === 0) console.log(`Processed ${lineCount} lines...`);
    line = line.trim();
    if (!line) return;

    // Check for file line
    const fileMatch = line.match(fileLineRegex);
    if (fileMatch) {
         // Some "Error: ..." lines might look like file paths if we aren't careful,
         // but usually file paths don't start with "Error".
         // Also, valid file paths here end with :row:col.
         currentFile = fileMatch[1].trim();
         return;
    }

    // Check for error line
    const errorMatch = line.match(errorLineRegex);
    if (errorMatch && currentFile) {
        totalErrors++;
        const message = errorMatch[1].trim();
        const filePath = currentFile;

        // Count by file
        errorsByFile[filePath] = (errorsByFile[filePath] || 0) + 1;

        // Count by message (simplifying to capture core issue)
        let genericMessage = message
            .replace(/'[^']*'/g, "'...'")
            .replace(/"[^"]*"/g, '"..."')
            .replace(/module \.\.\./, "module '...'");

        errorsByMessage[genericMessage] = (errorsByMessage[genericMessage] || 0) + 1;

        // Reset currentFile so we don't attribute multiple errors to same file unless they appear in sequence?
        // Actually svelte-check usually prints File:Line:Col then Error.
        // It might print multiple errors for same file, but usually repeats the file header?
        // Based on "src\FixSynthesizer.ts:75:14 \n Error: ',' expected."
        // and then "src\FixSynthesizer.ts:175:40 \n Error: ..."
        // It seems it repeats the file line for each error.
        currentFile = null;
    }
});rl.on('close', () => {
    console.log(`\nParsed ${totalErrors} errors.\n`);

    // Top 100 Files
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
