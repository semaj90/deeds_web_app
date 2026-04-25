const fs = require('fs');
const path = require('path');

const dir = 'src/lib/components/ui/gaming/n64';
const absoluteDir = path.resolve(dir);
const suffix = '.bak-phase42-2025-11-03';

console.log(`Scanning ${absoluteDir}...`);

try {
    const files = fs.readdirSync(absoluteDir);
    let restoredCount = 0;

    for (const file of files) {
        if (file.endsWith(suffix)) {
            const targetName = file.replace(suffix, '');
            const sourcePath = path.join(absoluteDir, file);
            const targetPath = path.join(absoluteDir, targetName);

            // Read source
            const content = fs.readFileSync(sourcePath, 'utf8');

            // Write to target
            fs.writeFileSync(targetPath, content, 'utf8');
            console.log(`Restored ${targetName} from backup (${content.length} bytes)`);
            restoredCount++;
        }
    }

    console.log(`\nrestoration complete. Restored ${restoredCount} files.`);

} catch (err) {
    console.error('Error restoring files:', err);
}
