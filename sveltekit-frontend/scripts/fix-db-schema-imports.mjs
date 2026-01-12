import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.resolve(__dirname, '../src/lib/server/db');

if (!fs.existsSync(dbDir)) {
    console.error(`Directory not found: ${dbDir}`);
    process.exit(1);
}

const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.ts'));

files.forEach(file => {
    const filePath = path.join(dbDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let original = content;

    // Replace relative imports ending in .js with .ts
    // Matches: from './...' or from '../...'
    content = content.replace(/from\s+['"](\.{1,2}\/.*)\.js['"]/g, "from '$1.ts'");

    // Handle export ... from ...
    content = content.replace(/export\s+.*\s+from\s+['"](\.{1,2}\/.*)\.js['"]/g, (match) => {
        return match.replace('.js', '.ts');
    });

     // Check changes
    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated imports in: ${file}`);
    }
});

console.log('Done fixing DB schema imports.');
