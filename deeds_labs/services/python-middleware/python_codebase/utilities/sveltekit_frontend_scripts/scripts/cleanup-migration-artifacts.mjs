#!/usr/bin/env node

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcPath = join(__dirname, '..', 'src');

async function cleanupFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    let modified = false;

    // Remove @migration-task comments
    let newContent = content.replace(/<!--\s*@migration-task[^>]*-->\s*\n?/g, () => {
      modified = true;
      return '';
    });

    // Remove TODO migration comments
    newContent = newContent.replace(/<!--\s*TODO:\s*migrate[^>]*-->\s*\n?/g, () => {
      modified = true;
      return '';
    });

    // Remove multiple consecutive newlines (cleanup)
    newContent = newContent.replace(/\n{3,}/g, '\n\n');

    if (modified) {
      await writeFile(filePath, newContent, 'utf-8');
      console.log(`✅ Cleaned: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function processDirectory(dirPath) {
  let cleanedCount = 0;
  let totalFiles = 0;

  try {
    const entries = await readdir(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        // Skip node_modules, .git, .svelte-kit directories
        if (!['node_modules', '.git', '.svelte-kit', 'dist', 'build'].includes(entry)) {
          const result = await processDirectory(fullPath);
          cleanedCount += result.cleaned;
          totalFiles += result.total;
        }
      } else if (entry.endsWith('.svelte') || entry.endsWith('.ts') || entry.endsWith('.js')) {
        totalFiles++;
        const wasCleaned = await cleanupFile(fullPath);
        if (wasCleaned) cleanedCount++;
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }

  return { cleaned: cleanedCount, total: totalFiles };
}

async function main() {
  console.log('🧹 Cleaning up Svelte 5 migration artifacts...');
  console.log(`📁 Processing: ${srcPath}`);

  const startTime = Date.now();
  const result = await processDirectory(srcPath);
  const endTime = Date.now();

  console.log('\n📊 Cleanup Results:');
  console.log(`✅ Files cleaned: ${result.cleaned}`);
  console.log(`📄 Total files processed: ${result.total}`);
  console.log(`⏱️  Time taken: ${endTime - startTime}ms`);

  if (result.cleaned > 0) {
    console.log('\n🎉 Migration artifact cleanup completed successfully!');
  } else {
    console.log('\n✨ No migration artifacts found - codebase is clean!');
  }
}

main().catch(console.error);
