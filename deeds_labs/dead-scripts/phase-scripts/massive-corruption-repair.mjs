import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', 'src');

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // 1. Fix types in $props: prop?, type; -> prop?: type;
    const propTypeRegex = /(\w+)\?, \s*\(/g;
    if (propTypeRegex.test(content)) {
        content = content.replace(propTypeRegex, '$1?: (');
        changed = true;
    }

    // 2. Fix simple type colons: prop?, string -> prop?: string
    const simpleTypeRegex = /(\w+)\?, \s*(string|number|boolean|any|unknown|void|Case|User|Evidence)/g;
    if (simpleTypeRegex.test(content)) {
        content = content.replace(simpleTypeRegex, '$1?: $2');
        changed = true;
    }

    // 3. Fix ternary operators: condition ? true , false -> condition ? true : false
    // This is tricky to avoid replacing commas in objects, but we'll target common patterns
    const ternaryRegex = /(\? [^,]+) , ([^;}]+)/g;
    if (ternaryRegex.test(content)) {
        content = content.replace(ternaryRegex, '$1 : $2');
        changed = true;
    }

    // 4. Fix $props syntax: const __props = $props(); -> let props = $props();
    if (content.includes('const __props = $props();')) {
        content = content.replace('const __props = $props();', 'let props = $props();');
        changed = true;
    }

    // 5. Fix stray quotes/brackets: }' -> }
    if (content.includes("}'")) {
        content = content.replace(/\}'/g, '}');
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[FIXED] ${filePath}`);
    }
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.svelte') || fullPath.endsWith('.ts')) {
            fixFile(fullPath);
        }
    }
}

console.log('Starting massive corruption repair...');
walk(rootDir);
console.log('Repair complete.');
