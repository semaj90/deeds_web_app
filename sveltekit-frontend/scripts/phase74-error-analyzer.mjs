import fs from 'fs';
import path from 'path';
import readline from 'readline';

async function analyzeErrors(logPath) {
    if (!fs.existsSync(logPath)) {
        console.error('File not found: ' + logPath);
        return;
    }

    console.log('📊 Analyzing errors from: ' + logPath);

    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const fileErrors = {};
    const errorTypes = {};
    const messagePatterns = {};

    let currentFile = null;
    let totalErrors = 0;

    // Robust path regex that matches Windows and Linux paths followed by line:col
    const pathRegex = /([a-zA-Z]:[\\/][^:]+|[\\/][^:]+):(\d+):(\d+)/;

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const pathMatch = trimmed.match(pathRegex);
        if (pathMatch) {
            currentFile = pathMatch[1].replace(/\\/g, '/');
            continue;
        }

        if (trimmed.startsWith('Error: ') || trimmed.startsWith('[vite:css][postcss]')) {
            totalErrors++;
            const errorMessage = trimmed.replace('Error: ', '');

            if (currentFile) {
                fileErrors[currentFile] = (fileErrors[currentFile] || 0) + 1;
            }

            // Extract error type (e.g. TS2304)
            const typeMatch = errorMessage.match(/\(ts\s+(\d+)\)|\(svelte\s+(\d+)\)|TS(\d+)|\[postcss\]/);
            const errorType = typeMatch ? (typeMatch[1] || typeMatch[2] || typeMatch[3] || 'POSTCSS') : 'UNKNOWN';
            errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;

            // Pattern categorization
            let pattern = errorMessage;
            if (errorType !== 'UNKNOWN') {
                pattern = errorMessage.split(' (ts')[0].split(' (svelte')[0];
            }
            // Remove specific names to generalize pattern
            pattern = pattern.replace(/'[^']+'/g, "'X'");
            messagePatterns[pattern] = (messagePatterns[pattern] || 0) + 1;
        }
    }

    const sortedFiles = Object.entries(fileErrors).sort((a, b) => b[1] - a[1]);
    const sortedTypes = Object.entries(errorTypes).sort((a, b) => b[1] - a[1]);
    const sortedPatterns = Object.entries(messagePatterns).sort((a, b) => b[1] - a[1]);

    console.log('\n📈 Summary Statistics:');
    console.log('   Total Files with Errors: ' + Object.keys(fileErrors).length);
    console.log('   Total Error Count: ' + totalErrors);
    console.log('   Unique Error Types: ' + Object.keys(errorTypes).length);

    console.log('\n📁 Top 20 Highest-Error Files:');
    sortedFiles.slice(0, 20).forEach(([file, count], i) => {
        console.log('  ' + (i + 1).toString().padStart(2, ' ') + '. ' + count.toString().padStart(4, ' ') + ' errors - ' + file);
    });

    console.log('\n🔍 Top 20 Error Types:');
    sortedTypes.slice(0, 20).forEach(([type, count]) => {
        console.log('  ' + type.padEnd(10, ' ') + ' - ' + count.toString().padStart(5, ' ') + ' occurrences');
    });

    const reportPath = 'logs/top-100-error-files.txt';
    fs.writeFileSync(reportPath, sortedFiles.slice(0, 100).map(([f, c]) => c + '\t' + f).join('\n'));
    console.log('\n✅ Top 100 files written to: ' + reportPath);

    const jsonReport = {
        stats: { totalFiles: Object.keys(fileErrors).length, totalErrors, uniqueTypes: Object.keys(errorTypes).length },
        files: sortedFiles,
        types: sortedTypes,
        patterns: sortedPatterns
    };
    fs.writeFileSync('logs/error-analysis-phase75.json', JSON.stringify(jsonReport, null, 2));
}

const logFile = process.argv[2] || 'logs/errors-phase75-post-clean.txt';
analyzeErrors(logFile);
