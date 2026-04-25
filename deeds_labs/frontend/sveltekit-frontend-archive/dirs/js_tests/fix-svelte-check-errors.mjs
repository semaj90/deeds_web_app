import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function fixAllImportErrors() {
  // Specific files and their import fixes
  const importFixes = [
    // Fix Button imports
    {
      files: [
        'src/routes/help/+page.svelte',
        'src/routes/import/+page.svelte',
        'src/routes/search/+page.svelte',
        'src/routes/security/+page.svelte',
        'src/routes/settings/+page.svelte',
      ],
      find: 'from "$lib/components/ui/index.js/index"',
      replace: 'from "$lib/components/ui"',
    },
    // Fix Tooltip imports
    {
      files: ['src/routes/login/+page.svelte'],
      find: 'from "$lib/components/ui/Tooltip.svelte/index"',
      replace: 'from "$lib/components/ui"',
    },
    // Fix component imports with .svelte/index
    {
      files: ['src/routes/modern-demo/+page.svelte'],
      find: 'from "$lib/components/ui/ExpandGrid.svelte/index"',
      replace: 'from "$lib/components/ui"',
    },
    {
      files: ['src/routes/modern-demo/+page.svelte'],
      find: 'from "$lib/components/ui/GoldenLayout.svelte/index"',
      replace: 'from "$lib/components/ui"',
    },
    {
      files: ['src/routes/modern-demo/+page.svelte'],
      find: 'from "$lib/components/ui/SmartTextarea.svelte/index"',
      replace: 'from "$lib/components/ui"',
    },
  ];

  // Apply import fixes
  for (const fix of importFixes) {
    for (const file of fix.files) {
      const filePath = path.join(process.cwd(), file);
      try {
        let content = await fs.readFile(filePath, 'utf-8');
        if (content.includes(fix.find)) {
          content = content.replace(
            new RegExp(fix.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            fix.replace
          );
          await fs.writeFile(filePath, content);
          console.log(`✅ Fixed imports in ${file}`);
        }
      } catch (error) {
        console.log(`⚠️  Could not access ${file}: ${error.message}`);
      }
    }
  }
}

async function fixCssIssues() {
  // Fix @apply directives in CSS
  const cssFiles = ['src/routes/local-ai-demo/+page.svelte', 'src/routes/rag-demo/+page.svelte'];

  for (const file of cssFiles) {
    const filePath = path.join(process.cwd(), file);
    try {
      let content = await fs.readFile(filePath, 'utf-8');

      // Replace @apply with standard CSS
      if (content.includes('@apply')) {
        content = content.replace(
          /@apply\s+bg-blue-100\s+px-2\s+py-1\s+rounded\s+text-sm\s+font-mono;/g,
          `background-color: rgb(219 234 254);
        padding-left: 0.5rem;
        padding-right: 0.5rem;
        padding-top: 0.25rem;
        padding-bottom: 0.25rem;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;`
        );

        await fs.writeFile(filePath, content);
        console.log(`✅ Fixed CSS @apply in ${file}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not fix CSS in ${file}: ${error.message}`);
    }
  }
}

async function fixAccessibilityIssues() {
  // Fix label association issue
  const filePath = path.join(process.cwd(), 'src/routes/local-ai-demo/+page.svelte');
  try {
    let content = await fs.readFile(filePath, 'utf-8');

    // Find the label without associated control and add an ID
    const labelRegex =
      /<label\s+class="block text-sm font-medium text-gray-700 mb-2">AI Provider<\/label>/;
    if (content.match(labelRegex)) {
      // Add a fieldset/legend instead of label for radio group
      content = content.replace(
        /<div class="mb-4">\s*<label class="block text-sm font-medium text-gray-700 mb-2">AI Provider<\/label>/,
        `<fieldset class="mb-4">
            <legend class="block text-sm font-medium text-gray-700 mb-2">AI Provider</legend>`
      );

      // Find the closing div and replace with closing fieldset
      const divEndIndex = content.indexOf('</div>', content.indexOf('AI Provider'));
      if (divEndIndex !== -1) {
        // Count nested divs to find the correct closing tag
        let openDivs = 1;
        let currentIndex = content.indexOf('AI Provider');
        while (openDivs > 0 && currentIndex < content.length) {
          if (content.slice(currentIndex, currentIndex + 5) === '<div ') {
            openDivs++;
          } else if (content.slice(currentIndex, currentIndex + 6) === '</div>') {
            openDivs--;
            if (openDivs === 0) {
              content =
                content.slice(0, currentIndex) + '</fieldset>' + content.slice(currentIndex + 6);
              break;
            }
          }
          currentIndex++;
        }
      }

      await fs.writeFile(filePath, content);
      console.log(`✅ Fixed accessibility issue in ${filePath}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not fix accessibility issue: ${error.message}`);
  }
}

async function fixTooltipImports() {
  // Fix tooltip imports that might be using /index pattern
  const files = [
    'src/routes/help/+page.svelte',
    'src/routes/import/+page.svelte',
    'src/routes/search/+page.svelte',
  ];

  for (const file of files) {
    const filePath = path.join(process.cwd(), file);
    try {
      let content = await fs.readFile(filePath, 'utf-8');

      // Fix Tooltip imports
      content = content.replace(
        /from\s+["'](\$lib\/components\/ui\/tooltip)\/index["']/g,
        'from "$1"'
      );

      await fs.writeFile(filePath, content);
    } catch (error) {
      console.log(`⚠️  Could not fix tooltip imports in ${file}: ${error.message}`);
    }
  }
}

async function main() {
  console.log('🔧 Starting comprehensive Svelte check error fixes...\n');

  console.log('Step 1: Fixing import errors...');
  await fixAllImportErrors();

  console.log('\nStep 2: Fixing CSS issues...');
  await fixCssIssues();

  console.log('\nStep 3: Fixing accessibility issues...');
  await fixAccessibilityIssues();

  console.log('\nStep 4: Fixing tooltip imports...');
  await fixTooltipImports();

  console.log('\n✅ All automated fixes applied!');
  console.log(
    '\n📝 Note: Some warnings (like unused CSS selectors) are expected and can be ignored.'
  );
  console.log('🔍 Run "npm run check" to see if any issues remain.\n');
}

// Run the fixer
main().catch(console.error);
