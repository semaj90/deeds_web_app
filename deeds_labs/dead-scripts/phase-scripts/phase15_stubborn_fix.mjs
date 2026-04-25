
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', 'src');

const FILES_TO_FIX = [
    'src/routes/(app)/cases/[id]/+page.svelte',
    'src/routes/(app)/evidence/hash/+page.svelte',
    'src/routes/(app)/evidence/realtime/+page.svelte',
    'src/routes/(app)/persons-of-interest/+page.svelte',
    'src/routes/(app)/persons-of-interest/[id]/+page.svelte',
    'src/lib/components/canvas/HybridBoard.svelte'
];

async function processFile(filePath) {
    const fullPath = path.resolve(ROOT_DIR, '..', filePath); // Adjust relative to CWD

    try {
        const content = await fs.readFile(fullPath, 'utf-8');
        let newContent = content;

        // 1. Fix the IIFE / onMount mess
        // Turn "(async () => {" into "onMount(async () => {" ONLY if it looks like a top-level execution block not assigned to a variable
        // But be careful not to break existing correct ones.

        // Specific fix for the pattern we see:
        // (async () => { ... });(); \n });
        if (newContent.includes('(async () => {')) {
             if (!newContent.includes('onMount')) {
                  // Add import if missing (simple heuristic, might fail if strict imports)
                  newContent = newContent.replace('<script lang="ts">', '<script lang="ts">\n\timport { onMount } from "svelte";');
             }

             newContent = newContent.replace(/^\s*\(async \(\) => \{/gm, '	onMount(async () => {');
        }

        // 2. Fix the closing mess: "});();" -> "});"
        newContent = newContent.replace(/\}\);\(\);/g, '});');

        // 3. Fix double closing: "});\n });" -> "});"
        newContent = newContent.replace(/\}\);\s*\}\);/g, '});');

        // 4. Fix specific nullish coalescing error in persons-of-interest/+page.svelte
        // !selectedStatus ?? poi.status === selectedStatus -> !selectedStatus || poi.status === selectedStatus
        if (filePath.includes('persons-of-interest/+page.svelte')) {
            newContent = newContent.replace(/!selectedStatus \?\?/g, '!selectedStatus ||');
            newContent = newContent.replace(/!selectedPriority \?\?/g, '!selectedPriority ||');
        }

        // 5. Fix HybridBoard "return () => {" comment if still broken
        if (filePath.includes('HybridBoard.svelte')) {
             // Remove the todo comment if it's commenting out the return
             newContent = newContent.replace(/\/\/ TODO: Add as cleanup in \$effect: return/g, 'return');
        }

        if (newContent !== content) {
            console.log(`Fixing stubborn errors in: ${filePath}`);
            await fs.writeFile(fullPath, newContent);
        }
    } catch (e) {
        // file might not exist or path issue
        // console.error(`Skipping ${filePath}: ${e.message}`);
    }
}

console.log('Starting Phase 15: Stubborn Fixes...');
for (const file of FILES_TO_FIX) {
    await processFile(file);
}
console.log('Done.');
