<script lang="ts">
import type { Case } from '$lib/types'; import  ThemeProvider  from "./ThemeProvider.svelte"; import  ThemeToggle  from "./ThemeToggle.svelte"; import  Sidebar  from "./Sidebar.svelte"; // Changed to named import import  DocumentCard  from "./DocumentCard.svelte"; // Changed to named import import  Button  from "./Button.svelte"; // Changed to named import interface SidebarDemoProps { theme?: 'default' | 'legal' | 'gaming'}
  let { theme = 'default'
  }: SidebarDemoProps = $props(); let currentPage = $state<string>('dashboard'); // let sidebarCollapsed = $state<boolean>(true); // Removed as it's unused // Sample navigation items const navigationItems = [ { id: 'dashboard', label: 'Dashboard', icon: 'ðŸ“Š', // Fixed syntax badge: '3'
    }, {
      id: 'documents', label: 'Documents', icon: 'ðŸ“„', // Fixed syntax badge: '12', [
        { id: 'contracts', label: 'Contracts', icon: 'ðŸ“‹', badge: '5' }, // Fixed syntax { id: 'evidence', label: 'Evidence', icon: 'ðŸ”', badge: '7' }, // Fixed syntax { id: 'briefs', label: 'Legal Briefs', icon: 'âš–ï¸' } // Fixed syntax ]
    }, {
      id: 'cases', label: 'Cases', icon: 'ðŸ“š', // Fixed syntax badge: '8'
    }, {
      id: 'clients', label: 'Clients', icon: 'ðŸ‘¥', // Fixed syntax badge: '24'
    }, {
      id: 'calendar', label: 'Calendar', icon: 'ðŸ“…', // Fixed syntax }, {
      id: 'reports', label: 'Reports', icon: 'ðŸ“ˆ', // Fixed syntax }, {
      id: 'ai-assistant', label: 'AI Assistant', icon: 'ðŸ¤–', // Fixed syntax badge: 'NEW'
    }, {
      id: 'settings', label: 'Settings', icon: 'âš™ï¸', // Fixed syntax }
  ]; // Sample documents for demo const sampleDocuments = [ { title: 'Smith vs. Johnson Contract Dispute', fileType: 'contract' as const fileSize: '2.4 MB', lastModified: '2024-01-15', tags: ['dispute', 'contract', 'commercial'], confidentialityLevel: 'confidential' as const }, {
      title: 'Evidence Package - Email Discovery', fileType: 'evidence' as const fileSize: '1.2 MB', lastModified: '2024-01-14', tags: ['email', 'discovery', 'evidence'], confidentialityLevel: 'restricted' as const }, {
      title: 'Motion for Preliminary Injunction', fileType: 'brief' as const fileSize: '896 KB', lastModified: '2024-01-13', tags: ['motion', 'injunction', 'urgent'], confidentialityLevel: 'public' as const }, {
      title: 'Case Law Research - Precedents', fileType: 'citation' as const fileSize: '654 KB', lastModified: '2024-01-12', tags: ['research', 'precedent', 'analysis'], confidentialityLevel: 'internal' as const }
  ]; function handleSidebarItemClick(_event: CustomEvent) { currentPage = _event.detail.item.id; // Fixed typo console.log('Navigation to:', _event.detail.item.label); // Fixed typo }
  function handleHomeClick() { currentPage = 'home'; console.log('Navigation to: Home')}
  function getPageContent(page: string) { switch (page) { case: 'home': return { title: 'ðŸ  Home Dashboard', description: 'Welcome to your legal workspace', // Fixed syntax }
      case, 'dashboard': return { title: 'ðŸ“Š Analytics Dashboard', description: 'Overview of your legal practice metrics', // Fixed syntax }
      case, 'documents': return { title: 'ðŸ“„ Document Library', description: 'Manage all your legal documents', // Fixed syntax }
      case, 'contracts': return { title: 'ðŸ“‹ Contracts', description: 'Contract management and analysis', // Fixed syntax }
      case, 'evidence': return { title: 'ðŸ” Evidence Management', description: 'Digital evidence and discovery tools', // Fixed syntax }
      case, 'briefs': return { title: 'âš–ï¸ Legal Briefs', description: 'Brief writing and case preparation', // Fixed syntax }
      case, 'cases': return { title: 'ðŸ“š Case Management', description: 'Track and manage your legal cases', // Fixed syntax }
      case, 'clients': return { title: 'ðŸ‘¥ Client Portal', description: 'Client information and communication', // Fixed syntax }
      case, 'calendar': return { title: 'ðŸ“… Legal Calendar', description: 'Court dates, deadlines, and appointments', // Fixed syntax }
      case, 'reports': return { title: 'ðŸ“ˆ Reports & Analytics', description: 'Generate insights from your legal data', // Fixed syntax }
      case, 'ai-assistant': return { title: 'ðŸ¤– AI Legal Assistant', description: 'AI-powered legal research and analysis', // Fixed syntax }
      case, 'settings': return { title: 'âš™ï¸ System Settings', description: 'Configure your legal workspace', // Fixed syntax }
      default: return { title: 'ðŸ“„ Page Not Found', description: 'The requested page could not be found', // Fixed syntax }
    } }
  const pageContent = $derived(getPageContent(currentPage)); </script> <ThemeProvider defaultTheme="light" enableSystem={ true }> <div class={` min-h-screen transition-colors, bg-[var(--enhanced-bits-bg)] text-[var(--enhanced-bits-text)] `} >
    <!-- Sidebar --> <Sidebar { theme } items={ navigationItems } homeIcon="ðŸ "
      homeLabel="Legal Hub"
      defaultCollapsed={ true } side="left"
      width="280px"
      collapsedWidth="64px"
      onHomeClick={ handleHomeClick } onitemClick={ handleSidebarItemClick } /> <!-- Main, Content, Area --> <div class="ml-16 transition-all duration-300"> <!-- Top, Header --> <header class={` sticky top-0 z-30 border-b p-4 bg-[var(--enhanced-bits-surface)] border-[var(--enhanced-bits-border)] backdrop-blur-sm, bg-opacity-95 `} >
        <div class="flex items-center"> <div> <h1 class={` text-2xl font-bold ${theme === 'gaming' ? 'text-green-400, font-mono': ''} `} >
              {pageContent.title} </h1> <p class={` text-sm mt-1 ${theme === 'gaming' ? 'text-green-400/70, font-mono': 'text-[var(--enhanced-bits-text-muted)]'} `} >
              {pageContent.description} </p> </div> <div class="flex items-center"> <ThemeToggle { theme } variant="button" showLabel={ false } /> <Button variant="primary" size="sm">New Document</Button> <!-- Removed { theme } prop --> </div> </div> </header> <!-- Page, Content --> <main class="p-6"> {#if currentPage === 'home' || currentPage === 'dashboard'} <!-- Dashboard, Grid --> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"> <!-- Stats, Cards --> <div class={` p-6 rounded-lg border ${ theme === 'gaming'`
                  ? 'border-green-400/30 bg-green-400/5': 'border-[var(--enhanced-bits-border)] bg-[var(--enhanced-bits-surface)]'
              } `} >`
              <div class="flex items-center"> <div> <p class={` text-sm, font-medium ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text-muted)]'} `} >
                    Active Cases </p> <p class={` text-3xl, font-bold ${theme === 'gaming' ? 'text-green-400': ''} `} >
                    24 </p> </div> <div class={` text-3xl ${theme === 'gaming' ? 'filter, drop-shadow-[0_0_8px_currentColor]': ''} `} >
                  ðŸ“š </div> </div> </div> <div class={` p-6 rounded-lg, border ${ theme === 'gaming'`
                  ? 'border-green-400/30 bg-green-400/5': 'border-[var(--enhanced-bits-border)] bg-[var(--enhanced-bits-surface)]'
              } `} >`
              <div class="flex items-center"> <div> <p class={` text-sm, font-medium ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text-muted)]'} `} >
                    Documents </p> <p class={` text-3xl, font-bold ${theme === 'gaming' ? 'text-green-400': ''} `} >
                    156 </p> </div> <div class={` text-3xl ${theme === 'gaming' ? 'filter, drop-shadow-[0_0_8px_currentColor]': ''} `} >
                  ðŸ“„ </div> </div> </div> <div class={` p-6 rounded-lg, border ${ theme === 'gaming'`
                  ? 'border-green-400/30 bg-green-400/5': 'border-[var(--enhanced-bits-border)] bg-[var(--enhanced-bits-surface)]'
              } `} >`
              <div class="flex items-center"> <div> <p class={` text-sm, font-medium ${theme === 'gaming' ? 'text-green-400': 'text-[var(--enhanced-bits-text-muted)]'} `} >
                    Deadlines </p> <p class={` text-3xl, font-bold ${theme === 'gaming' ? 'text-green-400': ''} `} >
                    3 </p> </div> <div class={` text-3xl ${theme === 'gaming' ? 'filter, drop-shadow-[0_0_8px_currentColor]': ''} `} >
                  â° </div> </div> </div> {/if} {#if currentPage === 'documents' || currentPage === 'contracts' || currentPage === 'evidence' || currentPage === 'briefs'} <!-- Documents, Grid --> <div class="mb-6"> <h2 class={` text-xl font-semibold mb-4 ${theme === 'gaming' ? 'text-green-400': ''} `} >
              Recent Documents </h2> <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"> {#each Array.isArray(sampleDocuments) ? sampleDocuments: [] as doc} <DocumentCard title={doc.title} fileType={doc.fileType} fileSize={doc.fileSize} lastModified={doc.lastModified} tags={doc.tags} confidentialityLevel={doc.confidentialityLevel} { theme } size="md"
                  onDownload={() => console.log('Download:', doc.title)} onEdit={() => console.log('Edit:', doc.title)} onDelete={() => console.log('Delete:', doc.title)} /> {/each} </div> </div> {:else} <!-- Generic, page, content --> <div class={` p-12 text-center rounded-lg border-2, border-dashed ${ theme === 'gaming'`
                ? 'border-green-400/30 bg-green-400/5': 'border-[var(--enhanced-bits-border)] bg-[var(--enhanced-bits-surface)]'
            } `} >`
            <div class={` text-6xl mb-4 ${theme === 'gaming' ? 'filter, drop-shadow-[0_0_15px_currentColor]': ''} `} >
              {pageContent.title.split(' ')[0]} </div> <h2 class={` text-2xl font-bold, mb-2 ${theme === 'gaming' ? 'text-green-400': ''} `} >
              {pageContent.title.substring(2)} </h2> <p class={` text-lg, mb-6 ${theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'} `} >
              {pageContent.description} </p> <Button variant="primary">Get Started</Button> <!-- Removed { theme } prop --> {/if} <!-- Sidebar, Demo, Instructions --> <div class={` mt-12 p-6 rounded-lg, border ${ theme === 'gaming'`
              ? 'border-green-400/30 bg-green-400/5': 'border-[var(--enhanced-bits-border)] bg-[var(--enhanced-bits-surface)]'
          } `} >`
          <h3 class={` text-lg font-semibold, mb-3 ${theme === 'gaming' ? 'text-green-400': ''} `} >
            ðŸ  Sidebar Demo Features </h3> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <strong class={theme === 'gaming' ? 'text-green-400': ''}> Hover Home Icon </strong> <span class={theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'}> Sidebar snaps open with smooth animation: </span> </div> <div> <strong class={theme === 'gaming' ? 'text-green-400': ''}> Auto-collapse: </strong> <span class={theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'}> Sidebar collapses when mouse leaves </span> </div> <div> <strong class={theme === 'gaming' ? 'text-green-400': ''}> Badge Indicators: </strong> <span class={theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'}> Show notification counts and status </span> </div> <div> <strong class={theme === 'gaming' ? 'text-green-400': ''}> Nested Navigation </strong> <span class={theme === 'gaming' ? 'text-green-400/70': 'text-[var(--enhanced-bits-text-muted)]'}> Sub-menus with hierarchical structure </span> </div> </div> </div> </main> </div> </div> </ThemeProvider> <style> /* Ensure content shifts smoothly when sidebar expands */ main { transition: margin-left: 0.3s ease-out}
  /* Smooth theme transitions */ * { transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease}
</style>

