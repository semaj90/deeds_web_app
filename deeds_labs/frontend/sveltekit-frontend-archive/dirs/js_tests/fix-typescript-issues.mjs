import fs from 'fs/promises';
import path from 'path';

// Common TypeScript/Svelte fixes
const additionalFixes = {
  // Fix missing type imports
  async fixMissingTypeImports() {
    const files = [
      'src/routes/+layout.svelte',
      'src/routes/+page.svelte',
      'src/routes/dashboard/+page.svelte',
      'src/routes/cases/+page.svelte',
      'src/routes/evidence/+page.svelte',
    ];

    for (const file of files) {
      const filePath = path.join(process.cwd(), file);
      try {
        let content = await fs.readFile(filePath, 'utf-8');
        let modified = false;

        // Check if file needs PageData or LayoutData import
        if (
          content.includes('export let data') &&
          !content.includes('import type { PageData }') &&
          !content.includes('import type { LayoutData }')
        ) {
          const isLayout = file.includes('+layout');
          const typeImport = isLayout
            ? `import type { LayoutData } from './$types';\n`
            : `import type { PageData } from './$types';\n`;

          // Add after script tag
          const scriptIndex = content.indexOf('<script');
          if (scriptIndex !== -1) {
            const scriptEndIndex = content.indexOf('>', scriptIndex) + 1;
            content =
              content.slice(0, scriptEndIndex) +
              '\n  ' +
              typeImport +
              content.slice(scriptEndIndex);
            modified = true;
          }
        }

        // Fix data type annotation
        if (content.includes('export let data') && !content.includes('export let data:')) {
          const isLayout = file.includes('+layout');
          const dataType = isLayout ? 'LayoutData' : 'PageData';
          content = content.replace(/export let data(?!:)/, `export let data: ${dataType}`);
          modified = true;
        }

        if (modified) {
          await fs.writeFile(filePath, content);
          console.log(`✅ Fixed type imports in ${file}`);
        }
      } catch (error) {
        // File might not exist, skip
      }
    }
  },

  // Fix store $ syntax
  async fixStoreSyntax() {
    const storeFiles = await findFilesWithPattern('src', /\$[a-zA-Z_]\w*\s*\./);

    for (const file of storeFiles) {
      try {
        let content = await fs.readFile(file, 'utf-8');

        // Fix $store.property to $store syntax
        content = content.replace(
          /\$([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)/g,
          (match, store, property) => {
            // Don't replace if it's actually accessing a property of the unwrapped store value
            if (['subscribe', 'set', 'update'].includes(property)) {
              return match; // Keep as is for store methods
            }
            return `$${store}`; // Remove property access
          }
        );

        await fs.writeFile(file, content);
      } catch (error) {
        console.error(`Error fixing store syntax in ${file}:`, error.message);
      }
    }
  },

  // Fix unused variable warnings
  async fixUnusedVariables() {
    const svelteFiles = await findFilesWithPattern('src', /\.svelte$/);

    for (const file of svelteFiles) {
      try {
        let content = await fs.readFile(file, 'utf-8');

        // Prefix unused event handler parameters with underscore
        content = content.replace(
          /on:click=\{(\s*\()([a-zA-Z_]\w*)(\)\s*=>)/g,
          'on:click={$1_$2$3'
        );
        content = content.replace(
          /on:submit=\{(\s*\()([a-zA-Z_]\w*)(\)\s*=>)/g,
          'on:submit={$1_$2$3'
        );

        await fs.writeFile(file, content);
      } catch (error) {
        console.error(`Error fixing unused variables in ${file}:`, error.message);
      }
    }
  },
};

async function findFilesWithPattern(dir, pattern) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory() && !['node_modules', '.svelte-kit', '.git'].includes(entry.name)) {
        await walk(fullPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

async function main() {
  console.log('🔧 Running additional TypeScript/Svelte fixes...\n');

  console.log('Fixing missing type imports...');
  await additionalFixes.fixMissingTypeImports();

  console.log('\nFixing store syntax issues...');
  await additionalFixes.fixStoreSyntax();

  console.log('\nFixing unused variable warnings...');
  await additionalFixes.fixUnusedVariables();

  console.log('\n✅ Additional fixes complete!');
}

main().catch(console.error);
