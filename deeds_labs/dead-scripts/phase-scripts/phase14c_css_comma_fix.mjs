
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', 'src');

async function processFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    let newContent = content;

    // Only process .svelte files for style blocks
    if (filePath.endsWith('.svelte')) {
        newContent = newContent.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (match, styleBody) => {
            // Split into lines to be safe
            const lines = styleBody.split('\n');
            const newLines = lines.map(line => {
                // Check if line looks like a CSS property ending in comma
                // Ignore lines that are just selectors (no colon, or colon at end of pseudo)
                // Properties have colon in middle: "prop: value"
                if (line.match(/^\s*[a-zA-Z-]+\s*:/) && line.trim().endsWith(',')) {
                    return line.substring(0, line.lastIndexOf(',')) + ';';
                }
                return line;
            });
            return `<style>${newLines.join('\n')}</style>`;
        });
    }

    if (newContent !== content) {
        console.log(`Fixing CSS commas in: ${path.relative(ROOT_DIR, filePath)}`);
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
        } else if (file.endsWith('.svelte')) {
            count += await processFile(filePath);
        }
    }
    return count;
}

console.log('Starting Phase 14c: CSS Comma Cleanup...');
walk(ROOT_DIR).then(count => {
    console.log(`\nFixed CSS commas in ${count} files.`);
});
