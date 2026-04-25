import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

function cleanTsConfig(file) {
    const content = fs.readFileSync(file, 'utf8');
    // Using a regex or a simple permissive parse because tsconfig can have comments
    // Actually, stripping comments:
    const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const json = JSON.parse(noComments);
    
    if (!json.exclude) return;
    
    console.log(`\n=== Analyzing ${file} ===`);
    const initialCount = json.exclude.length;
    
    const validExcludes = json.exclude.filter(pattern => {
        // Special patterns we want to keep regardless
        if (pattern.includes('node_modules') || 
            pattern.includes('.svelte-kit') || 
            pattern.includes('build') ||
            pattern.includes('**/*.test') ||
            pattern.includes('**/*.*bak*') ||
            pattern.includes('.svelte-check-tmp') ||
            pattern.startsWith('**/*') ||
            pattern.startsWith('src/**/*')) {
            return true;
        }

        // Try to resolve the glob pattern against the src/ or root
        const matches = globSync(pattern);
        
        // If it's a directory pattern that just hasn't matched any files yet, 
        // check if the parent dir exists.
        const cleanPath = pattern.replace(/\/\*\*$/, '').replace(/\/\*\*\/\*$/, '');
        const exists = fs.existsSync(cleanPath) || matches.length > 0;
        
        if (!exists) {
            console.log(`DEAD PATH: ${pattern}`);
        }
        return exists;
    });

    console.log(`Pruning reduced excludes from ${initialCount} -> ${validExcludes.length}`);
}

cleanTsConfig('tsconfig.json');
cleanTsConfig('tsconfig.check.json');
