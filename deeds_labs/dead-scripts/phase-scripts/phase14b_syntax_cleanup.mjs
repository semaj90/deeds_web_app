
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
    const isJS = ext === '.js' || ext === '.ts';

    // 1. Fix "});();" artifact -> "});"
    // This looks like a mashed "});" and "();" from an IIFE or onMount
    newContent = newContent.replace(/\}\);\(\);/g, '});');

    // 2. Fix the specific case in +page.svelte where it might be `});\n();`
    newContent = newContent.replace(/\}\);\s*\(\);/g, '});');

    // 3. CSS Orphan Fix (Removal of selectors ending in semicolon)
    // Only in Svelte style blocks or css files?
    // Actually, Svelte files mix JS and CSS. We must be careful not to delete JS code.
    // CSS rules usually look like: `.class-name:hover;`
    // JS lines look like: `variable = value;` or `functionCall();`
    // DIFFERENTIATOR: CSS selectors usually don't have `=` or `()` (except :nth-child etc).

    if (isSvelte) {
        newContent = newContent.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (match, styleBody) => {
            // Remove lines that are just a selector ending in semicolon
            // e.g. "  .scope-btn:hover;\n"
            // Regex: Start of line, whitespace, selector chars (no spaces usually in simple selectors, but descedants have spaces), semicolon, end of line.
            // Avoid deleting property lines like "color: red;" -> contain colon inside.
            // But selectors like ":hover" also have colons.
            // Key difference: Property lines are "prop: value;". Selectors are ".selector:pseudo;" or ".class;"
            // Properties almost always have a space after colon, pseudos don't.
            // heuristic: Remove lines with ".", "#" start, ending in ";" and NOT containing ": " (colon space).

            return `<style>${styleBody.replace(/^\s*[.#][^{};]+\s*;\s*$/gm, '')}</style>`;
        });
    }

    // 4. Fix specific broken imports or variables from error log
    // "Cannot find name 'errorStats'" -> often implies script block didn't parse.
    // We hope step 1 fixes the parsing.

    if (newContent !== content) {
        console.log(`Fixing syntax in: ${path.relative(ROOT_DIR, filePath)}`);
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

console.log('Starting Phase 14b: Syntax Cleanup...');
walk(ROOT_DIR).then(count => {
    console.log(`\nFixed syntax in ${count} files.`);
});
