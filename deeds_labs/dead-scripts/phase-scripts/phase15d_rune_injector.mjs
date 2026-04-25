
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..'); // Root of repo

const TYPE_HEURISTICS = {
    'intervalId': 'any', // NodeJS.Timeout or number
    'timeoutId': 'any',
    'unsubscribe': '() => void',
    'mounted': 'boolean = false',
    'loading': 'boolean = false',
    'isLoading': 'boolean = false',
    'error': 'string | null = null',
    'data': 'any = null',
    'nodes': 'any[] = []',
    'edges': 'any[] = []',
    'selected': 'Set<string> = new Set()',
    'canvas': 'HTMLCanvasElement | undefined = undefined',
    'canvasEl': 'HTMLCanvasElement | undefined = undefined',
    'rootEl': 'HTMLElement | undefined = undefined',
    'container': 'HTMLElement | undefined = undefined',
    'isOpen': 'boolean = false',
    'showModal': 'boolean = false',
    'visible': 'boolean = true',
    'active': 'boolean = false',
    'value': 'string = ""',
    'files': 'FileList | null = null',
    'dispatch': 'typeof createEventDispatcher', // Need dispatch import
    'viewMode': "string = 'list'",
    'page': 'typeof import("$app/state").page',
    'onMount': 'import',
    'onDestroy': 'import',
    'beforeUpdate': 'import',
    'afterUpdate': 'import',
    'tick': 'import',
    'createEventDispatcher': 'import',
    'fade': 'import',
    'fly': 'import',
    'slide': 'import',
    'scale': 'import',
    'enhance': 'import', // $app/forms
    'applyAction': 'import',
    'goto': 'import', // $app/navigation
    'invalidate': 'import',
    'invalidateAll': 'import'
};

const IMPORTS = {
    'onMount': 'import { onMount } from "svelte";',
    'onDestroy': 'import { onDestroy } from "svelte";',
    'beforeUpdate': 'import { beforeUpdate } from "svelte";',
    'afterUpdate': 'import { afterUpdate } from "svelte";',
    'tick': 'import { tick } from "svelte";',
    'createEventDispatcher': 'import { createEventDispatcher } from "svelte";',
    'fade': 'import { fade } from "svelte/transition";',
    'fly': 'import { fly } from "svelte/transition";',
    'slide': 'import { slide } from "svelte/transition";',
    'scale': 'import { scale } from "svelte/transition";',
    'enhance': 'import { enhance, applyAction } from "$app/forms";',
    'applyAction': 'import { applyAction } from "$app/forms";',
    'goto': 'import { goto, invalidate, invalidateAll } from "$app/navigation";',
    'invalidate': 'import { invalidate } from "$app/navigation";',
    'invalidateAll': 'import { invalidateAll } from "$app/navigation";',
    'page': 'import { page } from "$app/state";'
};

async function parseErrors() {
    const errorLog = await fs.readFile(path.join(ROOT_DIR, 'errors.log'), 'utf-8');
    const lines = errorLog.split('\n');

    const fileErrors = {};
    let currentFile = null;

// eslint-disable-next-line no-control-regex
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");

    for (let i = 0; i < lines.length; i++) {
        const line = stripAnsi(lines[i]);

        // Match filename line: c:\path\to\file.svelte:row:col
        // Windows path start
        const fileMatch = line.match(/^([a-zA-Z]:\\.*?\.(svelte|ts|js)):/);
        if (fileMatch) {
            currentFile = fileMatch[1];
        }

        if (currentFile && line.includes("Cannot find name")) {
            const match = line.match(/Cannot find name '([^']+)'/);
            if (match) {
                const varName = match[1];
                if (!fileErrors[currentFile]) fileErrors[currentFile] = new Set();
                fileErrors[currentFile].add(varName);
            }
        }
    }
    return fileErrors;
}

