import fs from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.{svelte,ts}');

// Pattern 1: form.get('key', nextKey: form.get(...)
// Should be: form.get('key'), nextKey: form.get(...)
const formGetRegex = /form\.get\('([^']+)',\s+([a-zA-Z0-9_]+):\s+form\.get\(/g;

// Pattern 2: toISOString(, nextKey: ...
const toISOStringRegex = /toISOString\(\s*,\s+([a-zA-Z0-9_]+):/g;

// Pattern 3: .join('\n', nextKey: ...
const joinRegex = /\.join\('(\\n|[^']+)',\s+([a-zA-Z0-9_]+):/g;

// Pattern 4: $store: nextKey
const storeMergeRegex = /: \$([a-zA-Z0-9_]+):\s+([a-zA-Z0-9_]+)(?=\s*:|,|\s*})/g;

// Pattern 5: value: value: value
const triplePropRegex = /([a-zA-Z0-9_]+):\s+\1:\s+\1/g;

// Pattern 6: value: value
const doublePropRegex = /([a-zA-Z0-9_]+):\s+\1(?=\s*:|,|\s*})/g;

function fixCorruptions(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let original = content;

    // Fix form.get
    let lastContent;
    do {
        lastContent = content;
        content = content.replace(formGetRegex, "form.get('$1'), $2: form.get(");
    } while (content !== lastContent);

    content = content.replace(toISOStringRegex, "toISOString(), $1:");
    content = content.replace(joinRegex, ".join('$1'), $2:");
    content = content.replace(storeMergeRegex, ", $1: $$1, $2:");
    content = content.replace(triplePropRegex, "$1");
    content = content.replace(doublePropRegex, "$1");

    // Fix remaining : $store :
    content = content.replace(/: \$([a-zA-Z0-9_]+)\s*:\s*/g, ": $$1, ");

    if (content !== original) {
        console.log('Fixed ' + filePath);
        fs.writeFileSync(filePath, content);
    }
}

console.log('Fixing property-merge corruptions...');
files.forEach(fixCorruptions);
console.log('✅ Done.');
