
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', 'src');

async function processFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    let newContent = content;

    const ext = path.extname(filePath);
    const isSvelte = ext === '.svelte';
    const isTS = ext === '.ts' || ext === '.js';

    // 1. Universal Fix: Remove double punctuation ";," or ",;"
    newContent = newContent.replace(/;,\s*/g, '; \n');
    newContent = newContent.replace(/,;\s*/g, '; \n');

    // 2. Fix CSS Comma-itis (Naive approach for Svelte style blocks and CSS files)
    if (isSvelte) {
        newContent = newContent.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (match, styleBody) => {
            // Inside style block: replace "," at end of lines with ";"
            // Be careful not to break selectors like "h1, h2"
            // Heuristic: if line looks like "prop: value,", it's a rule.
            let newStyle = styleBody.replace(/([a-zA-Z-]+:\s*[^;,}]+),\s*$/gm, '$1;\n');

            // Fix inline mashed CSS: "display: flex, color: red" -> "display: flex; color: red"
            // This is harder. Look for "prop: val," followed by "prop: val"
            newStyle = newStyle.replace(/([a-zA-Z-]+:\s*[^;,}]+),\s+([a-zA-Z-]+:)/g, '$1; $2');

            // Fix "prop: val;, " double punctuation inside CSS
            newStyle = newStyle.replace(/;,\s*/g, '; ');

            return `<style>${newStyle}</style>`;
        });
    }

    // 3. Fix TS Interface Comma-itis
    // Heuristic: Inside "interface X { ... }", properties should end with ";" not ","
    if (isTS || isSvelte) {
        // Find interface blocks. This is a simple regex and might miss nested structures or complex cases.
        // It looks for "interface Name { ... }" non-nested.
        // LIMITATION: Only works for simple flat interfaces for now to avoid breaking code.
        newContent = newContent.replace(/(interface\s+\w+\s*\{)([^}]+)(\})/g, (match, start, body, end) => {
            // Inside the body, replace "," with ";" at end of lines or before newlines
            // But NOT inside nested objects/functions if possible.
            // Let's being conservative: valid interface props look like "name: type," or "name?: type,"
            // We replace the trailing comma with semicolon.

            let newBody = body.replace(/([a-zA-Z0-9_?]+:\s*[^,;{\n]+),\s*$/gm, '$1;\n');

            // Also handle mashed lines: "prop: type, prop2: type"
            newBody = newBody.replace(/([a-zA-Z0-9_?]+:\s*[^,;{}]+),\s+([a-zA-Z0-9_?]+:)/g, '$1; $2');

            return `${start}${newBody}${end}`;
        });
    }

    if (newContent !== content) {
        console.log(`Fixing punctuation in: ${path.relative(ROOT_DIR, filePath)}`);
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
        } else if (file.endsWith('.svelte') || file.endsWith('.ts') || file.endsWith('.js')) {
            count += await processFile(filePath);
        }
    }
    return count;
}

console.log('Starting Phase 14: Punctuation Cleanup...');
walk(ROOT_DIR).then(count => {
    console.log(`\nFixed punctuation in ${count} files.`);
});
