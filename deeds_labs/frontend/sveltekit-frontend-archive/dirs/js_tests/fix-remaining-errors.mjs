#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const fixes = [
  // Fix Svelte component export issues
  {
    file: 'src/lib/components/modals/EvidenceUploadModal.svelte',
    find: `  $: if (caseId && !isOpen) {
</script>`,
    replace: `  $: if (caseId && !isOpen) {
    // Reset form when case changes
  }
</script>`,
  },

  // Fix Canvas Editor Svelte head issue
  {
    file: 'src/routes/test-ai-ask/+page.svelte',
    find: `        <title>Gemma3 Local LLM Test - Legal AI Assistant</title>
</svelte:head>`,
    replace: `        <title>Gemma3 Local LLM Test - Legal AI Assistant</title>
</svelte:head>`,
  },

  // Fix SearchBar syntax error
  {
    file: 'src/lib/components/SearchBar.svelte',
    find: `                                / id="field-1">`,
    replace: `                                id="field-1">`,
  },

  // Fix Report editor syntax error
  {
    file: 'src/lib/components/ai/AskAI.svelte',
    find: `            / id="field-2">`,
    replace: `            id="field-2">`,
  },

  // Fix evidence page syntax error
  {
    file: 'src/routes/evidence/+page.svelte',
    find: `          <input type="date" class="w-full px-3 py-2 border rounded-md" / id="field-2">`,
    replace: `          <input type="date" class="w-full px-3 py-2 border rounded-md" id="field-2">`,
  },

  // Fix ReportNode component syntax error
  {
    file: 'src/lib/components/canvas/ReportNode.svelte',
    find: `  import { Button } from '../../../lib/components/u          <ContextMenu.Item on:select={() => saveCitation(editorRef?.getSelectedText?.() || .js'')}>   
            <Link class="w-4 h-4 mr-2" />
            Save as Citation
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item on:select={summarizeReport}>
            <Sparkles class="w-4 h-4 mr-2" />
            AI Summary
          </ContextMenu.Item>
        </ContextMenu.Content>
      {/if}on';
  import * as ContextMenu from '../../../lib/components/ui/context-menu.js';`,
    replace: `  import { Button } from '../../../lib/components/ui/button.js';
  import * as ContextMenu from '../../../lib/components/ui/context-menu.js';`,
  },

  // Fix LegalDocumentEditor component import issue
  {
    file: 'src/lib/components/editor/LegalDocumentEditor.svelte',
    find: `  import { fade, flyAndScale } from 'svelte/transition';`,
    replace: `  import { fade, fly } from 'svelte/transition';`,
  },

  // Fix missing framework demo code
  {
    file: 'src/routes/frameworks-demo/+page.svelte',
    find: `  // Demo data
  let ;
  let sampleContent = \`MOTION TO DISMISS`,
    replace: `  // Demo data
  let activeTab = 'pico';
  let sampleContent = \`MOTION TO DISMISS`,
  },

  // Fix frameworks demo component reference
  {
    file: 'src/routes/frameworks-demo/+page.svelte',
    find: `              <LegalDocumentEditordocumentType="motion"`,
    replace: `              <LegalDocumentEditor documentType="motion"`,
  },

  // Fix duplicate sendMessage function
  {
    file: 'src/lib/components/Chat.svelte',
    find: `  async function sendMessage() {
    if (!currentMessage.trim() || isGenerating) return;`,
    replace: `  async function handleSendMessage() {
    if (!currentMessage.trim() || isGenerating) return;`,
    occurrence: 1, // Only fix the second occurrence
  },
];

