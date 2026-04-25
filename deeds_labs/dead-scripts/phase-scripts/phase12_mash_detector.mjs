import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.svelte-kit') && !file.includes('.git')) {
                results = results.concat(walk(file));
            }
        } else {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.svelte')) {
                results.push(file);
            }
        }
    });
    return results;
}

console.log("Scanning src/ for mashed files...");
const files = walk('./src');
let count = 0;

files.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        // Strategy 1: Short files with HUGE lines
        if (lines.length < 20) {
            for (const line of lines) {
                if (line.length > 300) {
                     // Check if it looks like code mashed into a comment
                     if (line.trim().startsWith('//')) {
                         if (line.includes('import ') || line.includes('export ') || line.includes('const ') || line.includes('function ')) {
                             console.log(`[MASHED_COMMENT] ${line.length} chars: ${file}`);
                             count++;
                             break;
                         }
                     }
                     // Check if it's just mashed code without comment start (lots of semis)
                     else if ((line.match(/;/g) || []).length > 5 && (line.includes('import') || line.includes('export'))) {
                          console.log(`[MASHED_CODE] ${line.length} chars: ${file}`);
                          count++;
                          break;
                     }
                }
            }
        }
    } catch (e) {
        // ignore
    }
});

console.log(`Found ${count} potentially mashed files.`);
