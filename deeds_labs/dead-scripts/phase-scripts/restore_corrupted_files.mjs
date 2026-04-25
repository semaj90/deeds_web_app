
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const BACKUP_DIR = path.join(ROOT, 'src.backup.20260104_111218');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function restore() {
  console.log('Scanning for corrupted files...');
  const allSrcFiles = getAllFiles(SRC_DIR);
  const corrupted = [];
  const manualReview = [];

  allSrcFiles.forEach(srcPath => {
    const relativePath = path.relative(SRC_DIR, srcPath);
    const backupPath = path.join(BACKUP_DIR, relativePath);

    const srcStats = fs.statSync(srcPath);

    if (fs.existsSync(backupPath)) {
      const backupStats = fs.statSync(backupPath);

      if (srcStats.size === 0 && backupStats.size > 0) {
        corrupted.push({ srcPath, backupPath, relativePath });
      } else if (srcStats.size < backupStats.size && srcStats.size > 0) {
          // Identify "significant" loss?
          // For now, track all scenarios where backup is larger
          manualReview.push({
              srcPath,
              backupPath,
              relativePath,
              srcSize: srcStats.size,
              backupSize: backupStats.size
          });
      }
    }
  });

  console.log(`Found ${corrupted.length} 0-byte files with valid backups.`);
  console.log(`Found ${manualReview.length} files where backup is larger.`);

  // Restore 0-byte files
  if (corrupted.length > 0) {
      console.log('Restoring 0-byte files...');
      corrupted.forEach(({ srcPath, backupPath, relativePath }) => {
          fs.copyFileSync(backupPath, srcPath);
          console.log(`Restored: ${relativePath}`);
      });
      console.log('Restoration of 0-byte files complete.');
  }

  // Report manual review items
  if (manualReview.length > 0) {
      console.log('\n--- Manual Review Candidates (Backup Larger) ---');
      manualReview.forEach(item => {
          console.log(`${item.relativePath} (Src: ${item.srcSize} vs Backup: ${item.backupSize})`);
      });
      fs.writeFileSync(path.join(ROOT, 'documents', 'production', 'MANUAL_RESTORE_REVIEW.md'),
          JSON.stringify(manualReview, null, 2));
  }
}

restore();
