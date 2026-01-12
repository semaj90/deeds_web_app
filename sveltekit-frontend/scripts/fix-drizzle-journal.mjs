import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const journalPath = path.join(projectRoot, 'drizzle/meta/_journal.json');
const sqlPath = path.join(projectRoot, 'drizzle/0001_serious_rumiko_fujikawa.sql');
const snapshotPath = path.join(projectRoot, 'drizzle/meta/0001_serious_rumiko_fujikawa.json');

if (fs.existsSync(journalPath)) {
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    const initialLength = journal.entries.length;
    journal.entries = journal.entries.filter(e => e.tag !== '0001_serious_rumiko_fujikawa');

    if (journal.entries.length < initialLength) {
        fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
        console.log('Removed 0001 from journal.');
    } else {
        console.log('0001 not found in journal.');
    }
}

if (fs.existsSync(sqlPath)) {
    fs.unlinkSync(sqlPath);
    console.log('Deleted 0001 SQL file.');
}

if (fs.existsSync(snapshotPath)) {
    fs.unlinkSync(snapshotPath);
    console.log('Deleted 0001 snapshot file.');
}
