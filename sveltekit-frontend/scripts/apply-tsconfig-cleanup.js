import fs from 'fs';
import path from 'path';

function cleanTsconfig(file) {
    const content = fs.readFileSync(file, 'utf8');
    // Simple robust strip comments (handles single line // and multi line /* */)
    const jsonStr = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?:^|\s)\/\/.*$/gm, '');
    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch(e) {
        console.error(`Failed to parse ${file}:`, e);
        return;
    }

    if (!parsed.exclude) return;

    const originalLength = parsed.exclude.length;

    parsed.exclude = parsed.exclude.filter(pattern => {
        // Keep standard infra excludes
        if (pattern.includes('node_modules') || 
            pattern.includes('.svelte-kit') || 
            pattern.includes('build') ||
            pattern.includes('.svelte-check-tmp') ||
            pattern.includes('.rag-metrics') ||
            pattern.includes('dist')) {
            return true;
        }

        // Keep explicit file exclusions and backup patterns so svelte-check doesn't hit them
        if (pattern.includes('*') && !pattern.endsWith('/**')) {
            return true;
        }

        // For direct directory exclusions like "src/lib/services/error-analysis/**"
        // Let's check if the directory actually exists.
        let dirPath = pattern.replace(/\/\*\*$/, '');
        if (dirPath.startsWith('src/')) {
            const absoluteDir = path.resolve(process.cwd(), dirPath);
            return fs.existsSync(absoluteDir);
        }

        return true; // Keep anything else we aren't sure about
    });

    console.log(`Cleaned ${file}: removed ${originalLength - parsed.exclude.length} dead paths.`);
    
    // Unfortunately writing back with JSON.stringify strips all comments that were in the original.
    // For a tsconfig, that's totally fine and normal.
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
}

cleanTsconfig('tsconfig.json');
cleanTsconfig('tsconfig.check.json');
