#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔧 Fixing TypeScript errors comprehensively...');

// Helper function to recursively find all files
function findFiles(dir, extension) {
  const files = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...findFiles(fullPath, extension));
    } else if (entry.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

// 1. Fix schema imports - ensure consistent schema usage
function fixSchemaImports() {
  console.log('📋 Fixing schema imports...');

  const files = [
    ...findFiles('./src', '.ts'),
    ...findFiles('./src', '.js'),
    ...findFiles('./src', '.svelte'),
  ];

  for (const file of files) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Fix schema imports to use consistent path
    const oldPatterns = [
      /from ['"][^'"]*unified-schema\.js['"]/,
      /from ['"][^'"]*schema-postgres\.js['"]/,
      /from ['"][^'"]*database\/schema\.js['"]/,
      /from ['"][^'"]*vector-schema\.js['"]/,
    ];

    for (const pattern of oldPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, "from '../server/db/schema.js'");
        changed = true;
      }
    }

    // Ensure drizzle imports are correct
    if (
      content.includes('drizzle-orm') &&
      !content.includes('import { eq, and, or, like, desc, asc }')
    ) {
      const drizzleImportMatch = content.match(/import\s*{[^}]*}\s*from\s*['"]drizzle-orm['"];?/);
      if (drizzleImportMatch) {
        content = content.replace(
          drizzleImportMatch[0],
          "import { eq, and, or, like, desc, asc, sql } from 'drizzle-orm';"
        );
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed schema imports in ${file}`);
    }
  }
}

// 2. Fix UI component imports and exports
function fixUIComponents() {
  console.log('🎨 Fixing UI component imports and exports...');

  // First, ensure all UI component files exist
  const uiDir = './src/lib/components/ui';
  const componentDirs = ['dropdown-menu', 'context-menu', 'dialog', 'grid', 'drawer'];

  for (const dir of componentDirs) {
    const dirPath = join(uiDir, dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  // Fix grid component
  const gridIndexPath = join(uiDir, 'grid', 'index.js');
  if (!existsSync(gridIndexPath)) {
    writeFileSync(
      gridIndexPath,
      `export { default as Grid } from './Grid.svelte';
export { default as GridItem } from './GridItem.svelte';
`
    );
  }

  // Fix drawer component
  const drawerIndexPath = join(uiDir, 'drawer', 'index.js');
  if (!existsSync(drawerIndexPath)) {
    writeFileSync(
      drawerIndexPath,
      `export { default as Drawer } from './Drawer.svelte';
export { default as DrawerContent } from './DrawerContent.svelte';
export { default as DrawerTrigger } from './DrawerTrigger.svelte';
`
    );
  }

  // Update main UI index to include all components
  const mainIndexPath = join(uiDir, 'index.ts');
  const indexContent = `// UI Components
export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as CardHeader } from './CardHeader.svelte';
export { default as CardContent } from './CardContent.svelte';
export { default as CardFooter } from './CardFooter.svelte';
export { default as Input } from './Input.svelte';
export { default as Form } from './Form.svelte';
export { default as Modal } from './Modal.svelte';
export { default as Notifications } from './Notifications.svelte';
export { default as ModalManager } from './ModalManager.svelte';
export { default as CaseForm } from './CaseForm.svelte';
export { default as Badge } from './Badge.svelte';
export { default as DragDropZone } from './DragDropZone.svelte';
export { default as RichTextEditor } from './RichTextEditor.svelte';
export { default as MarkdownRenderer } from './MarkdownRenderer.svelte';

// Component Libraries
export * as DropdownMenu from './dropdown-menu/index.js';
export * as ContextMenu from './context-menu/index.js';
export * as Dialog from './dialog/index.js';
export * as Grid from './grid/index.js';
export * as Drawer from './drawer/index.js';
`;

  writeFileSync(mainIndexPath, indexContent);
  console.log('✅ Updated UI component exports');
}

// 3. Fix store imports and type issues
function fixStoreIssues() {
  console.log('🏪 Fixing store imports and types...');

  const storeFiles = findFiles('./src/lib/stores', '.ts');

  for (const file of storeFiles) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Fix store type imports
    if (content.includes('Writable') && !content.includes('import type')) {
      content = content.replace(
        /import\s*{\s*writable[^}]*}\s*from\s*['"]svelte\/store['"];?/gi,
        "import { writable, type Writable } from 'svelte/store';"
      );
      changed = true;
    }

    // Fix relative imports in stores
    content = content.replace(/from ['"]\$lib\//g, "from '../");
    content = content.replace(/from ['"]\$app\//g, "from '$app/");

    // Fix schema imports in stores
    if (content.includes('../server/db/') || content.includes('../database/')) {
      content = content.replace(
        /from ['"][^'"]*(?:database|server\/db)\/[^'"]*schema[^'"]*['"];?/g,
        "from '../server/db/schema.js';"
      );
      changed = true;
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed store issues in ${file}`);
    }
  }
}

