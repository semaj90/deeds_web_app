
import fs from 'fs';
import path from 'path';

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            if (file !== 'node_modules' && file !== '.svelte-kit' && file !== '.git') {
                arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
            }
        } else {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.svelte')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });

    return arrayOfFiles;
}

async function fixTypeImports() {
    console.log('Searching for corrupt type imports...');
    const srcDir = path.resolve('src');
    const files = getAllFiles(srcDir);
    let fixedCount = 0;

    for (const fullPath of files) {
        let content = fs.readFileSync(fullPath, 'utf-8');
        let modified = false;

        // Pattern: import type { A: B } from ...
        // We look for "import type {" followed by content with a colon, then "}"
        // This regex matches the whole import line roughly
        const regex = /import type\s*\{([^}]+)\}\s*from/g;

        content = content.replace(regex, (match, inner) => {
            // Check if the inner content has the corrupt colon pattern like "Actions: PageServerLoad"
            // But exclude things that might be valid object types if TS allows it in imports (unlikely for "import type { A: B }")
            // The corruption we saw was explicit "Name: Alias" style.
            if (inner.includes(':')) {
                // Replace colons with commas in the import list
                const fixedInner = inner.replace(/:/g, ',');
                if (fixedInner !== inner) {
                    const relPath = path.relative(process.cwd(), fullPath);
                    console.log(`Fixing ${relPath}`);
                    modified = true;
                    return `import type {${fixedInner}} from`;
                }
            }
            return match;
        });

        if (modified) {
            fs.writeFileSync(fullPath, content, 'utf-8');
            fixedCount++;
        }
    }

    console.log(`\nFixed imports in ${fixedCount} files.`);
}

fixTypeImports().catch(console.error);
