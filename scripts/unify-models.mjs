import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve('.');

const searchReplace = [
    { from: /gemma4-rotorquant:latest/g, to: 'gemma4-rotorquant:latest' },
    { from: /gemma4-rotorquant:latest/g, to: 'gemma4-rotorquant:latest' },
    { from: /gemma4-rotorquant:latest/g, to: 'gemma4-rotorquant:latest' },
    { from: /gemma4-rotorquant:latest/g, to: 'gemma4-rotorquant:latest' },
    { from: /gemma4-rotorquant:latest/g, to: 'gemma4-rotorquant:latest' },
    { from: /gemma4-rotorquant:latest/g, to: 'gemma4-rotorquant:latest' }
];

function processDirectory(dir) {
    if (dir.includes('node_modules') || dir.includes('.git') || dir.includes('.svelte-kit')) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
            processDirectory(fullPath);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (['.ts', '.js', '.mjs', '.env', '.json', '.md'].includes(ext)) {
                let content = fs.readFileSync(fullPath, 'utf8');
                let modified = false;

                for (const rule of searchReplace) {
                    if (rule.from.test(content)) {
                        content = content.replace(rule.from, rule.to);
                        modified = true;
                    }
                }

                if (modified) {
                    // special cleanup for cases where replacing 'gemma4-rotorquant:latest' resulted in 'gemma4-rotorquant:latest'
                    content = content.replace(/gemma4-rotorquant:latest/g, 'gemma4-rotorquant:latest');
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log(`Updated ${fullPath}`);
                }
            }
        }
    }
}

processDirectory(ROOT_DIR);
console.log('Unification complete!');
