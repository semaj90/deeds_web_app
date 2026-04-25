import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const summaryPath = path.resolve(__dirname, '../logs/fix-comma-summary.json');
const repoRoot = path.resolve(__dirname, '..');

// Read the summary JSON
const summaryText = await fs.readFile(summaryPath, 'utf8');
const summary = JSON.parse(summaryText);

console.log(`📋 Found ${summary.files.length} files with comma fixes`);
console.log(`⏰ Generated: ${summary.generated}`);
console.log('');

let totalApplied = 0;
let totalSkipped = 0;
let filesModified = 0;

for (const fileInfo of summary.files) {
  const filePath = path.resolve(repoRoot, fileInfo.file);

  if (!existsSync(filePath)) {
    console.log(`⚠️  Skipping ${fileInfo.file} (not found)`);
    totalSkipped += fileInfo.patches;
    continue;
  }

  try {
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    let modified = false;
    let appliedCount = 0;

    // Apply patches in reverse order (bottom to top) to preserve line numbers
    const sortedPatches = [...fileInfo.details].sort((a, b) => b.line - a.line);

    for (const patch of sortedPatches) {
      const idx = patch.line - 1;
      if (idx < 0 || idx >= lines.length) continue;

      // Verify the line matches what we expect
      if (lines[idx].trim() === patch.original.trim()) {
        lines[idx] = patch.suggestion;
        modified = true;
        appliedCount++;
      } else {
        console.log(`⚠️  Line ${patch.line} in ${fileInfo.file} doesn't match expected content`);
        console.log(`   Expected: ${patch.original.trim()}`);
        console.log(`   Found: ${lines[idx].trim()}`);
      }
    }

    if (modified) {
      // Write back to file
      await fs.writeFile(filePath, lines.join('\n'), 'utf8');
      console.log(`✅ ${fileInfo.file}: Applied ${appliedCount}/${fileInfo.patches} fixes`);
      totalApplied += appliedCount;
      filesModified++;
    } else {
      console.log(`⏭️  ${fileInfo.file}: No changes applied`);
      totalSkipped += fileInfo.patches;
    }
  } catch (error) {
    console.error(`❌ Error processing ${fileInfo.file}:`, error.message);
    totalSkipped += fileInfo.patches;
  }
}

console.log('');
console.log('=== Summary ===');
console.log(`✅ Files modified: ${filesModified}`);
console.log(`✅ Fixes applied: ${totalApplied}`);
console.log(`⚠️  Fixes skipped: ${totalSkipped}`);
console.log('');
console.log('💡 Next steps:');
console.log('   1. Run: npx tsc --noEmit to verify fixes');
console.log('   2. If successful, commit the changes');
console.log('   3. If errors remain, run generate_comma_fixes.js again');
