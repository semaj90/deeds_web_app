
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

async function cleanFiles() {
    console.log('Scanning for corrupted .ts files...');
    const allFiles = await getFiles(path.join(ROOT_DIR, 'src'));
    const tsFiles = allFiles.filter(f => f.endsWith('.ts') && !f.endsWith('.svelte.ts'));

    let count = 0;
    for (const file of tsFiles) {
        try {
            const content = await fs.readFile(file, 'utf-8');
            // Check for the specific corruption pattern
            // Start with <script, contains // Generated Runes in the script block

            const match = content.match(/^(<script[^>]*>[\s\S]*?\/\/ Generated Runes[\s\S]*?<\/script>)\s*/);

            if (match) {
                console.log(`Cleaning ${path.basename(file)}`);
                // Remove the script block entirely
                const cleaned = content.replace(match[0], '');
                await fs.writeFile(file, cleaned);
                count++;
            }
        } catch (e) {
            console.error(`Error cleaning ${file}: ${e.message}`);
        }
    }
    console.log(`Cleaned ${count} files.`);
}

cleanFiles();
