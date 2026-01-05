import fs from 'fs';
import path from 'path';

const STUBS_LIST = 'logs/stubs-list.txt';
const APPLY = process.argv.includes('--apply');

if (!fs.existsSync(STUBS_LIST)) {
    console.error(`❌ Stubs list not found: ${STUBS_LIST}`);
    process.exit(1);
}

const stubs = fs.readFileSync(STUBS_LIST, 'utf-8')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && s.endsWith('.svelte'));

console.log(`🔍 Found ${stubs.length} stubs to analyze...`);

function findBestBackup(svelteFile) {
    const dir = path.dirname(svelteFile);
    const base = path.basename(svelteFile);
    const files = fs.readdirSync(dir);

    // Check for common backup extensions
    const backupExtensions = ['.any-backup', '.css-backup', '.css-bak', '.bak', '.mojibake-backup'];
    const backups = files.filter(f => f.startsWith(base) && f !== base);

    if (backups.length === 0) return null;

    // Filter out obvious "bad" backups and sort by size descending
    return backups
        .filter(f => !f.endsWith('.mojibake-backup')) // Mojibake backups are usually garbage
        .map(f => ({ name: f, path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size }))
        .sort((a, b) => b.size - a.size)[0];
}

function fixContent(content) {
    let fixed = content;

    // 1. Redundant Object Literals: { foo: foo } -> { foo }
    fixed = fixed.replace(/\{\s*(\w+)\s*:\s*\1\s*\}/g, '{ $1 }');

    // 2. Colon-instead-of-space in type casting and other keywords
    // Corrects: as: 'type' -> as 'type', if: any -> if any, typeof: 'foo' -> typeof 'foo'
    fixed = fixed.replace(/\b(as|if|typeof|from|export|import):\s*/g, '$1 ');

    // 3. Displaced types in function signatures: ), Type: ReturnType -> ): ReturnType
    // This is a common pattern in your corrupted files
    fixed = fixed.replace(/\)\s*,\s*(\w+):\s*(\w+)/g, '): $2');

    // 4. Svelte 5 Component Lifecycle
    // Slot to Render
    fixed = fixed.replace(/<slot\s*\/>/g, '{@render children?.()}');
    fixed = fixed.replace(/<slot\s+name=["']([^"']+)["']\s*\/>/g, '{@render $1?.()}');

    // 5. Common CSS corruptions
    // rgba(r: g, b, a) -> rgba(r, g, b, a)
    fixed = fixed.replace(/rgba\((\d+):\s*(\d+)/g, 'rgba($1, $2');
    // shadow: 0: 0 -> shadow: 0 0
    fixed = fixed.replace(/box-shadow:\s*0:\s*0/g, 'box-shadow: 0 0');
    // Repeating linear gradient {} fixes
    fixed = fixed.replace(/\{\s*\}/g, '0%'); // Heuristic fix for weird gaps in gradients

    // 6. Generic type comma fix
    fixed = fixed.replace(/<([^>]+):\s*([^>]+)>/g, '<$1, $2>');

    // 7. Template literal corruption: ${ foo: foo } -> ${ foo }
    fixed = fixed.replace(/\$\{\s*(\w+)\s*:\s*\1\s*\}/g, '${$1}');

    return fixed;
}

const stats = { restored: 0, skipped: 0, fixed: 0 };

for (const stub of stubs) {
    const backup = findBestBackup(stub);
    if (!backup) {
        stats.skipped++;
        continue;
    }

    const backupContent = fs.readFileSync(backup.path, 'utf-8');
    const fixed = fixContent(backupContent);

    if (APPLY) {
        fs.writeFileSync(stub, fixed);
        if (backupContent !== fixed) stats.fixed++;
        stats.restored++;
    } else {
        if (backupContent !== fixed) {
            // console.log(`[DRY] Fixed ${stub}`);
        }
        stats.restored++;
    }
}

console.log(`\n✨ Summary (${APPLY ? 'APPLIED' : 'DRY RUN'}):`);
console.log(`   Restored: ${stats.restored}`);
console.log(`   Corruptions Fixed: ${stats.fixed || 'Analytic Count N/A'}`);
console.log(`   Skipped (No Backup): ${stats.skipped}`);

if (!APPLY) {
    console.log(`\n👉 Run with --apply to actually restore and fix files.`);
}
