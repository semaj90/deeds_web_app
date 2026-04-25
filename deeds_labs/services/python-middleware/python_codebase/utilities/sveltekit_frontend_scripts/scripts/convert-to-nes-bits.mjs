#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// Component mapping from shadcn/tailwind to NES.css + UnoCSS
const classMapping = {
  // Tailwind to UnoCSS mappings
  'bg-white': 'bg-white',
  'bg-black': 'bg-black',
  'bg-gray-50': 'bg-gray-50',
  'bg-gray-100': 'bg-gray-100',
  'bg-gray-200': 'bg-gray-200',
  'bg-gray-300': 'bg-gray-300',
  'bg-gray-400': 'bg-gray-400',
  'bg-gray-500': 'bg-gray-500',
  'bg-gray-600': 'bg-gray-600',
  'bg-gray-700': 'bg-gray-700',
  'bg-gray-800': 'bg-gray-800',
  'bg-gray-900': 'bg-gray-900',

  // Shadcn components to NES.css components
  'shadcn-card': 'nes-container',
  'shadcn-button': 'nes-btn',
  'shadcn-input': 'nes-input',
  'shadcn-select': 'nes-select',
  'shadcn-badge': 'nes-badge',
  'shadcn-dialog': 'nes-dialog',
  'shadcn-alert': 'nes-container is-rounded',

  // Button variants
  'btn-primary': 'nes-btn is-primary',
  'btn-secondary': 'nes-btn',
  'btn-destructive': 'nes-btn is-error',
  'btn-outline': 'nes-btn',
  'btn-ghost': 'nes-btn',
  'btn-link': 'nes-btn',

  // Card components (using UnoCSS shortcuts)
  card: 'nier-bits-card',
  'card-header': 'yorha-panel-header',
  'card-title': 'nes-text is-primary',
  'card-description': 'nes-text',
  'card-content': 'yorha-panel-content',
  'card-footer': 'yorha-panel-content',

  // Layout classes
  flex: 'flex',
  'flex-col': 'flex-col',
  'flex-row': 'flex-row',
  'items-center': 'items-center',
  'justify-center': 'justify-center',
  'justify-between': 'justify-between',
  'gap-2': 'gap-2',
  'gap-4': 'gap-4',
  'gap-6': 'gap-6',
  'space-y-2': 'space-y-2',
  'space-y-4': 'space-y-4',
  'space-x-2': 'space-x-2',
  'space-x-4': 'space-x-4',

  // Text classes
  'text-sm': 'text-sm',
  'text-base': 'text-base',
  'text-lg': 'text-lg',
  'text-xl': 'text-xl',
  'text-2xl': 'text-2xl',
  'font-bold': 'font-bold',
  'font-semibold': 'font-semibold',
  'font-medium': 'font-medium',

  // Colors
  'text-gray-500': 'text-gray-500',
  'text-gray-600': 'text-gray-600',
  'text-gray-700': 'text-gray-700',
  'text-gray-800': 'text-gray-800',
  'text-gray-900': 'text-gray-900',
  'text-muted-foreground': 'nes-text is-disabled',

  // Borders
  border: 'border',
  'border-2': 'border-2',
  rounded: 'rounded',
  'rounded-md': 'rounded-md',
  'rounded-lg': 'rounded-lg',
  'shadow-sm': 'shadow-sm',
  shadow: 'shadow',
  'shadow-lg': 'shadow-lg',

  // Spacing
  'p-2': 'p-2',
  'p-4': 'p-4',
  'p-6': 'p-6',
  'px-2': 'px-2',
  'px-4': 'px-4',
  'px-6': 'px-6',
  'py-2': 'py-2',
  'py-4': 'py-4',
  'py-6': 'py-6',
  'm-2': 'm-2',
  'm-4': 'm-4',
  'mx-auto': 'mx-auto',
  'mt-2': 'mt-2',
  'mt-4': 'mt-4',
  'mb-2': 'mb-2',
  'mb-4': 'mb-4',

  // Width/Height
  'w-full': 'w-full',
  'h-full': 'h-full',
  'max-w-lg': 'max-w-lg',
  'max-w-xl': 'max-w-xl',
  'max-w-2xl': 'max-w-2xl',
  'max-w-4xl': 'max-w-4xl',
  'min-h-screen': 'min-h-screen',

  // Grid
  grid: 'grid',
  'grid-cols-1': 'grid-cols-1',
  'grid-cols-2': 'grid-cols-2',
  'grid-cols-3': 'grid-cols-3',
  'grid-cols-4': 'grid-cols-4',

  // Animations (UnoCSS)
  'animate-pulse': 'animate-pulse',
  'animate-spin': 'animate-spin',
  'animate-bounce': 'animate-bounce',
  'transition-all': 'transition-all',
  'duration-200': 'duration-200',
  'duration-300': 'duration-300',

  // States
  'hover:bg-gray-100': 'hover:bg-gray-100',
  'focus:outline-none': 'focus:outline-none',
  'disabled:opacity-50': 'disabled:opacity-50',
};

