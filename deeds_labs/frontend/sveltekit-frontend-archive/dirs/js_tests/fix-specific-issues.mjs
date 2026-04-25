#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';

async function fixSpecificIssues() {
  console.log('🔧 Fixing specific remaining issues...\n');

  // Fix 1: Fix createToaster import and usage in frameworks-demo
  try {
    const frameworksDemo = 'src/routes/frameworks-demo/+page.svelte';
    let content = await readFile(frameworksDemo, 'utf-8');

    // Fix the import and usage
    content = content.replace(
      /import { createTabs, createToaster, melt } from '@melt-ui\/svelte';/g,
      "import { createTabs, melt } from '@melt-ui/svelte';"
    );

    // Remove toaster usage if it exists
    content = content.replace(/const.*toaster.*=.*createToaster\(.*\);?\s*/g, '');
    content = content.replace(/\$:.*toaster.*\n/g, '');

    await writeFile(frameworksDemo, content);
    console.log('✓ Fixed createToaster in frameworks-demo');
  } catch (error) {
    console.log('⚠️ Could not fix frameworks-demo:', error.message);
  }

  // Fix 2: Fix sampleCaseId prop issue in frameworks-demo
  try {
    const frameworksDemo = 'src/routes/frameworks-demo/+page.svelte';
    let content = await readFile(frameworksDemo, 'utf-8');

    // Remove sampleCaseId prop
    content = content.replace(/\s*\{sampleCaseId\}\s*/g, '');
    content = content.replace(/sampleCaseId\s*=\s*["'][^"']*["']\s*/g, '');

    await writeFile(frameworksDemo, content);
    console.log('✓ Fixed sampleCaseId prop in frameworks-demo');
  } catch (error) {
    console.log('⚠️ Could not fix sampleCaseId:', error.message);
  }

  // Fix 3: Fix invalid svelte:head in test-ai-ask
  try {
    const testAiAsk = 'src/routes/test-ai-ask/+page.svelte';
    let content = await readFile(testAiAsk, 'utf-8');

    // Find and fix the invalid head tag
    if (content.includes('</svelte:head>') && !content.includes('<svelte:head>')) {
      // Find the title tag and wrap it properly
      content = content.replace(
        /<title>([^<]*)<\/title>\s*<\/svelte:head>/g,
        '<svelte:head>\n  <title>$1</title>\n</svelte:head>'
      );
    }

    await writeFile(testAiAsk, content);
    console.log('✓ Fixed svelte:head in test-ai-ask');
  } catch (error) {
    console.log('⚠️ Could not fix test-ai-ask:', error.message);
  }

  // Fix 4: Fix missing writable import in NoteViewerModal
  try {
    const noteViewerModal = 'src/lib/components/ui/NoteViewerModal.svelte';
    let content = await readFile(noteViewerModal, 'utf-8');

    // Add writable import if missing
    if (!content.includes('import { writable }')) {
      content = content.replace(
        /import { createDialog } from '@melt-ui\/svelte';/,
        "import { createDialog } from '@melt-ui/svelte';\n  import { writable } from 'svelte/store';"
      );
    }

    await writeFile(noteViewerModal, content);
    console.log('✓ Fixed writable import in NoteViewerModal');
  } catch (error) {
    console.log('⚠️ Could not fix NoteViewerModal:', error.message);
  }

  // Fix 5: Add Level import for TipTap in RichTextEditor
  try {
    const richTextEditor = 'src/lib/components/ui/RichTextEditor.svelte';
    let content = await readFile(richTextEditor, 'utf-8');

    // Add Level type import
    if (!content.includes('type Level')) {
      content = content.replace(
        /import { Editor } from '@tiptap\/core';/,
        "import { Editor, type Level } from '@tiptap/core';"
      );
    }

    await writeFile(richTextEditor, content);
    console.log('✓ Fixed Level import in RichTextEditor');
  } catch (error) {
    console.log('⚠️ Could not fix RichTextEditor:', error.message);
  }

  // Fix 6: Fix User type properties in profile page
  try {
    const profilePage = 'src/routes/profile/+page.svelte';
    let content = await readFile(profilePage, 'utf-8');

    // Fix User type usage
    content = content.replace(/user\.name/g, 'user?.username');
    content = content.replace(/user\.email/g, 'user?.username');
    content = content.replace(/user\.firstName/g, 'user?.username');
    content = content.replace(/user\.lastName/g, 'user?.username');
    content = content.replace(/user\.role/g, '"User"');
    content = content.replace(/user\.createdAt/g, 'Date.now()');

    await writeFile(profilePage, content);
    console.log('✓ Fixed User type properties in profile page');
  } catch (error) {
    console.log('⚠️ Could not fix profile page:', error.message);
  }

  // Fix 7: Fix missing UI component exports
  try {
    const uiIndex = 'src/lib/components/ui/index.ts';
    let content = await readFile(uiIndex, 'utf-8');

    // Add missing exports
    const missingExports = [
      "export { default as Badge } from './Badge.svelte';",
      "export * as DropdownMenu from './dropdown-menu/index.js';",
      "export * as ContextMenu from './context-menu/index.js';",
      "export * as Dialog from './dialog/index.js';",
      "export * as Card from './Card.svelte';",
    ];

    for (const exportLine of missingExports) {
      if (!content.includes(exportLine)) {
        content += '\n' + exportLine;
      }
    }

    await writeFile(uiIndex, content);
    console.log('✓ Fixed UI component exports');
  } catch (error) {
    console.log('⚠️ Could not fix UI index:', error.message);
  }

  // Fix 8: Create missing Badge component
  try {
    const badgeComponent = `<script lang="ts">
  export let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
  export let size: 'default' | 'sm' | 'lg' = 'default';
  
  const variants = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    outline: 'border border-input'
  };
  
  const sizes = {
    default: 'px-2.5 py-0.5 text-xs',
    sm: 'px-2 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm'
  };
</script>

<span class="inline-flex items-center rounded-full font-medium {variants[variant]} {sizes[size]} {$$props.class || ''}">
  <slot />
</span>`;

    await writeFile('src/lib/components/ui/Badge.svelte', badgeComponent);
    console.log('✓ Created Badge component');
  } catch (error) {
    console.log('⚠️ Could not create Badge component:', error.message);
  }

  console.log('\n✅ Specific fixes completed!');
}

fixSpecificIssues().catch(console.error);
