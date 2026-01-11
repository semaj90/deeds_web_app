
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

async function fixFormData() {
    console.log('Searching for corrupted formData.get() patterns...');
    const srcDir = path.resolve('src');
    const files = getAllFiles(srcDir);
    let fixedCount = 0;

    for (const fullPath of files) {
        let content = fs.readFileSync(fullPath, 'utf-8');
        let modified = false;

        // Pattern 1: formData.get('key', prop:
        // Fix: formData.get('key'), prop:
        content = content.replace(/formData\.get\('([^']+)',\s*([a-zA-Z0-9_]+):/g, (match, key, nextProp) => {
            modified = true;
            return `formData.get('${key}'), \n${nextProp}:`;
        });

        // Pattern 2: formData.get('key', nextProp:
        // Similar but maybe without spaces
        content = content.replace(/formData\.get\('([^']+)',([a-zA-Z0-9_]+):/g, (match, key, nextProp) => {
            modified = true;
            return `formData.get('${key}'), \n${nextProp}:`;
        });

        // Pattern 3: formData.get('key') as string; const
        // Sometimes semicolons were replaced by colons?
        // We saw "import type { A: B }" - fixed.

        // Pattern 4: error.message: stack.stack
        // Fix: error.message, stack:
        content = content.replace(/error\.message:\s*stack:/g, "error.message, stack:");

        if (modified) {
            console.log(`Fixing ${path.relative(process.cwd(), fullPath)}`);
            fs.writeFileSync(fullPath, content, 'utf-8');
            fixedCount++;
        }
    }

    console.log(`\nFixed formData corruption in ${fixedCount} files.`);
}

fixFormData().catch(console.error);
