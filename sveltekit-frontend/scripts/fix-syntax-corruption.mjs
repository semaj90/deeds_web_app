import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', 'src');

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.svelte') || file.endsWith('.ts') || file.endsWith('.js')) {
                arrayOfFiles.push(path.join(dirPath, "/"+file));
            }
        }
    });

    return arrayOfFiles;
}

function fixSyntaxCorruption(content) {
    let modified = false;
    let newContent = content;
    const fixes = [];

    // Pattern 1: Trailing comma after semicolon (Common in CSS and JS corruption)
    // Example: "margin: 0px;,", "const x = 1;,"
    const trailingCommaRegex = /;,/g;
    if (trailingCommaRegex.test(newContent)) {
        newContent = newContent.replace(trailingCommaRegex, ';');
        modified = true;
        fixes.push('Removed trailing comma after semicolon');
    }

    // Pattern 2: "import { X, as Y }" corruption
    // Example: import { onMount, as _onMount } from 'svelte';
    const importAsRegex = /import\s*{[^}]*?(\w+)\s*,\s*as\s+(\w+)[^}]*?}/g;
    // We need to be careful with global replacement here.
    // Let's do a specific replace for the ", as" pattern within imports.
    // Actually, simpler: just replace ", as " with " as " GLOBALLY might be unsafe.
    // But specific to this corruption:
    const specificImportAs = /,\s*as\s+/g;
    if (specificImportAs.test(newContent)) {
        // Verify it is likely an import
        if (newContent.includes('import {')) {
             newContent = newContent.replace(specificImportAs, ' as ');
             modified = true;
             fixes.push('Fixed "import { X, as Y }" pattern');
        }
    }

    // Pattern 3: CSS Double termination ";;"
    const doubleSemiRegex = /;;/g;
    if (doubleSemiRegex.test(newContent)) {
        newContent = newContent.replace(doubleSemiRegex, ';');
        modified = true;
        fixes.push('Removed double semicolons');
    }

    return { modified, newContent, fixes };
}

async function main() {
    const files = getAllFiles(ROOT_DIR);
    let totalFixed = 0;
    let totalFixes = 0;

    console.log(`🔍 Scanning ${files.length} files for syntax corruption...`);

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            const { modified, newContent, fixes } = fixSyntaxCorruption(content);

            if (modified) {
                fs.writeFileSync(file, newContent, 'utf-8');
                console.log(`✓ ${path.relative(ROOT_DIR, file)} (${fixes.join(', ')})`);
                totalFixed++;
                totalFixes += fixes.length;
            }
        } catch (err) {
            console.error(`Error processing ${file}: ${err.message}`);
        }
    }

    console.log('\n==========================================');
    console.log(`Total files fixed: ${totalFixed}`);
    console.log(`Total patterns fixed: ${totalFixes}`);
    console.log('==========================================');
}

main();