// Import statement replacements
const importReplacements = [
  // Remove shadcn imports
  {
    pattern: /import\s+.*?from\s+['"].*?shadcn.*?['"];?\n?/g,
    replacement: '',
  },
  // Replace Button imports
  {
    pattern: /import\s+{\s*Button\s*}\s+from\s+['"]\$lib\/components\/ui\/button['"];?/g,
    replacement: "import Button from '$lib/components/ui/nes-button.svelte';",
  },
  {
    pattern: /import\s+Button\s+from\s+['"]\$lib\/components\/ui\/Button\.svelte['"];?/g,
    replacement: "import Button from '$lib/components/ui/nes-button.svelte';",
  },
  // Replace Card imports
  {
    pattern: /import\s+{\s*Card[^}]*}\s+from\s+['"]\$lib\/components\/ui\/card['"];?/g,
    replacement: "import NesCard from '$lib/components/ui/nes-card.svelte';",
  },
  // Add NES.css import if not present
  {
    pattern: /^(<script[^>]*>)/m,
    replacement: "$1\n  import 'nes.css/css/nes.min.css';",
  },
];

// Process a single file
async function processFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let modified = false;

    // Apply import replacements
    for (const { pattern, replacement } of importReplacements) {
      const newContent = content.replace(pattern, replacement);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }

    // Replace class names
    for (const [oldClass, newClass] of Object.entries(classMapping)) {
      // Replace in class attributes
      const classPattern = new RegExp(`class=["'][^"']*\\b${oldClass}\\b[^"']*["']`, 'g');
      const matches = content.match(classPattern);
      if (matches) {
        matches.forEach((match) => {
          const newMatch = match.replace(new RegExp(`\\b${oldClass}\\b`, 'g'), newClass);
          content = content.replace(match, newMatch);
          modified = true;
        });
      }

      // Replace in class: directives
      const directivePattern = new RegExp(`class:${oldClass}=`, 'g');
      if (directivePattern.test(content)) {
        content = content.replace(directivePattern, `class:${newClass}=`);
        modified = true;
      }
    }

    // Replace component usage
    content = content.replace(/<Card\b/g, '<NesCard');
    content = content.replace(/<\/Card>/g, '</NesCard>');
    content = content.replace(/<CardHeader\b/g, '<div class="yorha-panel-header"');
    content = content.replace(/<\/CardHeader>/g, '</div>');
    content = content.replace(/<CardContent\b/g, '<div class="yorha-panel-content"');
    content = content.replace(/<\/CardContent>/g, '</div>');
    content = content.replace(/<CardTitle\b/g, '<h3 class="nes-text is-primary"');
    content = content.replace(/<\/CardTitle>/g, '</h3>');
    content = content.replace(/<CardDescription\b/g, '<p class="nes-text"');
    content = content.replace(/<\/CardDescription>/g, '</p>');

    // Update Button components
    content = content.replace(
      /<Button\s+variant=["']primary["']/g,
      '<button class="nes-btn is-primary"'
    );
    content = content.replace(/<Button\s+variant=["']secondary["']/g, '<button class="nes-btn"');
    content = content.replace(
      /<Button\s+variant=["']destructive["']/g,
      '<button class="nes-btn is-error"'
    );
    content = content.replace(/<Button\b(?![^>]*class=)/g, '<button class="nes-btn"');
    content = content.replace(/<\/Button>/g, '</button>');

    if (modified) {
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`✅ Converted: ${path.relative(process.cwd(), filePath)}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('🎮 Converting components to NES.css + bits-ui...\n');

  // Find all Svelte files
  const cwd = process.cwd();
  console.log('Current directory:', cwd);

  const files = await glob('src/**/*.svelte', {
    cwd: cwd,
    absolute: true,
  });

  console.log(`Found ${files.length} Svelte files to process\n`);

  let convertedCount = 0;
  for (const file of files) {
    const converted = await processFile(file);
    if (converted) convertedCount++;
  }

  console.log(`\n✨ Conversion complete! Modified ${convertedCount} files.`);
  console.log('\n📝 Next steps:');
  console.log('1. Run: npm install');
  console.log('2. Create NES.css wrapper components in src/lib/components/ui/');
  console.log('3. Test with: npm run dev:quic');
  console.log('4. Run Playwright tests: npm run test:e2e');
}

// Run if called directly
console.log('Script loaded, running main...');
main().catch(console.error);

export { processFile, classMapping };
