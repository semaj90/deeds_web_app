import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', 'src');

// Patterns to apply
const PATTERNS = [
    // Pattern 1: Double question mark in optional property -> single question mark
    { regex: /(\w+)\?\?/g, replace: '$1?:' },

    // Pattern 2: Colon instead of comma in generics: <Type: OtherType> -> <Type, OtherType>
    { regex: /<([^<>]+):\s*([^<>]+)>/g, replace: '<$1, $2>' },

    // Pattern 3: Orphaned union members on new lines starting with |
    // This is tricky - skip for now

    // Pattern 4: Double pipe operator || -> | (in type unions, not boolean)
    // This is context-sensitive, skip

    // Pattern 5: Missing semicolon before next property (someType property:)
    // { regex: /(\w+)\s+(\w+):/g, replace: '$1; $2:' } // Too aggressive
];

function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!file.startsWith('.') && file !== 'node_modules') {
                getAllFiles(fullPath, arrayOfFiles);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.svelte')) {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;
    const fixes = [];

    for (const pattern of PATTERNS) {
        if (pattern.regex.test(content)) {
            content = content.replace(pattern.regex, pattern.replace);
            modified = true;
            fixes.push(pattern.regex.source.slice(0, 30));
        }
        // Reset regex lastIndex
        pattern.regex.lastIndex = 0;
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✓ ${path.relative(ROOT_DIR, filePath)} (${fixes.join(', ')})`);
        return 1;
    }
    return 0;
}

async function main() {
    console.log('🔧 Phase 68: Syntax Pattern Fixer');
    console.log(`📂 Scanning: ${ROOT_DIR}`);

    const files = getAllFiles(ROOT_DIR);
    console.log(`Found ${files.length} files to check.`);

    let totalFixed = 0;
    for (const file of files) {
        try {
            totalFixed += processFile(file);
        } catch (e) {
            console.error(`Error processing ${file}: ${e.message}`);
        }
    }

    console.log(`\nTotal files fixed: ${totalFixed}`);
}

main();
