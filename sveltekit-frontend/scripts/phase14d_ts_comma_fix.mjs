
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function getFiles(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
            if (dirent.name === 'node_modules' || dirent.name === '.svelte-kit' || dirent.name === 'build') return [];
            return getFiles(res);
        } else {
            return res;
        }
    }));
    return files.flat();
}

async function fixCommas() {
    console.log('Scanning for comma corruption (;,)...');
    const allFiles = await getFiles(path.join(ROOT_DIR, 'src'));
    const targetFiles = allFiles.filter(f => f.endsWith('.ts') || f.endsWith('.svelte'));

    let count = 0;
    for (const file of targetFiles) {
        try {
            const content = await fs.readFile(file, 'utf-8');

            // Pattern 1: `;,` -> `;`
            // Pattern 2: `;;` -> `;` (Double semicolons)

            if (content.match(/;,/g) || content.match(/;;/g)) {
                let newContent = content.replace(/;,/g, ';');
                newContent = newContent.replace(/;;/g, ';');

                if (newContent !== content) {
                    console.log(`Fixing commas in ${path.basename(file)}`);
                    await fs.writeFile(file, newContent);
                    count++;
                }
            }
        } catch (e) {
            console.error(`Error processing ${file}: ${e.message}`);
        }
    }
    console.log(`Fixed ${count} files.`);
}

fixCommas();
