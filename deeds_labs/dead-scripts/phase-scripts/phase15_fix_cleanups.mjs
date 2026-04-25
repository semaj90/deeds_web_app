
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', 'src');

async function processFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    let newContent = content;

    // 1. Fix commented out cleanup functions (Svelte 5 migration artifact)
    // Pattern: // TODO: Add as cleanup in $effect: return () => {
    // We want to uncomment "return () => {" so the matching "}" is valid.
    newContent = newContent.replace(/\/\/\s*TODO: Add as cleanup in \$effect:\s*return \(\) => \{/g, 'return () => {');

    // 2. Fix double closures "}); });"
    // CAREFUL: Only if they appear right next to each other
    newContent = newContent.replace(/\}\);\s*\}\);/g, '});');

    // 3. Fix "});" followed by "}" (common when "onMount(() => {" was removed but closing remained?)
    // Actually, in evidence/hash/+page.svelte we saw:
    // });
    // });
    // This script should catch that with rule 2.

    if (newContent !== content) {
        console.log(`Fixing cleanups in: ${path.relative(ROOT_DIR, filePath)}`);
        await fs.writeFile(filePath, newContent);
        return 1;
    }
    return 0;
}

async function walk(dir) {
    let files = await fs.readdir(dir);
    let count = 0;
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.svelte-kit') {
                count += await walk(filePath);
            }
        } else if (file.endsWith('.svelte') || file.endsWith('.js') || file.endsWith('.ts')) {
            count += await processFile(filePath);
        }
    }
    return count;
}

console.log('Starting Phase 15: Fix Cleanups...');
walk(ROOT_DIR).then(count => {
    console.log(`\nFixed cleanups in ${count} files.`);
});