async function injectRunes(filePath, missingVars) {
    let content = await fs.readFile(filePath, 'utf-8');
    let injectedVars = [];
    let injectedImports = [];

    // Check existing script tag
    let scriptMatch = content.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
    let scriptContent = '';
    let scriptAttributes = '';

    if (scriptMatch) {
        scriptAttributes = scriptMatch[1];
        scriptContent = scriptMatch[2];
    } else {
        // Create script tag if missing
        scriptAttributes = ' lang="ts"';
        content = `<script lang="ts">\n</script>\n` + content;
        scriptMatch = content.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
        scriptContent = scriptMatch[2];
    }

    const importsToAdd = new Set();
    const varsToAdd = [];

    for (const varName of missingVars) {
        // Skip if already in content (false positive from previous run or similar name)
        // Actually, simple text check might fail if it's used providing the error, but not defined.
        // We trust svelte-check.

        if (TYPE_HEURISTICS[varName] === 'import') {
            if (IMPORTS[varName]) {
                const importStmt = IMPORTS[varName];
                // Check if already imported
                // e.g. "import { onMount } from"
                const cleanImport = importStmt.replace(/import \{ (.*?) \} from.*/, '$1');
                // Checks broadly. Svelte 5 imports are specific.
                if (!scriptContent.includes(cleanImport.split(',')[0].trim())) {
                     importsToAdd.add(importStmt);
                }
            }
        } else {
            // It's a variable state
            const type = TYPE_HEURISTICS[varName] || 'any = $state(undefined)';
            let declaration;

            if (type.includes('$state') || type.includes('=')) {
                // If heuristic has a value assignment
                if (type.includes('=')) {
                     // e.g. "boolean = false"
                     // We want: let varName: boolean = $state(false);
                     const parts = type.split('=');
                     const typeName = parts[0].trim();
                     const defaultVal = parts[1].trim();

                     if (typeName === 'any') {
                         declaration = `let ${varName} = $state(${defaultVal});`;
                     } else {
                         declaration = `let ${varName}: ${typeName} = $state(${defaultVal});`;
                     }
                } else {
                     declaration = `let ${varName}: ${type};`;
                }
            } else {
                 // Default fallback
                 declaration = `let ${varName} = $state<any>(null);`;
            }

            // Check if variable name exists in script to avoid dupe (regex with word boundary)
            const regex = new RegExp(`\\b${varName}\\b`);
            if (!regex.test(scriptContent)) {
                varsToAdd.push(declaration);
            }
        }
    }

    if (importsToAdd.size === 0 && varsToAdd.length === 0) return 0;

    // Construct new block
    const newImports = Array.from(importsToAdd).join('\n\t') + '\n';
    const newVars = varsToAdd.join('\n\t') + '\n';

    // Inject at top of script
    const newScriptContent = `\n\t// Generated Runes\n\t${newImports}\t${newVars}\n` + scriptContent;

    const newContent = content.replace(/<script[^>]*>[\s\S]*?<\/script>/, `<script${scriptAttributes}>${newScriptContent}</script>`);

    await fs.writeFile(filePath, newContent);
    return varsToAdd.length + importsToAdd.size;
}

async function main() {
    console.log('Analyzing errors.log...');
    const fileErrors = await parseErrors();
    const totalFiles = Object.keys(fileErrors).length;
    console.log(`Found ${totalFiles} files with missing variables.`);

    let count = 0;
    for (const [file, vars] of Object.entries(fileErrors)) {
        try {
            // Trim leading whitespace from path? The regex captured full path.
            if (fs.stat(file)) {
                 const injected = await injectRunes(file, vars);
                 if (injected > 0) {
                     console.log(`Injected ${injected} runes into ${path.basename(file)}`);
                     count++;
                 }
            }
        } catch (e) {
            console.error(`Error processing ${file}: ${e.message}`);
        }
    }
    console.log(`Finished injecting runes in ${count} files.`);
}

main();
