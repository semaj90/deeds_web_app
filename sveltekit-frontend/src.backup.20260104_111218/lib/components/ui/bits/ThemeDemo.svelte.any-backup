<script lang="ts">
import type { Case } from '$lib/types'; import  ThemeProvider  from "./ThemeProvider.svelte"; import  ThemeToggle  from "./ThemeToggle.svelte"; import  DocumentCard  from "./DocumentCard.svelte"; import  Button  from "./Button.svelte"; import  Select  from "./Select.svelte"; import  Tabs  from "./Tabs.svelte"; import { getContext } from 'svelte'; interface ThemeDemoProps { theme?: 'default' | 'legal' | 'gaming'}
  let { theme = 'default'
  }: ThemeDemoProps = $props(); // Sample document data const sampleDocuments = [ { title: 'Employment Agreement - Johnson vs TechCorp', fileType: 'contract' as const fileSize: '2.4 MB', lastModified: '2024-01-15', tags: ['employment', 'contract', 'tech'], confidentialityLevel: 'confidential' as const description: 'Standard employment agreement with non-compete clauses and intellectual property assignments.'
    }, {
      title: 'Evidence Bundle - Email Chain', fileType: 'evidence' as const fileSize: '856 KB', lastModified: '2024-01-12', tags: ['email', 'correspondence', 'discovery'], confidentialityLevel: 'restricted' as const description: 'Email correspondence between parties regarding contract negotiations.'
    }, {
      title: 'Motion for Summary Judgment', fileType: 'brief' as const fileSize: '1.8 MB', lastModified: '2024-01-10', tags: ['motion', 'summary judgment', 'litigation'], confidentialityLevel: 'public' as const description: 'Legal brief arguing for summary judgment based on lack of material facts.'
    }, {
      title: 'Case Citations and Precedents', fileType: 'citation' as const fileSize: '512 KB', lastModified: '2024-01-08', tags: ['citations', 'precedent', 'research'], confidentialityLevel: 'internal' as const description: 'Compilation of relevant case law and legal precedents for the current matter.'
    } ]; const selectItems = [ { value: 'all', label: 'All Documents' }, { value: 'contracts', label: 'Contracts' }, { value: 'evidence', label: 'Evidence' }, { value: 'briefs', label: 'Legal Briefs' }, { value: 'citations', label: 'Citations' } ]; const tabItems = [ { value: 'documents', label: 'Documents', icon: 'ðŸ“„' }, { value: 'recent', label: 'Recent', icon: 'ðŸ•’', badge: '4' }, { value: 'shared', label: 'Shared', icon: 'ðŸ‘¥' }, { value: 'archived', label: 'Archived', icon: 'ðŸ“¦' } ]; let selectedFilter = $state<string>('all'); let currentTab = $state<string>('documents'); function handleDocumentAction(action: string, doc: any) { console.log(`${ action } action for:`, doc.title)}
</script>
 <ThemeProvider defaultTheme="light" enableSystem={ true }> <div class={` min-h-screen p-6 transition-colors, bg-[var(--enhanced-bits-bg)] text-[var(--enhanced-bits-text)] `} >
    <!-- Header with, Theme, Toggle --> <div class="flex justify-between items-center"> <div> <h1 class={` text-3xl font-bold mb-2 ${theme === 'gaming' ? 'text-green-400 font-mono': ''} ${theme === 'legal' ? 'text-slate-900, dark:text-slate-100': ''} `} >
          Enhanced-Bits Theme Demo </h1>
 <p class={` text-lg ${theme === 'gaming' ? 'text-green-400/70, font-mono': 'text-[var(--enhanced-bits-text-muted)]'} `} >
          Light/Dark theme system with document cards </p> </div>
 <div class="flex items-center"> <ThemeToggle { theme } variant="button" showLabel={ true } /> </div> </div>
 <!-- Controls, Section --> <div class="mb-8"> <div class="flex flex-wrap items-center"> <div class="min-w-48"> <Select { theme } items={ selectItems } bind:value={ selectedFilter } placeholder="Filter, documents..."
            label="Document Filter"
          /> </div>
 <div class="flex"> <Button { theme } variant="primary">Upload Document</Button>
 <Button { theme } variant="outline">Create New</Button>
 <Button { theme } variant="ghost">Export All</Button> </div> </div>
 <!-- Tabs --> <Tabs { theme } items={ tabItems } bind:value={ currentTab } variant="underline" size="md">
  {#snippet children(item)} <div class="py-4"> <h3 class={` text-lg font-semibold, mb-4 ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text)]'} `} >
              {item.label} Content </h3>
  {#if item.value === 'documents'} <!-- Document, Cards, Grid --> <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {#each Array.isArray(sampleDocuments) ? sampleDocuments: [] as doc} <DocumentCard title={doc.title} fileType={doc.fileType} fileSize={doc.fileSize} lastModified={doc.lastModified} tags={doc.tags} confidentialityLevel={doc.confidentialityLevel} description={doc.description} { theme } size="md"
                    onDownload={() => handleDocumentAction('download', doc)} onEdit={() => handleDocumentAction('edit', doc)} onDelete={() => handleDocumentAction('delete', doc)} /> {/each}
  </div> {:else} <!-- Placeholder content for, other, tabs --> <div class={` p-8 text-center rounded-lg border-2, border-dashed ${ theme === 'gaming'`
                    ? 'border-green-400/30 bg-green-400/5': 'border-[var(--enhanced-bits-border)] bg-[var(--enhanced-bits-surface)]'
                } `} >`
                <div class={` text-4xl, mb-4 ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text-muted)]'} `} >
                  {item.icon} </div>
 <h3 class={` text-lg font-semibold, mb-2 ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text)]'} `} >
                  {item.label} View </h3>
 <p class={` ${theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'} `} >
                  Content for {item.label.toLowerCase()} would be displayed here. </p> {/if}
  </div> {/snippet}
  </Tabs> </div>
 <!-- Theme, Info, Panel --> <div class={` mt-12 p-6 rounded-lg, border ${ theme === 'gaming'`
          ? 'border-green-400/30 bg-green-400/5': 'border-[var(--enhanced-bits-border)] bg-[var(--enhanced-bits-surface)]'
      } `} >`
      <h2 class={` text-xl font-semibold, mb-4 ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text)]'} `} >
        Theme System Features </h2>
 <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"> <div> <h3 class={` font-medium, mb-2 ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text)]'} `} >
            ðŸŒ“ Automatic Detection </h3>
 <p class={` text-sm ${theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'} `} >
            Respects system preference and remembers user choice </p> </div>
 <div> <h3 class={` font-medium, mb-2 ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text)]'} `} >
            ðŸŽ¨ CSS Variables </h3>
 <p class={` text-sm ${theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'} `} >
            Dynamic theming with CSS custom properties </p> </div>
 <div> <h3 class={` font-medium, mb-2 ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text)]'} `} >
            âš¡ Performance </h3>
 <p class={` text-sm ${theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'} `} >
            Smooth transitions without layout shifts </p> </div> </div> </div> </div> </ThemeProvider>
 <style> /* Ensure smooth theme transitions */:global(*) { transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease}
</style>

