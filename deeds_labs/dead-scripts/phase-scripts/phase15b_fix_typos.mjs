
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', 'src');

async function processFile(filePath) {
    const fullPath = path.resolve(ROOT_DIR, '..', filePath);
    try {
        const content = await fs.readFile(fullPath, 'utf-8');
        let newContent = content;

        // Fix colliding search/replace artifacts
        newContent = newContent.replace(/\$effectonMount/g, 'onMount');
        newContent = newContent.replace(/onMountonMount/g, 'onMount'); // Just in case

        // Fix stubborn "});" artifacts from previous script
        // We might have "});" followed by "}" or "});" followed by "});"
        // Let's look for "});" followed by whitespace then "}" or another "});" at the end of script

        // This is tricky. safest is to look at context.
        // If we see:
        // });
        // }
        // </script>
        // It likely means "}" is extra.

        newContent = newContent.replace(/\}\);\s*\}\s*<\/script>/g, '});\n</script>');
        newContent = newContent.replace(/\}\);\s*\}\);\s*<\/script>/g, '});\n</script>');

        // Also fix the person-of-interest specific nullish error I missed?
        // !selectedStatus ?? poi.status -> (!selectedStatus) || poi.status
        // My previous script targeted "!selectedStatus ??".
        // Maybe it needed parens?

        if (newContent !== content) {
            console.log(`Fixing typos in: ${filePath}`);
            await fs.writeFile(fullPath, newContent);
        }
    } catch (e) {
        // console.error(`Skipping ${filePath}`);
    }
}

async function walk(dir) {
    let files = await fs.readdir(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.svelte-kit') {
                await walk(filePath);
            }
        } else if (file.endsWith('.svelte')) {
            await processFile(path.relative(path.resolve(ROOT_DIR, '..'), filePath));
        }
    }
}

console.log('Starting Phase 15b: Typo Cleanup...');
await walk(ROOT_DIR);
console.log('Done.');
