import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', 'src', 'lib', 'components');

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.svelte')) {
                arrayOfFiles.push(path.join(dirPath, "/"+file));
            }
        }
    });

    return arrayOfFiles;
}

function processFile(content) {
    // Regex to find export let
    // Group 1: Name
    // Group 2: Type (optional, includes colon)
    // Group 3: Default (optional, includes equals)
    const exportLetRegex = /^\s*export\s+let\s+([a-zA-Z0-9_$]+)(?:\s*(:\s*[^=;\n]+))?(?:\s*(=\s*[^;\n]+))?\s*;?$/gm;

    const props = [];
    let match;

    // We need to run regex on the content, but we want to strip them out.
    // So we'll accumulate patches.

    let newContent = content;
    let hasProps = false;

    // Iterate matches
    // Note: exec() on global regex is stateful
    while ((match = exportLetRegex.exec(content)) !== null) {
        hasProps = true;
        const fullMatch = match[0];
        const name = match[1];
        const typePart = match[2] ? match[2].replace(/^:\s*/, '').trim() : null; // "string"
        const defaultPart = match[3] ? match[3].replace(/^=\s*/, '').trim() : null; // "123"

        props.push({ name, type: typePart, defaultVal: defaultPart, fullMatch });
    }

    if (!hasProps) {
        return { modified: false, content };
    }

    // Check if $props already exists
    if (content.includes('$props()')) {
        // Already migrated or mixed. Skip to be safe.
        // Or maybe just remove duplicate export lets?
        // Let's safe-skip for now.
        return { modified: false, content };
    }

    // Construct $props rune
    // let { name, other = def }: { name: type, other?: type } = $props();

    let destructureParts = [];
    let typeParts = [];

    props.forEach(p => {
        // Destructuring
        if (p.defaultVal) {
            destructureParts.push(`${p.name} = ${p.defaultVal}`);
        } else {
            destructureParts.push(p.name);
        }

        // Type definition
        if (p.type) {
             const isOptional = !!p.defaultVal; // logical guess
             typeParts.push(`${p.name}${isOptional ? '?' : ''}: ${p.type}`);
        } else {
            // No type explicit
            if (p.defaultVal) {
                 // Inferred? TS usually handles checking via destructuring defaults.
                 // But for the Type annotation block:
                 // We can omit it if TS infers, but typically we want: { name?: any }
                 // Let's just create an implicit type mapping if we can't determine.
                 // Actually, simpler: don't add type annotation block if types are missing,
                 // just let { x: type = val } = $props(); valid syntax?
                 // No, $props() is generic <Props>().
            }
            typeParts.push(`${p.name}?: any`); // Fallback
        }
    });

    // Check if we captured valid types or if it's JS
    const isTs = content.includes('lang="ts"');

    let propsLine = '';
    if (isTs) {
        // let { a, b = 1 }: { a: string, b?: number } = $props();
        propsLine = `\tlet { ${destructureParts.join(', ')} }: { ${typeParts.join('; ')} } = $props();`;
    } else {
        // let { a, b = 1 } = $props();
        propsLine = `\tlet { ${destructureParts.join(', ')} } = $props();`;
    }

    // Replace old exports with empty string (or comment?)
    // Using string replacement on the matches found.
    props.forEach(p => {
        newContent = newContent.replace(p.fullMatch, '');
    });

    // Insert new propsLine after <script>
    // Find script open tag
    const scriptRegex = /<script[^>]*>/;
    const scriptMatch = newContent.match(scriptRegex);

    if (scriptMatch) {
         const insertIndex = scriptMatch.index + scriptMatch[0].length;
         newContent = newContent.slice(0, insertIndex) + '\n' + propsLine + newContent.slice(insertIndex);
    } else {
        // No script tag?
        return { modified: false, content };
    }

    return { modified: true, content: newContent, count: props.length };
}

async function main() {
    const files = getAllFiles(ROOT_DIR);
    let totalFiles = 0;

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            const { modified, content: newContent, count } = processFile(content);

            if (modified) {
                fs.writeFileSync(file, newContent, 'utf-8');
                console.log(`✓ ${path.relative(ROOT_DIR, file)} (Migrated ${count} props)`);
                totalFiles++;
            }
        } catch (e) {
             console.error(`Error ${file}:`, e.message);
        }
    }
    console.log(`Migrated props in ${totalFiles} components.`);
}

main();