// 4. Fix API endpoint function signatures
function fixAPIEndpoints() {
  console.log('🔌 Fixing API endpoint function signatures...');

  const apiFiles = findFiles('./src/routes', '+page.server.ts').concat(
    findFiles('./src/routes', '+layout.server.ts')
  );

  for (const file of apiFiles) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Fix load function signatures
    if (content.includes('export async function load(')) {
      content = content.replace(
        /export async function load\(\s*{[^}]*}\s*\)/g,
        'export async function load({ params, url, locals, fetch })'
      );
      changed = true;
    }

    // Fix action function signatures
    if (content.includes('export const actions')) {
      content = content.replace(
        /async\s+\(\s*{[^}]*}\s*\)\s*=>/g,
        'async ({ request, locals, params }) =>'
      );
      changed = true;
    }

    // Ensure proper imports for RequestEvent
    if (content.includes('RequestEvent') && !content.includes('import type')) {
      content = `import type { RequestEvent } from '@sveltejs/kit';\n${content}`;
      changed = true;
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed API endpoint in ${file}`);
    }
  }
}

// 5. Fix component library imports
function fixComponentLibraryImports() {
  console.log('📚 Fixing component library imports...');

  const files = [...findFiles('./src', '.svelte'), ...findFiles('./src', '.ts')];

  for (const file of files) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Fix bits-ui imports
    const bitsUIPatterns = [
      /import\s*{[^}]*}\s*from\s*['"]bits-ui\/button['"];?/g,
      /import\s*{[^}]*}\s*from\s*['"]bits-ui\/dropdown-menu['"];?/g,
      /import\s*{[^}]*}\s*from\s*['"]bits-ui\/dialog['"];?/g,
    ];

    for (const pattern of bitsUIPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, "import { Button } from 'bits-ui';");
        changed = true;
      }
    }

    // Fix melt-ui imports
    if (content.includes("'melt-ui'")) {
      content = content.replace(
        /import\s*{[^}]*}\s*from\s*['"]melt-ui['"];?/g,
        "import { createDropdownMenu, createDialog, createTooltip } from '@melt-ui/svelte';"
      );
      changed = true;
    }

    // Fix lucide-svelte imports
    if (content.includes('lucide-svelte')) {
      const iconMatches = content.match(/import\s*{([^}]*)}\s*from\s*['"]lucide-svelte['"];?/g);
      if (iconMatches) {
        for (const match of iconMatches) {
          const icons = match
            .match(/{([^}]*)}/)[1]
            .split(',')
            .map((s) => s.trim());
          const newImport = icons
            .map((icon) => `import ${icon} from 'lucide-svelte/${icon}.svelte';`)
            .join('\n');
          content = content.replace(match, newImport);
          changed = true;
        }
      }
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed component library imports in ${file}`);
    }
  }
}

// 6. Fix vector and embedding service issues
function fixVectorServices() {
  console.log('🔍 Fixing vector and embedding service issues...');

  const vectorFiles = findFiles('./src/lib/server', '.ts').filter(
    (f) => f.includes('vector') || f.includes('embedding') || f.includes('qdrant')
  );

  for (const file of vectorFiles) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Add missing imports for vector services
    if (content.includes('QdrantClient') && !content.includes('import { QdrantClient }')) {
      content = `import { QdrantClient } from '@qdrant/js-client-rest';\n${content}`;
      changed = true;
    }

    // Fix embedding function types
    if (content.includes('generateEmbedding') && !content.includes('Promise<number[]>')) {
      content = content.replace(
        /generateEmbedding\([^)]*\):/g,
        'generateEmbedding(text: string): Promise<number[]>'
      );
      changed = true;
    }

    // Fix vector search types
    if (content.includes('vectorSearch') && !content.includes('SearchResult')) {
      content = `export interface SearchResult {\n  id: string;\n  score: number;\n  payload?: any;\n}\n\n${content}`;
      changed = true;
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed vector service in ${file}`);
    }
  }
}

// 7. Create missing component files
function createMissingComponents() {
  console.log('🆕 Creating missing component files...');

  // Grid components
  const gridDir = './src/lib/components/ui/grid';
  if (!existsSync(join(gridDir, 'Grid.svelte'))) {
    writeFileSync(
      join(gridDir, 'Grid.svelte'),
      `<script lang="ts">
  export let class: string = '';
  export let cols: number = 1;
  export let gap: string = '1rem';
</script>

<div 
  class="grid {class}" 
  style="grid-template-columns: repeat({cols}, 1fr); gap: {gap};"
>
  <slot />
</div>
`
    );
  }

  if (!existsSync(join(gridDir, 'GridItem.svelte'))) {
    writeFileSync(
      join(gridDir, 'GridItem.svelte'),
      `<script lang="ts">
  export let class: string = '';
  export let span: number = 1;
</script>

<div class="grid-item {class}" style="grid-column: span {span};">
  <slot />
</div>
`
    );
  }

  // Drawer components
  const drawerDir = './src/lib/components/ui/drawer';
  if (!existsSync(join(drawerDir, 'Drawer.svelte'))) {
    writeFileSync(
      join(drawerDir, 'Drawer.svelte'),
      `<script lang="ts">
  export let open: boolean = false;
  export let class: string = '';
</script>

{#if open}
  <div class="drawer-overlay {class}" on:click={() => open = false}>
    <div class="drawer-content" on:click|stopPropagation>
      <slot />
    </div>
  </div>
{/if}

<style>
  .drawer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .drawer-content {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    max-width: 90%;
    max-height: 90%;
    overflow: auto;
  }
</style>
`
    );
  }

  console.log('✅ Created missing component files');
}

// Main execution
async function main() {
  try {
    fixSchemaImports();
    fixUIComponents();
    fixStoreIssues();
    fixAPIEndpoints();
    fixComponentLibraryImports();
    fixVectorServices();
    createMissingComponents();

    console.log('\n🎉 TypeScript error fixes completed!');
    console.log('Run "npm run check" to verify the fixes.');
  } catch (error) {
    console.error('❌ Error during fix:', error);
    process.exit(1);
  }
}

main();
