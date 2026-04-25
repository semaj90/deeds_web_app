import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', 'src');

async function findFiles(dir) {
    let results = [];
    const list = await fs.readdir(dir);
    for (const file of list) {
        const filePath = path.resolve(dir, file);
        const stat = await fs.stat(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(await findFiles(filePath));
        } else {
            if (file.endsWith('.ts') || file.endsWith('.svelte') || file.endsWith('.js')) {
                results.push(filePath);
            }
        }
    }
    return results;
}

async function cleanupImports() {
    console.log('🔍 Scanning for corrupted imports...');
    const files = await findFiles(rootDir);
    console.log(`Found ${files.length} files to check.`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const filePath of files) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            let newLines = [];
            let modified = false;

            for (const line of lines) {
                // Match import { ... } from '$env/static/private';
                const match = line.match(/^import\s+\{(.*)\}\s+from\s+'\$env\/static\/private';/);
                if (match) {
                    const imports = match[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
                    const validImports = imports.filter(i => !i.startsWith('process.env.'));

                    if (validImports.length < imports.length) {
                        modified = true;
                        if (validImports.length > 0) {
                            newLines.push(`import { ${validImports.join(', ')} } from '$env/static/private';`);
                        } else {
                            // All imports were invalid, remove the line
                            // But check if we need to keep the import for side effects? No, it's just types/values.
                        }
                    } else {
                        newLines.push(line);
                    }
                } else {
                    newLines.push(line);
                }
            }

            if (modified) {
                await fs.writeFile(filePath, newLines.join('\n'));
                fixedCount++;
                if (fixedCount % 100 === 0) process.stdout.write('.');
            }
        } catch (err) {
            console.error(`\n❌ Failed to process ${filePath}:`, err);
            errorCount++;
        }
    }

    console.log('\n\n✨ Cleanup Complete ✨');
    console.log(`✅ Fixed: ${fixedCount} files`);
    console.log(`❌ Errors: ${errorCount} files`);
}

cleanupImports().catch(console.error);