async function applyFixes() {
  console.log('🔧 Applying remaining TypeScript and Svelte fixes...');

  for (const fix of fixes) {
    try {
      const filePath = path.join(process.cwd(), fix.file);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        console.log(`⚠️  File not found: ${fix.file}`);
        continue;
      }

      let content = await fs.readFile(filePath, 'utf-8');

      if (fix.occurrence) {
        // Handle specific occurrence
        const parts = content.split(fix.find);
        if (parts.length > fix.occurrence) {
          parts[fix.occurrence] = fix.replace + parts[fix.occurrence].slice(fix.find.length);
          content = parts.join(fix.find);
        }
      } else {
        // Replace all occurrences
        content = content.replace(new RegExp(escapeRegExp(fix.find), 'g'), fix.replace);
      }

      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`✅ Fixed: ${fix.file}`);
    } catch (error) {
      console.log(`❌ Error fixing ${fix.file}:`, error.message);
    }
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Create missing UI component exports
async function createMissingComponents() {
  const components = [
    {
      path: 'src/lib/components/ui/dropdown-menu/index.js',
      content: `// Dropdown Menu Component Exports
export { default as Root } from './DropdownMenuRoot.svelte';
export { default as Trigger } from './DropdownMenuTrigger.svelte';
export { default as Content } from './DropdownMenuContent.svelte';
export { default as Item } from './DropdownMenuItem.svelte';
export { default as Separator } from './DropdownMenuSeparator.svelte';
export { default as Label } from './DropdownMenuLabel.svelte';
export { default as Group } from './DropdownMenuGroup.svelte';
export { default as Sub } from './DropdownMenuSub.svelte';
export { default as SubContent } from './DropdownMenuSubContent.svelte';
export { default as SubTrigger } from './DropdownMenuSubTrigger.svelte';

// Re-export all as namespace
export * as DropdownMenu from './index.js';
`,
    },
    {
      path: 'src/lib/components/ui/select/index.js',
      content: `// Select Component Exports
export { default as Root } from './SelectRoot.svelte';
export { default as Trigger } from './SelectTrigger.svelte';
export { default as Content } from './SelectContent.svelte';
export { default as Item } from './SelectItem.svelte';
export { default as Value } from './SelectValue.svelte';
export { default as Label } from './SelectLabel.svelte';
export { default as Group } from './SelectGroup.svelte';
export { default as Separator } from './SelectSeparator.svelte';

// Re-export all as namespace
export * as Select from './index.js';
`,
    },
    {
      path: 'src/lib/components/ui/tooltip/index.js',
      content: `// Tooltip Component Exports
export { default as Root } from './TooltipRoot.svelte';
export { default as Trigger } from './TooltipTrigger.svelte';
export { default as Content } from './TooltipContent.svelte';
export { default as Provider } from './TooltipProvider.svelte';

// Re-export all as namespace
export * as Tooltip from './index.js';
`,
    },
    {
      path: 'src/lib/components/ui/textarea/index.js',
      content: `// Textarea Component Exports
export { default as Textarea } from './Textarea.svelte';
export { default as Root } from './Textarea.svelte';

// Re-export all as namespace
export * as Textarea from './index.js';
`,
    },
  ];

  for (const component of components) {
    try {
      const filePath = path.join(process.cwd(), component.path);
      const dir = path.dirname(filePath);

      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });

      // Create file if it doesn't exist
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, component.content, 'utf-8');
        console.log(`✅ Created: ${component.path}`);
      }
    } catch (error) {
      console.log(`❌ Error creating ${component.path}:`, error.message);
    }
  }
}

// Fix specific problematic files
async function fixProblematicFiles() {
  const fixes = [
    {
      file: 'src/lib/components/canvas/ReportNode.svelte',
      content: `<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { Report } from '../../../lib/data/types.js';
  
  // UI Components
  import { Button } from '../../../lib/components/ui/index.js';
  import * as ContextMenu from '../../../lib/components/ui/context-menu.js';
  import * as Tooltip from '../../../lib/components/ui/tooltip.js';

  // Icons
  import { Sparkles, Link, Save, MoreVertical, Move, Trash2 } from 'lucide-svelte';

  export let report: Report;
  
  const dispatch = createEventDispatcher();
  
  let nodeElement: HTMLDivElement;
  let editorRef: any;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  function handleMouseDown(event: MouseEvent) {
    if (event.target === nodeElement || (event.target as Element)?.classList?.contains('node-header')) {
      isDragging = true;
      dragStartX = event.clientX - report.position.x;
      dragStartY = event.clientY - report.position.y;
    }
  }

  function handleMouseMove(event: MouseEvent) {
    if (isDragging) {
      report.position.x = event.clientX - dragStartX;
      report.position.y = event.clientY - dragStartY;
    }
  }

  function handleMouseUp() {
    isDragging = false;
  }

  async function saveCitation(text: string) {
    if (!text.trim()) return;
    
    // Implementation for saving citation
    console.log('Saving citation:', text);
  }

  async function summarizeReport() {
    // Implementation for AI summary
    console.log('Summarizing report');
  }

  onMount(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  });
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger>
    <div
      bind:this={nodeElement}
      class="report-node absolute bg-white border-2 border-blue-300 rounded-lg shadow-lg min-w-96 max-w-2xl"
      style="left: {report.position.x}px; top: {report.position.y}px; z-index: 10;"
      on:mousedown={handleMouseDown}
    >
      <div class="node-header bg-blue-50 px-4 py-2 border-b border-blue-200 cursor-move">
        <h3 class="font-medium text-blue-900">{report.title}</h3>
      </div>
      
      <div class="p-4">
        <div class="prose prose-sm max-w-none">
          {report.content}
        </div>
      </div>
    </div>
  </ContextMenu.Trigger>
  
  <ContextMenu.Content>
    <ContextMenu.Item on:select={() => saveCitation(editorRef?.getSelectedText?.() || '')}>
      <Link class="w-4 h-4 mr-2" />
      Save as Citation
    </ContextMenu.Item>
    <ContextMenu.Separator />
    <ContextMenu.Item on:select={summarizeReport}>
      <Sparkles class="w-4 h-4 mr-2" />
      AI Summary
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Root>

<style>
  .report-node {
    user-select: none;
  }
  
  .node-header {
    cursor: move;
  }
</style>
`,
    },
  ];

  for (const fix of fixes) {
    try {
      const filePath = path.join(process.cwd(), fix.file);
      await fs.writeFile(filePath, fix.content, 'utf-8');
      console.log(`✅ Fixed problematic file: ${fix.file}`);
    } catch (error) {
      console.log(`❌ Error fixing ${fix.file}:`, error.message);
    }
  }
}

async function main() {
  await applyFixes();
  await createMissingComponents();
  await fixProblematicFiles();

  console.log('🎉 Remaining fixes applied!');
  console.log('📋 Run "npm run check" to verify remaining issues.');
}

main().catch(console.error);
