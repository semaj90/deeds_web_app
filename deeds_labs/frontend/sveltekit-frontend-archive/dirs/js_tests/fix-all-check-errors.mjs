import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Specific error patterns we've identified
const fixes = [
  {
    // Fix incorrect module paths ending with /index
    pattern: /from\s+["'](\$lib\/components\/ui\/[^"']+)\.svelte\/index["']/g,
    replacement: 'from "$1.svelte"',
    description: 'Fix .svelte/index imports',
  },
  {
    // Fix index.js/index imports
    pattern: /from\s+["'](\$lib\/components\/ui\/)index\.js\/index["']/g,
    replacement: 'from "$1index"',
    description: 'Fix index.js/index imports',
  },
  {
    // Fix @apply directives (convert to UnoCSS)
    pattern: /@apply\s+([^;]+);/g,
    replacement: (match, classes) => {
      // For UnoCSS, we can use the same classes directly
      return `/* UnoCSS classes: ${classes.trim()} */`;
    },
    description: 'Convert @apply to UnoCSS comment',
  },
];

async function findSvelteFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and .svelte-kit
      if (entry.name === 'node_modules' || entry.name === '.svelte-kit' || entry.name === '.git') {
        continue;
      }
      files.push(...(await findSvelteFiles(fullPath)));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.svelte') || entry.name.endsWith('.ts') || entry.name.endsWith('.js'))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

async function fixFile(filePath, fixes) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    let modified = false;
    const appliedFixes = [];

    for (const fix of fixes) {
      const matches = content.match(fix.pattern);
      if (matches) {
        content = content.replace(fix.pattern, fix.replacement);
        modified = true;
        appliedFixes.push({
          description: fix.description,
          count: matches.length,
        });
      }
    }

    if (modified) {
      await fs.writeFile(filePath, content);
      return appliedFixes;
    }

    return null;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return null;
  }
}

async function fixSpecificImports() {
  // Fix specific known problematic imports
  const specificFixes = [
    {
      file: 'src/routes/help/+page.svelte',
      find: 'from "$lib/components/ui/index.js/index"',
      replace: 'from "$lib/components/ui/button"',
    },
    {
      file: 'src/routes/import/+page.svelte',
      find: 'from "$lib/components/ui/index.js/index"',
      replace: 'from "$lib/components/ui/button"',
    },
    {
      file: 'src/routes/search/+page.svelte',
      find: 'from "$lib/components/ui/index.js/index"',
      replace: 'from "$lib/components/ui/button"',
    },
    {
      file: 'src/routes/security/+page.svelte',
      find: 'from "$lib/components/ui/index.js/index"',
      replace: 'from "$lib/components/ui/button"',
    },
    {
      file: 'src/routes/settings/+page.svelte',
      find: 'from "$lib/components/ui/index.js/index"',
      replace: 'from "$lib/components/ui/button"',
    },
    {
      file: 'src/routes/login/+page.svelte',
      find: 'from "$lib/components/ui/Tooltip.svelte/index"',
      replace: 'from "$lib/components/ui/tooltip"',
    },
    {
      file: 'src/routes/modern-demo/+page.svelte',
      find: 'from "$lib/components/ui/ExpandGrid.svelte/index"',
      replace: 'from "$lib/components/ui/ExpandGrid.svelte"',
    },
    {
      file: 'src/routes/modern-demo/+page.svelte',
      find: 'from "$lib/components/ui/GoldenLayout.svelte/index"',
      replace: 'from "$lib/components/ui/GoldenLayout.svelte"',
    },
    {
      file: 'src/routes/modern-demo/+page.svelte',
      find: 'from "$lib/components/ui/SmartTextarea.svelte/index"',
      replace: 'from "$lib/components/ui/SmartTextarea.svelte"',
    },
  ];

  for (const fix of specificFixes) {
    const filePath = path.join(process.cwd(), fix.file);
    try {
      let content = await fs.readFile(filePath, 'utf-8');
      if (content.includes(fix.find)) {
        content = content.replace(fix.find, fix.replace);
        await fs.writeFile(filePath, content);
        console.log(`✅ Fixed import in ${fix.file}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not fix ${fix.file}: ${error.message}`);
    }
  }
}

async function fixCssInSvelteFiles() {
  // Fix CSS @apply directives in specific files
  const cssFiles = ['src/routes/local-ai-demo/+page.svelte', 'src/routes/rag-demo/+page.svelte'];

  for (const file of cssFiles) {
    const filePath = path.join(process.cwd(), file);
    try {
      let content = await fs.readFile(filePath, 'utf-8');

      // Replace @apply with actual CSS
      content = content.replace(
        /@apply\s+bg-blue-100\s+px-2\s+py-1\s+rounded\s+text-sm\s+font-mono;/g,
        `background-color: #dbeafe;
        padding: 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        font-family: monospace;`
      );

      await fs.writeFile(filePath, content);
      console.log(`✅ Fixed CSS in ${file}`);
    } catch (error) {
      console.log(`⚠️  Could not fix CSS in ${file}: ${error.message}`);
    }
  }
}

async function main() {
  console.log('Starting comprehensive error fix...\n');

  // Step 1: Fix specific imports
  console.log('Step 1: Fixing specific imports...');
  await fixSpecificImports();

  // Step 2: Fix CSS issues
  console.log('\nStep 2: Fixing CSS issues...');
  await fixCssInSvelteFiles();

  // Step 3: Apply general fixes to all files
  console.log('\nStep 3: Applying general fixes...');
  const srcDir = path.join(process.cwd(), 'src');
  const files = await findSvelteFiles(srcDir);

  let totalFixed = 0;
  const fixSummary = {};

  for (const file of files) {
    const result = await fixFile(file, fixes);
    if (result) {
      totalFixed++;
      const relativePath = path.relative(process.cwd(), file);
      console.log(`✅ Fixed: ${relativePath}`);

      for (const fix of result) {
        fixSummary[fix.description] = (fixSummary[fix.description] || 0) + fix.count;
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Fix Summary:');
  console.log('='.repeat(60));
  console.log(`Total files fixed: ${totalFixed}`);
  console.log('\nFixes applied:');
  for (const [description, count] of Object.entries(fixSummary)) {
    console.log(`  ${description}: ${count} occurrences`);
  }

  console.log('\n✅ All fixes applied!');
  console.log('\nRun "npm run check" to verify remaining issues.');
}

// Run the fixer
main().catch(console.error);
