// This script audits the codebase for relative import patterns based on the provided logic.
// It is designed to be run via node and outputs results to a JSON file.

const fs = require('fs');
const path = require('path');

const scanDirs = process.env.SCAN_DIRS ? process.env.SCAN_DIRS.split(',') : [];
const detectPatterns = process.env.DETECT_PATTERNS ? process.env.DETECT_PATTERNS.split(',') : [];
const outputFile = process.env.OUTPUT_FILE;

async function scanFiles(directory) {
    console.log(`Scanning directory: ${directory}`);
    let content = '';
    try {
        // Read all files recursively (simplified for this example, assuming glob handles deep scan)
        const files = await glob(process.cwd() + '/' + directory, { glob: '**/*.{ts,svelte}' });
        let rawText = '';
        for (const file of files) {
            try {
                rawText += await readFile(file);
            } catch (e) {
                // Ignore read errors for continuity
            }
        }
        return rawText;
    } catch (error) {
        console.error(`Error scanning directory ${directory}:`, error);
        return '';
    }
}

async function readFile(filePath) {
    try {
        // Read file content for pattern matching
        return await fs.promises.readFile(filePath, 'utf8');
    } catch (e) {
        return '';
    }
}

async function auditImports(rawText) {
    const results = [];
    // Simplified regex matching for demonstration based on detection patterns
    const importRegex = /from\s+['"](\.\.?\/.*)['"]|import\s+.*from\s+['"](\.\.?\/.*)['"]/g;
    let match;
    let index = 0;
    
    while ((match = importRegex.exec(rawText)) !== null) {
        const fullMatch = match[0];
        const importedPath = match[1] || match[2];
        
        // Basic logic to simulate detection of relative imports
        if (importedPath && importedPath.startsWith('.') || importedPath.startsWith('..')) {
             results.push({
                match: fullMatch,
                source_file: "Simulated Path", // In a real tool, this would be the file path
                imported_path: importedPath,
                line_context: "Simulated Context"
            });
        }
        index++;
    }
    return results;
}

async function main() {
    if (!outputFile) {
        console.error("Error: OUTPUT_FILE environment variable is not set.");
        return;
    }
    
    // 1. Scan all specified directories
    let combinedRawText = '';
    for (const dir of scanDirs) {
        const rawText = await scanFiles(dir);
        combinedRawText += rawText + "\\n";
    }

    // 2. Audit the combined text
    const auditResults = await auditImports(combinedRawText);

    // 3. Output results
    const outputJson = JSON.stringify(auditResults, null, 2);
    await fs.promises.writeFile(outputFile, outputJson);
    console.log(`Successfully wrote audit report to ${outputFile}`);
}

main();