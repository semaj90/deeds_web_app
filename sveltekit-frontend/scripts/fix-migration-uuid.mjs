import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationFile = path.resolve(__dirname, '../drizzle/0000_puzzling_mongu.sql');

if (!fs.existsSync(migrationFile)) {
    console.error(`Migration file not found: ${migrationFile}`);
    process.exit(1);
}

let content = fs.readFileSync(migrationFile, 'utf-8');
const original = content;

// Replace "user_id" varchar(255) with "user_id" uuid
// Handles lines ending with comma or NOT NULL
content = content.replace(/"user_id" varchar\(255\)/g, '"user_id" uuid');

if (content !== original) {
    fs.writeFileSync(migrationFile, content);
    console.log(`Updated uuid types in: ${path.basename(migrationFile)}`);
} else {
    console.log('No changes needed.');
}
