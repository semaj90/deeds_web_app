import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function findBackupFiles(dir) {
    let results = [];
    const list = await fs.readdir(dir);
    for (const file of list) {
        const filePath = path.resolve(dir, file);
        const stat = await fs.stat(filePath);
        if (stat && stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== '.svelte-kit') {
                results = results.concat(await findBackupFiles(filePath));
            }
        } else {
            if (file.endsWith('.phase79.bak')) {
                results.push(filePath);
            }
        }
    }
    return results;
}

async function restoreFiles() {
    console.log('🔍 Scanning for .phase79.bak files...');
    const backupFiles = await findBackupFiles(rootDir);
    console.log(`Found ${backupFiles.length} backup files.`);

    let restoredCount = 0;
    let errorCount = 0;

    for (const backupPath of backupFiles) {
        const originalPath = backupPath.replace('.phase79.bak', '');
        try {
            await fs.copyFile(backupPath, originalPath);
            await fs.unlink(backupPath);
            restoredCount++;
            if (restoredCount % 100 === 0) {
                process.stdout.write('.');
            }
        } catch (err) {
            console.error(`\n❌ Failed to restore ${originalPath}:`, err);
            errorCount++;
        }
    }

    console.log('\n\n✨ Restoration Complete ✨');
    console.log(`✅ Restored: ${restoredCount} files`);
    console.log(`❌ Errors: ${errorCount} files`);
}

restoreFiles().catch(console.error);
