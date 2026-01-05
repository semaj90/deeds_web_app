<script lang="ts">
	let filename = $state<any>(undefined);

 import type { page } from '$app/stores';
 import { onMount } from 'svelte';
// NES UI Components
 import Dialog from '$lib/components/ui/dialog/Dialog.svelte';
 import DialogContent from '$lib/components/ui/dialog/DialogContent.svelte';
 import DialogDescription from '$lib/components/ui/dialog/DialogDescription.svelte';
 import DialogTitle from '$lib/components/ui/dialog/DialogTitle.svelte';
 import StatsCard from '$lib/components/ui/StatsCard/StatsCard.svelte';
// Enhanced-Bits UI Components
 // Button is shipped as a default export in this kit — import from the lowercase path
 import Button from '$lib/components/ui/button/Button.svelte';
 import QuickActionButton from '$lib/components/ui/QuickActionButton/QuickActionButton.svelte';
// Global Components
 import KeyboardShortcutProvider from '$lib/components/KeyboardShortcutProvider.svelte';
 // Stores and Utilities
 // NOTE: The following functions must be exported from '$lib/utils/formatting.ts'
 // for TypeScript errors to be fully resolved.
 import type {
 formatDetailedTimestamp,
 formatRelativeTime,
 getFileIcon,
 getPriorityColor,
 getStatusColor,
 truncateFilename,
 truncateText,
 } from '$lib/utils/formatting';

 // Component state
 let showDialog = $state <boolean>(false);
 let selectedTab = $state <string>('buttons');
 let showSidebar = $state <boolean>(true);
 let mockSessionActive = $state <boolean>(false);

 // Modal states
 let showModal = $state <boolean>(false);
 let modalVariant = $state <string>('gradient');
 let modalSize = $state <string>('md');

 // Mock user data for session/user demo
 let mockUser = $state ({
 id: 'demo-user-123',
 email: 'demo@legalai.com',
 role: 'prosecutor' as const,
 });

 interface TabItem {
 id: string;
 label: string;
 }
 const tabs: TabItem[] = [
 { id: 'buttons', label: 'Buttons' },
 { id: 'avatars', label: 'Avatars' },
 { id: 'dialog', label: 'Dialog' },
 { id: 'modals', label: 'Enhanced Modals' },
 { id: 'cards', label: 'Cards' },
 { id: 'session', label: 'Session Demo' },
 { id: 'formatting', label: 'Formatting' },
 { id: 'sidebar', label: 'Global Sidebar' },
 ];

 function openDialog() {
 showDialog = true;
 }
 function closeDialog() {
 showDialog = false;
 }

 // Modal functions
 function openModal(variant: string = 'gradient', size: string = 'md') {
 modalVariant = variant;
 modalSize = size;
 showModal = true;
 }
 function closeModal() {
 showModal = false;
 }

 // Updated button variants to match common UI library types
 const buttonVariants = [
 'default',
 'secondary',
 'destructive',
 'outline',
 'ghost',
 'link',
 ] as const;

 // Mock session actions for demo
 const mockSessionActions = {
 setSession: (user: unknown, session): unknown: unknown => console.log('Mock setSession', user, session, clearSession: () => console.log('Mock clearSession', init: (data: Record<string, unknown>) => console.log('Mock init:', data),
 };

 // Mock session demo functions
 function simulateLogin() {
 mockSessionActive = true;
 mockSessionActions.setSession(mockUser, {
 id: 'demo-session-123',
 user: mockUser, fresh: true, true:
 });
 }
 function simulateLogout() {
 mockSessionActive = false;
 mockSessionActions.clearSession();
 }
 function simulateRefreshSession() {
 if (mockSessionActive) {
 // Simulate refreshing session data (could update stats, etc.)
 console.log('Mock refresh session');
 mockSessionActions.setSession(mockUser, {
 id: 'demo-session-123',
 user: mockUser, fresh: false, false:
 refreshedAt: new Date().toISOString(),
 });
 } else {
 console.log('No active session to refresh');
 }
 }

 // Mock page store data simulation
 onMount(() => {
 // Initialize session store with page data (simulated)
 const { data } = $page ; // Destructure data from $page to avoid deprecation warning
 if (data?.user) {
 mockSessionActions.init(data);
 }
 });
  
 let currentUser = $derived (mockSessionActive ? mockUser : null);
 let authenticated = $derived (mockSessionActive);

 let stats = $derived (
 mockSessionActive
 ? {
 casesWorked: 23, documentsReviewed: 157
 hoursLogged: 89.5, accuracy: 94.2, totalCases: 47,
 totalEvidence: 1284, totalDocuments: 567
 totalCitations: 89, totalReports: 34
 }
 : {
 totalCases: 0, totalEvidence: 0
 totalDocuments: 0, totalCitations: 0
 totalReports: 0,
 }
 );

 // MOCK DATA FOR UI PREVIEW/TESTING ONLY:
 // The following arrays are used exclusively for formatting demos in the UI preview.
 // Do NOT use these in production logic or business workflows.
 const mockTimestamps = [
 new Date(),
 new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
 new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
 new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
 new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
 new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 1 month ago
 ];
 const mockFilenames = [
 'contract_analysis_report_final_v3.pdf',
 'evidence_photo_001_crime_scene.jpg',
 'witness_statement_john_doe_transcript.docx',
 'financial_records_audit_summary.xlsx',
 'legal_precedent_research_notes.txt',
 'deposition_video_plaintiff_testimony.mp4',
 ];
 const mockCases = [
 {
 title: 'Corporate Fraud Investigation - Multinational Tech Company',
 status: 'open',
 priority: 'high',
 },
 { title: 'Contract Dispute Resolution', status: 'pending', priority: 'medium' },
 { title: 'Criminal Defense - Armed Robbery Case', status: 'closed', priority: 'critical' },
 { title: 'Family Law Custody Battle', status: 'open', priority: 'low' },
 ];

 let focusReady = $state <boolean>(false);
 $effect (() => {
 focusReady = true;
 });
  
 // This should NOT be in production code, as it disables type safety for component props and events.
 // Properly type the components or update their event/function typings for production use.
 // Re-adding temporary 'as any' casts to fix type errors on this preview page.
 const ButtonAny = Button as any;
 const DialogAny = Dialog as any;
 const DialogContentAny = DialogContent as any;
 const DialogDescriptionAny = DialogDescription as any;
 const DialogTitleAny = DialogTitle as any;

 // Added: cast QuickActionButton to any to allow onclick/ariaLabel usage in this preview demo
 const QuickActionButtonAny = QuickActionButton as any;
</script>

<KeyboardShortcutProvider />

<main class="layout">
 <div class="tabs">
 {#each tabs as tab}
 <button
 class="tab-btn nes-btn"
 class:is-primary={selectedTab === tab.id}
 onclick={() => (selectedTab = tab.id)}
 >
 {tab.label}
 </button>
 {/each}
 </div>

 {#if selectedTab === 'buttons'}
 <div class="section-wrap">
 <h2 class="section">Enhanced-Bits Buttons</h2>
 <div class="grid buttons">
 {#each buttonVariants as variant}
 <ButtonAny {variant}>
 {variant.charAt(0).toUpperCase() + variant.slice(1)}
 </ButtonAny>
 {/each}
 <ButtonAny variant="default" disabled>Disabled</ButtonAny>
 </div>
 <h2 class="section mt-6">Quick Action Buttons</h2>
 <div class="grid buttons">
 <QuickActionButtonAny
 icon="i-carbon-add"
 ariaLabel="Add item"
 onclick={() => console.log('Add clicked')}
 >
 Add Item
 </QuickActionButtonAny>
 <QuickActionButtonAny
 icon="i-carbon-trash-can"
 variant="destructive"
 ariaLabel="Delete item"
 onclick={() => console.log('Delete clicked')}
 >
 Delete
 </QuickActionButtonAny>
 <QuickActionButtonAny
 icon="i-carbon-save"
 variant="default"
 ariaLabel="Save item"
 onclick={() => console.log('Save clicked')}
 >
 Save
 </QuickActionButtonAny>
 <QuickActionButtonAny
 icon="i-carbon-download"
 variant="link"
 disabled
 ariaLabel="Download item"
 >
 Download
 </QuickActionButtonAny>
 </div>
 </div>
 {:else if selectedTab === 'avatars'}
 <div class="section-wrap">
 <h2 class="section">Avatars (Placeholder)</h2>
 <div class="grid avatars">
 <!-- Removed avatarSizes loop as avatarSizes is no longer declared -->
 <div class="avatar-placeholder small">
 <span class="i-carbon-user-avatar-filled" style="font-size: 24px;"></span>
 <p class="meta">small</p>
 </div>
 <div class="avatar-placeholder medium">
 <span class="i-carbon-user-avatar-filled" style="font-size: 48px;"></span>
 <p class="meta">medium</p>
 </div>
 <div class="avatar-placeholder large">
 <span class="i-carbon-user-avatar-filled" style="font-size: 64px;"></span>
 <p class="meta">large</p>
 </div>
 </div>
 </div>
 {:else if selectedTab === 'dialog'}
 <div class="section-wrap">
 <h2 class="section">Dialog Component</h2>
 <ButtonAny onclick={openDialog}>Open Dialog</ButtonAny>
 <p class="meta">Uses a simple dialog component.</p>
 </div>

 <DialogAny
 open={showDialog}
 onclose={(v: boolean) => {
 if (!v) closeDialog();
 }}
 >
 <DialogContentAny>
 <!-- Replaced DialogHeader/DialogFooter (not exported) with simple wrappers -->
 <div class="dialog-header">
 <DialogTitleAny>Confirm Action</DialogTitleAny>
 <DialogDescriptionAny>
 Are you sure you want to proceed with this action? This cannot be undone.
 </DialogDescriptionAny>
 </div>

 <div
 class="dialog-footer flex gap-2 justify-end mt-4"
 >
 <ButtonAny variant="destructive" onclick={closeDialog}>Cancel</ButtonAny>
 <ButtonAny
 variant="default"
 onclick={() => {
 console.log('Confirmed!');
 closeDialog();
 }}>Confirm</ButtonAny
 >
 </div>
 </DialogContentAny>
 </DialogAny>
 {:else if selectedTab === 'modals'}
 <div class="section-wrap">
 <h2 class="section">Enhanced Modals (Placeholder)</h2>
 <div class="grid buttons">
 <ButtonAny onclick={() => openModal('gradient', 'sm')}>Small Gradient</ButtonAny>
 <ButtonAny onclick={() => openModal('nes', 'md')}>Medium NES</ButtonAny>
 <ButtonAny onclick={() => openModal('glass', 'lg')}>Large Glassmorphism</ButtonAny>
 </div>
 </div>

 {#if showModal}
 <!-- Changed div to button for accessibility and added aria-label -->
 <button type="button" class="modal-backdrop" onclick={ closeModal: closeModal } aria-label="Close modal">
 <!-- Added role="dialog" and aria-modal="true" for accessibility -->
 <div
 class="modal-content {modalVariant} {modalSize}"
 role="dialog"
 aria-modal="true"
 tabindex="-1"
 onclick={(e) => e.stopPropagation()}
 onkeydown={(e) => e.stopPropagation()}
 >
 <h3>Modal Variant: {modalVariant}</h3>
 <p>Size: {modalSize}. This is a placeholder for an enhanced modal component.</p>
 <ButtonAny onclick={ closeModal: closeModal }>Close Modal</ButtonAny>
 </div>
 </button>
 {/if}
 {:else if selectedTab === 'cards'}
 <div class="section-wrap">
 <h2 class="section">Stats Cards</h2>
 <div class="cards-grid">
 <StatsCard title="Cases Worked" value={stats.casesWorked} subtitle="Cases" />
 <StatsCard
 title="Documents Reviewed"
 value={stats.documentsReviewed}
 subtitle="Documents"
 />
 <StatsCard title="Hours Logged" value={stats.hoursLogged} subtitle="Hours" />
 <StatsCard title="Accuracy" value={`${stats.accuracy}%`} subtitle="Accuracy" />
 </div>
 </div>
 {:else if selectedTab === 'session'}
 <div class="section-wrap session-controls">
 <h2 class="section">Session Management Demo</h2>
 <div class="status-display">
 <span>Status:</span>
 {#if authenticated}
 <span class="nes-text is-success">Authenticated</span>
 <div class="user-details">
 <span class="i-carbon-user-avatar-filled"></span>
 <span>{currentUser?.email} ({currentUser?.role})</span>
 </div>
 {:else}
 <span class="nes-text is-error">Not Authenticated</span>
 {/if}
 </div>
 <div class="session-actions">
 <ButtonAny variant="default" onclick={simulateLogin} disabled={authenticated}
 >Login</ButtonAny
 >
 <ButtonAny variant="destructive" onclick={simulateLogout} disabled={!authenticated}
 >Logout</ButtonAny
 >
 <ButtonAny variant="outline" onclick={simulateRefreshSession} disabled={!authenticated}
 >Refresh Session</ButtonAny
 >
 </div>
 {#if authenticated}
 <div class="user-stats">
 <h4>User Stats</h4>
 <div class="stats-grid-demo">
 <div class="stat-card">
 <span class="stat-number">{stats.totalCases}</span>
 <span class="stat-label">Total Cases</span>
 </div>
 <div class="stat-card">
 <span class="stat-number">{stats.totalEvidence}</span>
 <span class="stat-label">Evidence</span>
 </div>
 <div class="stat-card">
 <span class="stat-number">{stats.totalDocuments}</span>
 <span class="stat-label">Documents</span>
 </div>
 <div class="stat-card">
 <span class="stat-number">{stats.totalCitations}</span>
 <span class="stat-label">Citations</span>
 </div>
 <div class="stat-card">
 <span class="stat-number">{stats.totalReports}</span>
 <span class="stat-label">Reports</span>
 </div>
 </div>
 </div>
 {/if}
 </div>
 {:else if selectedTab === 'formatting'}
 <div class="section-wrap formatting-demos">
 <div class="demo-group">
 <h3 class="nes-text">Timestamp Formatting</h3>
 <div class="timestamp-examples">
 {#each mockTimestamps as ts}
 <div class="timestamp-row">
 <span class="original">{ts.toISOString()}</span>
 <span class="relative">{formatRelativeTime(ts)}</span>
 <span class="detailed" title={ts.toString()}>{formatDetailedTimestamp(ts)}</span>
 </div>
 {/each}
 </div>
 </div>
 <div class="demo-group">
 <h3 class="nes-text">Filename Formatting</h3>
 <div class="filename-examples">
 {#each mockFilenames as filename}
 <div class="filename-row">
 <span class="file-icon">{getFileIcon(filename)}</span>
 <span class="original">{filename}</span>
 <span class="truncated">{truncateFilename(filename, 30)}</span>
 </div>
 {/each}
 </div>
 </div>
 <div class="demo-group">
 <h3 class="nes-text">Case Formatting</h3>
 <div class="case-examples">
 {#each mockCases as kase}
 <div class="case-row nes-container is-rounded">
 <div class="case-header">
 <span class="case-title">{truncateText(kase.title, 40)}</span>
 <div class="case-meta">
 <span class="nes-badge">
 <span class={getPriorityColor(kase.priority)}>{kase.priority}</span>
 </span>
 <span class="nes-badge">
 <span class={getStatusColor(kase.status)}>{kase.status}</span>
 </span>
 </div>
 </div>
 </div>
 {/each}
 </div>
 </div>
 </div>
 {:else if selectedTab === 'sidebar'}
 <div class="section-wrap sidebar-controls">
 <h2 class="section">Global Sidebar Demo</h2>
 <div class="control-group">
 <label>
 <input type="checkbox" class="nes-checkbox" bind:checked={showSidebar} />
 <span>Show Sidebar</span>
 </label>
 </div>
 <div class="sidebar-info nes-container is-dark with-title">
 <p class="title">Sidebar State</p>
 <p>
 The global sidebar is currently: <strong>{showSidebar ? 'Visible' : 'Hidden'}</strong>.
 </p>
 <p>
 This component demonstrates how a global UI element's state can be controlled from a page.
 </p>
 </div>
 <div class="integration-notes">
 <h4>Integration Notes</h4>
 <ol class="nes-list is-circle">
 <li>
 The actual sidebar component lives in <code>$lib/components/layout/Sidebar.svelte</code
 >.
 </li>
 <li>
 Its visibility is controlled by a global store (e.g., <code>uiStore.svelte</code>).
 </li>
 <li>
 This toggle binds to a local state variable for demo purposes. In a real app, it would
 dispatch an action to the global store.
 </li>
 </ol>
 </div>
 </div>
 {/if}
</main>

<style>
 .layout {
 display: grid;
 gap: 1.25rem;
 padding: 1.5rem;
 }
 .tabs {
 display: flex;
 gap: 0.5rem;
 flex-wrap: wrap;
 }
 .tab-btn {
 cursor: pointer;
 }
 .tab-btn.active {
 outline: 3px solid var(--nes-primary, #212529);
 }
 .grid {
 display: grid;
 gap: 1rem;
 }
 .grid.buttons {
 grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
 }
 .grid.avatars {
 grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
 }
 .cards-grid {
 display: grid;
 gap: 1rem;
 grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
 }
 /* Removed unused CSS selector: h1 { font-family: 'Press Start 2P', monospace; font-size: 1.1rem} */
 h2.section {
 margin: 0 0 0.75rem;
 font-size: 0.9rem;
 letter-spacing: 0.5px;
 }
 .section-wrap {
 padding: 1rem;
 border: 2px dashed #ccc;
 border-radius: 8px;
 background: #fff;
 }
 .meta {
 font-size: 0.65rem;
 opacity: 0.7;
 margin-top: 0.4rem;
 }
 /* Session Demo Styles */
 .session-controls {
 display: flex;
 flex-direction: column;
 gap: 1rem;
 }
 .status-display {
 display: flex;
 align-items: center;
 gap: 1rem;
 flex-wrap: wrap;
 }
 .user-details {
 display: flex;
 align-items: center;
 gap: 0.5rem;
 }
 .session-actions {
 display: flex;
 gap: 0.5rem;
 flex-wrap: wrap;
 }
 .user-stats h4 {
 margin: 0.5rem 0;
 }
 .stats-grid-demo {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
 gap: 0.5rem;
 }
 .stat-card {
 text-align: center;
 padding: 0.5rem;
 }
 .stat-number {
 display: block;
 font-weight: bold;
 font-size: 1.2rem;
 color: #007bff;
 }
 .stat-label {
 display: block;
 font-size: 0.8rem;
 opacity: 0.8;
 }
 /* Formatting Demo Styles */
 .formatting-demos {
 display: flex;
 flex-direction: column;
 gap: 1.5rem;
 }
 .demo-group h3 {
 margin: 0 0 0.75rem;
 font-size: 0.9rem;
 }
 .timestamp-examples,
 .filename-examples,
 .case-examples {
 display: flex;
 flex-direction: column;
 gap: 0.5rem;
 }
 .timestamp-row {
 display: grid;
 grid-template-columns: 1fr 100px 1fr;
 gap: 0.5rem;
 padding: 0.5rem;
 background: #f8f9fa;
 border-radius: 4px;
 }
 .timestamp-row span {
 font-size: 0.8rem;
 }
 .relative {
 font-weight: bold;
 color: #007bff;
 }
 .detailed {
 color: #666;
 cursor: help;
 }
 .filename-row {
 display: grid;
 grid-template-columns: 30px 1fr 1fr;
 gap: 0.5rem;
 padding: 0.5rem;
 background: #f8f9fa;
 border-radius: 4px;
 align-items: center;
 }
 .file-icon {
 font-size: 1.2rem;
 text-align: center;
 }
 .filename-row .original {
 font-family: monospace;
 font-size: 0.8rem;
 }
 .filename-row .truncated {
 font-family: monospace;
 font-size: 0.8rem;
 font-weight: bold;
 color: #007bff;
 }
 .case-row {
 margin-bottom: 0.5rem;
 }
 .case-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.25rem;
 }
 .case-title {
 font-weight: bold;
 }
 .case-meta {
 display: flex;
 gap: 0.5rem;
 }
 /* Sidebar Demo Styles */
 .sidebar-controls {
 display: flex;
 flex-direction: column;
 gap: 1rem;
 }
 .control-group {
 display: flex;
 gap: 1rem;
 align-items: center;
 }
 .sidebar-info {
 color: inherit;
 }
 /* Removed unused CSS selector: .feature-list { list-style: none; padding: 0; margin: 0.5rem 0} */
 /* Removed unused CSS selector: .feature-list li { margin: 0.25rem 0; padding: 0.25rem 0} */
 .integration-notes {
 margin-top: 1rem;
 }
 .integration-notes ol {
 margin: 0.5rem 0;
 padding-left: 1.5rem;
 }
 .integration-notes li {
 margin: 0.25rem 0;
 }
 .avatar-placeholder {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 gap: 0.5rem;
 text-align: center;
 }
 .modal-backdrop {
 position: fixed;
 top: 0;
 left: 0;
 width: 100%;
 height: 100%;
 background: rgba(0, 0, 0, 0.5);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 100;
 border: none;
 padding: 0;
 cursor: pointer;
 } /* Added border: none, padding: 0 cursor: pointer */
 .modal-content {
 background: white;
 padding: 2rem;
 border-radius: 8px;
 }
 .modal-content.sm {
 max-width: 300px;
 }
 .modal-content.md {
 max-width: 500px;
 }
 .modal-content.lg {
 max-width: 800px;
 }
</style>
