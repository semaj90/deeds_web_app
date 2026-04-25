import fs from 'fs';
import { globSync } from 'glob';

// Find all server-side TS files that might be making Ollama fetch calls
const files = globSync('src/**/*.{ts,js,svelte}');

let replacedCount = 0;

for (const file of files) {
    if (file.includes('scripts/') || file.includes('src/lib/server/ollama.ts') || file.includes('src/lib/server/embeddings/ollama.ts')) continue;
    
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    
    // Pattern to match common Ollama fetch calls, e.g.:
    // await fetch(`${ENV.OLLAMA_BASE_URL}/api...
    // fetch(`${OLLAMA_URL}/api...
    // fetch(OLLAMA_URL + '/api...
    const fetchRegex = /fetch\s*\(\s*(`\$\{ENV\.OLLAMA_BASE_URL\}|`\$\{OLLAMA_URL\}|`\$\{process\.env\.OLLAMA_URL\}|`\$\{OLLAMA_URL_VAR\}|OLLAMA_URL|\$\{OLLAMA_BASE_URL\})/g;
    
    if (fetchRegex.test(content)) {
        // Replace 'fetch(' with 'ollamaFetch('
        content = content.replace(fetchRegex, 'ollamaFetch($1');
        
        // Ensure ollamaFetch is imported if we just added it
        if (!content.includes('import { ollamaFetch }') && !content.includes('import {ollamaFetch}')) {
            // Find a good spot for the import: right after the last import, or top of file
            const importStatement = "import { ollamaFetch } from '$lib/server/ollama.js';\n";
            const lastImportIndex = content.lastIndexOf('import ');
            
            if (lastImportIndex !== -1) {
                const endOfLastImport = content.indexOf('\n', lastImportIndex);
                content = content.slice(0, endOfLastImport + 1) + importStatement + content.slice(endOfLastImport + 1);
            } else {
                content = importStatement + content;
            }
        }
        
        if (content !== originalContent) {
            fs.writeFileSync(file, content);
            console.log(`Migrated consumers in ${file}`);
            replacedCount++;
        }
    }
}

console.log(`Migration complete. Updated ${replacedCount} files to use ollamaFetch.`);
