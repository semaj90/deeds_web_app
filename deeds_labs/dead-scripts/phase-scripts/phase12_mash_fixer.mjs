import { execSync } from 'child_process';
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

console.log("Starting Phase 12: Mashed Line Vaccine...");
const files = walk('./src');

let processed = 0;
let fixed = 0;

files.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        let needsFix = false;

        // Detection Logic
        if (lines.length < 20) {
            // Check for massive lines
            if (lines.some(l => l.length > 300)) {
                 needsFix = true;
            }
        }

        if (needsFix) {
            console.log(`Fixing ${file}...`);

            // 1. Aggressive newline insertion to break "comment mash"
            // We read the WHOLE content as string (since it might be 1 line)
            let newContent = content;

            // Heuristic 1: Break comment at keywords if line starts with //
            if (newContent.trim().startsWith('//')) {
                const keywords = ['import ', 'export ', 'const ', 'function ', 'class ', 'type '];
                let bestIdx = -1;

                // Find the EARLIEST occurrence of a code keyword
                for (const kw of keywords) {
                     const idx = newContent.indexOf(kw);
                     if (idx > 10) { // skip start
                         if (bestIdx === -1 || idx < bestIdx) {
                             bestIdx = idx;
                         }
                     }
                }

                if (bestIdx > -1) {
                    // Split it
                    newContent = newContent.slice(0, bestIdx) + '\n' + newContent.slice(bestIdx);
                }
            }            // Heuristic 2: General detangling of mashed code (semicolons)
            // Replace `; ` with `;\n` if the file is detected as mashed
            // To be safe, only do this if line length is huge
            if (newContent.length > 300) {
                 newContent = newContent.replace(/; /g, ';\n');
                 newContent = newContent.replace(/} /g, '}\n');
                 newContent = newContent.replace(/{ /g, '{\n');
            }

            if (newContent !== content) {
                fs.writeFileSync(file, newContent);
                fixed++;
            }

            // 2. ALWAYS run Prettier on detected files
            try {
                execSync(`npx prettier --write "${file}"`, { stdio: 'ignore' });
            } catch (e) {
                console.log(`Failed to prettier ${file}`);
            }

            processed++;
        }
    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
});

console.log(`Phase 12 Complete. Processed ${processed} files. Fixed ${fixed} via heuristic (rest via Prettier).`);
