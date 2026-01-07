<script lang="ts">
 /**
 * Phase 74: SvelteKit Frontend - Main Layout
 * Integrated AST analysis, suggestions, web search, RAG context
 * Task 14: Create Main Page Layout
 */
 import {
 AIFileUpload,
 AutoPopulatedCaseForm,
 DiffViewer,
 SearchResults,
 ThemeToggle,
 TypewriterPrompt
 } from '$lib/components/ui';
 import type {
 AutoPopulatedForm,
 MarkdownScene,
 TypewriterPrompt as TypewriterPromptType,
 UploadedFile
 } from '$lib/stores/ui-store';

 // State
 let activeTab = $state<'editor' | 'upload' | 'search' | 'diff' | 'form'>('editor');
 let uploadedFiles = $state<UploadedFile[]>([]);
 let searchResults = $state<any[]>([]);
 let isSearching = $state(false);
 let currentTheme = $state<'light' | 'dark' | 'yorha' | 'nier'>('yorha');

 // Demo data
 let demoPrompt: TypewriterPromptType = {
 id: '1',
 text: 'What about Case #2025-CR-001234... "State v. Johnson"?',
 caseId: '2025-CR-001234',
 caseName: 'State v. Johnson',
 timestamp: new Date( isTyping: false,
 displayedText: ''
 };

 let demoScene: MarkdownScene = {
 id: 'scene-1',
 title: 'Security Footage Analysis',
 markdown: '## Scene Overview\n\nSubject enters through main door at 14:32:15...',
 validated: false,
 aiGenerated: true,
 confidence: 0.87,
 sourceFiles: ['camera3.mp4']
 };

 let demoForm: AutoPopulatedForm = {
 caseNumber: '2025-CR-001234',
 caseName: 'State v. Johnson',
 defendant: 'Michael Johnson',
 plaintiff: 'State of California',
 charges: ['Burglary - 2nd Degree'],
 location: 'Downtown District',
 date: '2025-11-15',
 confidence: 0.89,
 source: 'ai'
 };

 // Handlers
 function handleFileUpload(files: UploadedFile[]) {
 uploadedFiles = [...uploadedFiles, ...files];
 }

 function handleSearch(query: string) {
 if (!query.trim()) return;

 isSearching = true;
 // Simulate search
 setTimeout(() => {
 searchResults = [
 {
 id: '1',
 title: 'Legal Case Analysis Best Practices',
 url: 'https://example.com/legal-analysis',
 snippet: 'Learn the best practices for analyzing legal cases...',
 source: 'Legal Resources',
 relevance: 0.95
 },
 {
 id: '2',
 title: 'Evidence Documentation Standards',
 url: 'https://example.com/evidence-standards',
 snippet: 'Standards for documenting and preserving evidence...',
 source: 'Legal Standards',
 relevance: 0.87
 }
 ];
 isSearching = false;
 }, 1000);
 }

 function handleThemeChange(theme: 'light' | 'dark' | 'yorha' | 'nier') {
 currentTheme = theme;
 if (typeof document !== 'undefined') {
 document.documentElement.setAttribute('data-theme', theme);
 }
 }
</script>

<svelte:head>
 <title>Phase 74: SvelteKit Frontend | YoRHa Legal AI</title>
</svelte:head>

<div class="phase-74-layout">
 <!-- Header -->
 <header class="main-header">
 <div class="header-content">
 <h1>🚀 Phase 74: SvelteKit Frontend</h1>
 <p>Integrated AST Analysis, AI Suggestions, Web Search & RAG Context</p>
 </div>
 <div class="header-actions">
 <ThemeToggle
 currentTheme={currentTheme}
 onChange={handleThemeChange}
 />
 <a href="/settings/preferences" class="settings-link">⚙️ Settings</a>
 </div>
 </header>

 <!-- Main Content -->
 <div class="main-content">
 <!-- Sidebar Navigation -->
 <nav class="sidebar">
 <div class="nav-section">
 <h3>Features</h3>
 <button
 class="nav-btn"
 class:active={activeTab === 'editor'}
 onclick={() => activeTab = 'editor'}
 >
 📝 Code Editor
 </button>
 <button
 class="nav-btn"
 class:active={activeTab === 'upload'}
 onclick={() => activeTab = 'upload'}
 >
 📁 File Upload
 </button>
 <button
 class="nav-btn"
 class:active={activeTab === 'search'}
 onclick={() => activeTab = 'search'}
 >
 🔍 Web Search
 </button>
 <button
 class="nav-btn"
 class:active={activeTab === 'diff'}
 onclick={() => activeTab = 'diff'}
 >
 📊 Diff Viewer
 </button>
 <button
 class="nav-btn"
 class:active={activeTab === 'form'}
 onclick={() => activeTab = 'form'}
 >
 📋 Case Form
 </button>
 </div>

 <div class="nav-section">
 <h3>Resources</h3>
 <a href="/demo/ai-features" class="nav-link">Demo Page</a>
 <a href="/settings/preferences" class="nav-link">Preferences</a>
 <a href="/" class="nav-link">Home</a>
 </div>
 </nav>

 <!-- Content Area -->
 <div class="content-area">
 {#if activeTab === 'editor'}
 <section class="tab-content">
 <h2>💬 AI Typewriter Prompts</h2>
 <p class="section-desc">Interactive prompts with typewriter effect</p>
 <TypewriterPrompt
 prompt={demoPrompt}
 speed={40}
 />
 </section>
 {/if}

 {#if activeTab === 'upload'}
 <section class="tab-content">
 <h2>📁 AI File Upload</h2>
 <p class="section-desc">Drop PDFs, videos, images - auto-detected and AI-analyzed</p>
 <AIFileUpload
 onUpload={handleFileUpload}
 maxSize={50}
 />

 {#if uploadedFiles.length > 0}
 <div class="uploaded-files">
 <h3>Uploaded Files ({uploadedFiles.length})</h3>
 <div class="file-list">
 {#each uploadedFiles as file}
 <div class="file-item">
 <span>{file.name}</span>
 <span class="status">{file.status}</span>
 </div>
 {/each}
 </div>
 </div>
 {/if}
 </section>
 {/if}

 {#if activeTab === 'search'}
 <section class="tab-content">
 <h2>🔍 Web Search Integration</h2>
 <p class="section-desc">Search the web for legal context and precedents</p>

 <div class="search-box">
 <input
 type="text"
 placeholder="Search for legal information..."
 onkeydown={(e) => {
 if (e.key === 'Enter') {
 handleSearch(e.currentTarget.value);
 }
 }}
 class="search-input"
 />
 <button
 class="search-btn"
 onclick={(e) => {
 const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
 handleSearch(input.value);
 }}
 >
 Search
 </button>
 </div>

 <SearchResults
 results={searchResults}
 isLoading={isSearching}
 query="legal case analysis"
 />
 </section>
 {/if}

 {#if activeTab === 'diff'}
 <section class="tab-content">
 <h2>📊 Diff Viewer</h2>
 <p class="section-desc">Side-by-side comparison of code changes</p>

 <DiffViewer
 original={`function analyzeCase(caseId) {
 const data = fetchCase(caseId);
 return data;
}`}
 modified={`async function analyzeCase(caseId) {
 try {
 const data = await fetchCase(caseId);
 console.log('Case loaded:', caseId);
 return data;
 } catch (error) {
 console.error('Failed to load case:', error);
 return null;
 }
}`}
 onApply={() => alert('Changes applied!')}
 onReject={() => alert('Changes rejected')}
 />
 </section>
 {/if}

 {#if activeTab === 'form'}
 <section class="tab-content">
 <h2>📋 Auto-Populated Case Form</h2>
 <p class="section-desc">Forms filled automatically from uploaded evidence</p>

 <AutoPopulatedCaseForm
 form={demoForm}
 onSubmit={(form) => alert('Form submitted: ' + form.caseName)}
 editable={ true }
 />
 </section>
 {/if}
 </div>
 </div>

 <!-- Footer -->
 <footer class="main-footer">
 <p>Phase 74: SvelteKit Frontend Integration • Bits-UI v2 • Svelte 5 • Uno.css</p>
 </footer>
</div>

<style>
 .phase-74-layout {
 display: flex;
 flex-direction: column;
 min-height: 100vh;
 background: var(--yorha-bg, #1a1a1a);
 color: var(--yorha-text, #d4d4d4);
 }

 .main-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 1.5rem 2rem;
 background: var(--yorha-bg-secondary, #2a2a2a);
 border-bottom: 1px solid var(--yorha-border, #4a4a4a);
 }

 .header-content h1 {
 margin: 0 0 0.25rem;
 font-size: 1.5rem;
 color: var(--yorha-accent, #c8a84b);
 }

 .header-content p {
 margin: 0;
 color: var(--yorha-text-muted, #888);
 font-size: 0.9rem;
 }

 .header-actions {
 display: flex;
 align-items: center;
 gap: 1rem;
 }

 .settings-link {
 padding: 0.5rem 1rem;
 background: var(--yorha-bg, #1a1a1a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 4px;
 color: var(--yorha-text, #d4d4d4);
 text-decoration: none;
 transition: all 0.2s;
 }

 .settings-link:hover {
 background: var(--yorha-bg-hover, #333);
 border-color: var(--yorha-accent, #c8a84b);
 }

 .main-content {
 display: grid;
 grid-template-columns: 200px 1fr;
 gap: 0;
 flex: 1;
 overflow: hidden;
 }

 .sidebar {
 background: var(--yorha-bg-secondary, #2a2a2a);
 border-right: 1px solid var(--yorha-border, #4a4a4a);
 padding: 1.5rem 0;
 overflow-y: auto;
 }

 .nav-section {
 padding: 0 1rem 1.5rem;
 }

 .nav-section h3 {
 margin: 0 0 0.75rem;
 font-size: 0.85rem;
 font-weight: 600;
 color: var(--yorha-text-muted, #888);
 text-transform: uppercase;
 }

 .nav-btn,
 .nav-link {
 display: block;
 width: 100%;
 padding: 0.625rem 0.75rem;
 background: transparent;
 border: none;
 border-left: 3px solid transparent;
 border-radius: 0;
 color: var(--yorha-text-muted, #888);
 text-align: left;
 cursor: pointer;
 transition: all 0.2s;
 text-decoration: none;
 font-size: 0.9rem;
 }

 .nav-btn:hover,
 .nav-link:hover {
 background: var(--yorha-bg-hover, #333);
 color: var(--yorha-text, #d4d4d4);
 }

 .nav-btn.active {
 background: var(--yorha-bg, #1a1a1a);
 border-left-color: var(--yorha-accent, #c8a84b);
 color: var(--yorha-accent, #c8a84b);
 }

 .content-area {
 padding: 2rem;
 overflow-y: auto;
 }

 .tab-content {
 max-width: 1000px;
 }

 .tab-content h2 {
 margin: 0 0 0.5rem;
 font-size: 1.5rem;
 color: var(--yorha-text, #d4d4d4);
 }

 .section-desc {
 margin: 0 0 1.5rem;
 color: var(--yorha-text-muted, #888);
 font-size: 0.9rem;
 }

 .search-box {
 display: flex;
 gap: 0.5rem;
 margin-bottom: 1.5rem;
 }

 .search-input {
 flex: 1;
 padding: 0.75rem 1rem;
 background: var(--yorha-bg-secondary, #2a2a2a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 4px;
 color: var(--yorha-text, #d4d4d4);
 font-size: 0.9rem;
 }

 .search-input:focus {
 outline: none;
 border-color: var(--yorha-accent, #c8a84b);
 }

 .search-btn {
 padding: 0.75rem 1.5rem;
 background: var(--yorha-accent, #c8a84b);
 color: var(--yorha-bg, #1a1a1a);
 border: none;
 border-radius: 4px;
 font-weight: 500;
 cursor: pointer;
 transition: background 0.2s;
 }

 .search-btn:hover {
 background: var(--yorha-accent-hover, #d4b85c);
 }

 .uploaded-files {
 margin-top: 2rem;
 padding: 1rem;
 background: var(--yorha-bg-secondary, #2a2a2a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 4px;
 }

 .uploaded-files h3 {
 margin: 0 0 1rem;
 font-size: 1rem;
 }

 .file-list {
 display: flex;
 flex-direction: column;
 gap: 0.5rem;
 }

 .file-item {
 display: flex;
 justify-content: space-between;
 padding: 0.5rem;
 background: var(--yorha-bg, #1a1a1a);
 border-radius: 2px;
 font-size: 0.85rem;
 }

 .status {
 color: var(--yorha-success, #4ade80);
 font-weight: 500;
 }

 .main-footer {
 padding: 1rem 2rem;
 background: var(--yorha-bg-secondary, #2a2a2a);
 border-top: 1px solid var(--yorha-border, #4a4a4a);
 text-align: center;
 font-size: 0.8rem;
 color: var(--yorha-text-muted, #888);
 }

 .main-footer p {
 margin: 0;
 }

 @media (max-width: 900px) {
 .main-content {
 grid-template-columns: 1fr;
 }

 .sidebar {
 display: none;
 }
 }
</style>
