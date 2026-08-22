/**
 * Example usage of directory scanner (not automated test, but reference).
 */

import { scanDirectory, scanDirectorySync } from './directory-scanner.js';

/**
 * Example 1: Async generator (memory-efficient for large repos).
 */
async function exampleAsyncGenerator() {
  console.log('=== Example 1: Async Generator ===');

  const config = {
    rootPath: '/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/src',
    excludePatterns: ['node_modules', '.svelte-kit', 'dist'],
    maxDepth: 20,
    gitIgnoreMode: 'strict' as const,
  };

  let fileCount = 0;
  const languageCounts: Record<string, number> = {};

  for await (const file of scanDirectory(config)) {
    fileCount++;
    languageCounts[file.language] = (languageCounts[file.language] ?? 0) + 1;

    if (fileCount <= 5) {
      console.log(`  ${file.relativePath} (${file.language}, ${file.size} bytes)`);
    }
  }

  console.log(`\nTotal files: ${fileCount}`);
  console.log('Language breakdown:', languageCounts);
}

/**
 * Example 2: Sync wrapper (collects all files into array).
 */
async function exampleSync() {
  console.log('\n=== Example 2: Sync Wrapper ===');

  const files = await scanDirectorySync({
    rootPath: '/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/src',
    maxDepth: 10,
  });

  console.log(`Found ${files.length} files`);
  console.log('First 3:', files.slice(0, 3).map(f => f.relativePath));
}

/**
 * Example 3: With include patterns (override excludes).
 */
async function exampleIncludePatterns() {
  console.log('\n=== Example 3: Include Patterns (force include lib/) ===');

  const files = await scanDirectorySync({
    rootPath: '/c/Users/james/Videos/deeds-web-app/sveltekit-frontend',
    excludePatterns: ['node_modules', '.svelte-kit', 'dist'],
    includePatterns: ['src/lib/**'],
    maxDepth: 5,
  });

  console.log(`Found ${files.length} files in src/lib/`);
  console.log('Sample:', files.slice(0, 3).map(f => f.relativePath));
}

/**
 * Example 4: Without .gitignore (strict off).
 */
async function exampleNoGitIgnore() {
  console.log('\n=== Example 4: Ignore .gitignore patterns ===');

  const files = await scanDirectorySync({
    rootPath: '/c/Users/james/Videos/deeds-web-app',
    excludePatterns: [],
    gitIgnoreMode: 'off',
    maxDepth: 2, // Limit depth to avoid scanning everything
  });

  console.log(`Found ${files.length} files without respecting .gitignore`);
}

// Run examples
async function main() {
  try {
    await exampleAsyncGenerator();
    await exampleSync();
    await exampleIncludePatterns();
    // await exampleNoGitIgnore(); // Commented out: would scan too much
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
