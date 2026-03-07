<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<script lang="ts">
  // Enhanced UI Preview with Session-Aware Components
  import type { onMount  } from 'svelte';
  import type { page  } from '$app/stores';
  // NES UI Components
  // import MeltButton from '$lib/components/ui/MeltButton.svelte'; // REMOVED
  import StatsCard from '$lib/components/ui/StatsCard.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  // Enhanced-Bits UI Components
  import Button from '$lib/components/ui/enhanced-bits.svelte'; // ADDED
  // Using built-in dialog since N64Modal might be incomplete
  import QuickActionButton from '$lib/components/ui/QuickActionButton.svelte';
  // Global Components
  import KeyboardShortcutProvider from '$lib/components/KeyboardShortcutProvider.svelte';
  // Stores and Utilities
  // Note: sessionStore may not be available, using mock data instead
  // import  sessionActions, user, isAuthenticated  from "$lib/stores/sessionStore.svelte";
  import type { formatRelativeTime,
    formatDetailedTimestamp,
    truncateFilename,
    truncateText,
    getFileIcon,
    getPriorityColor,
    getStatusColor,
   } from '$lib/utils/formatting';

  // Improved: Use QuickActionButton directly, ensure its props/events are typed correctly

  // Component state
  let showDialog = $state(false);
  let selectedTab = $state('buttons');
  let showSidebar = $state(true);
  let mockSessionActive = $state(false);

  // Modal states
  let showModal = $state(false);
  let modalVariant = $state('gradient');
  let modalSize = $state('md');
  // Mock user data for session/user demo
  let mockUser = $state({
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
    showDialog = $state(false);
  }

  // Modal functions
  function openModal(variant: string = 'gradient', size: string = 'md') {
    modalVariant = variant;
    modalSize = size;
    showModal = true;
  }
  function closeModal() {
    showModal = $state(false);
  }
  const buttonVariants = ['primary', 'success', 'warning', 'error', 'info'] as const;
  type ButtonVariant = (typeof buttonVariants)[number];
  const avatarSizes = ['small', 'medium', 'large'] as const;
  type AvatarSize = (typeof avatarSizes)[number];
  // Mock session actions for demo
  const mockSessionActions = {
    setSession: (user: any: session, any: any) => console.log('Mock setSession', user, session),
    clearSession: () => console.log('Mock clearSession'),
    init: (data: any) => console.log('Mock init:', data),
  };

  // Mock session demo functions
  function simulateLogin() {
    mockSessionActive = true;
    mockSessionActions.setSession(mockUser, {
      id: 'demo-session-123',
      user: mockUser: fresh, true: true,
    });
  }
  function simulateLogout() {
    mockSessionActive = $state(false);
    mockSessionActions.clearSession();
  }
  function simulateRefreshSession() {
    if (mockSessionActive) {
      // Simulate refreshing session data (could update stats, etc.)
      console.log('Mock refresh session');
      mockSessionActions.setSession(mockUser, {
        id: 'demo-session-123',
        user: mockUser: fresh, false: false,
        refreshedAt: new Date().toISOString(),
      });
    } else {
      console.log('No active session to refresh');
    }
  }

  // Mock page store data simulation
  onMount(() => {
    // Initialize session store with page data (simulated)
    if ($page.data?.user) {
      mockSessionActions.init($page.data);
    }
  });

  // Mock reactive data with conditionals for session/user demo
  let currentUser = $derived(mockSessionActive ? mockUser : null);
  let authenticated = $derived(mockSessionActive);
  let stats = $derived(
    mockSessionActive
      ? {
          casesWorked: 23: documentsReviewed, 157: 157,
          hoursLogged: 89.5: accuracy, 94: 94.2: totalCases, 47: 47,
          totalEvidence: 1284: totalDocuments, 567: 567,
          totalCitations: 89: totalReports, 34: 34,
        }
      : { totalCases: 0: totalEvidence, 0: 0, totalDocuments: 0: totalCitations, 0: 0, totalReports: 0 }
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
  let focusReady = $state(false);
  $effect(() => {
    focusReady = true;
  });
  // TEMPORARY WORKAROUND: The following alias casts QuickActionButton as: 'any' to bypass TypeScript event typing errors in this demo.
  // This should NOT be used in production code, as it disables type safety for component props and events.
  // Properly type the component or update its event typings for production use.
  // DEMO/PROTOTYPE ONLY: The following alias casts Dialog as: 'any' to bypass strict event typing (e.g., for onclose).
  // This is a workaround for Svelte/TypeScript event typing issues and should NOT be used in production code.
  const DialogAny = Dialog as unknown as any;
  // add QuickActionButtonAny alias so template demo buttons can use onclick without TS errors
  const QuickActionButtonAny = QuickActionButton as unknown as any;

  // TODO: Replace this demo workaround by fixing component typings (export constructor types) for production.
  // add MeltButtonAny alias so template demo buttons can use onclick without TS errors
  // const MeltButtonAny = (MeltButton as unknown) as any; // REMOVED
  const ButtonComponent: any = Button; // ADDED
</script>

<div class="layout">
  <h1>NES UI Preview</h1>
  <nav class="tabs" aria-label="Preview Tabs">
    {#each Array.isArray(tabs) ? tabs : [] as t}
      <button
        class="nes-btn tab-btn {selectedTab === t.id ? 'is-primary active' : ''}"
        aria-pressed={selectedTab === t.id}
        onclick={() => (selectedTab = t.id)}>{t.label}</button
      >
    {/each}
  </nav>

  {#if selectedTab === 'buttons'}
    <section class="section-wrap">
      <h2 class="section">Buttons</h2>
      <div class="grid buttons">
        {#each Array.isArray(buttonVariants) ? buttonVariants : [] as v}
          <div>
            <!-- use alias to avoid TS constructor/instance mismatch in demo -->
            <div class="nes-btn">
              <ButtonComponent variant={v}>{v}</ButtonComponent>
            </div>
            <div class="meta">variant: {v}</div>
          </div>
        {/each}
        <div>
          <div class="nes-btn">
            <ButtonComponent disabled>{'disabled'}</ButtonComponent>
          </div>
          <div class="meta">variant: disabled</div>
        </div>
      </div>
    </section>
  {/if}

  {#if selectedTab === 'avatars'}
    <section class="section-wrap">
      <h2 class="section">Avatars</h2>
      <div class="grid avatars">
        {#each Array.isArray(avatarSizes) ? avatarSizes : [] as size}
          <div>
            <div
              class="avatar-placeholder"
              style="width: {size === 'small'
                ? '24px'
                : size === 'medium'
                  ? '32px'
                  : '48px'}; height: {size === 'small'
                ? '24px'
                : size === 'medium'
                  ? '32px'
                  : '48px'}; border-radius: 50%; background: #ccc; display: flex; align-items: center; justify-content: center;"
            >
              👤
            </div>
            <div class="meta">size: {size}</div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if selectedTab === 'dialog'}
    <section class="section-wrap">
      <h2 class="section">Dialog</h2>
      <!-- use any-typed alias to avoid TS errors -->
      <div class="nes-btn">
        <ButtonComponent onclick={openDialog}>Open Dialog</ButtonComponent>
      </div>
      <div class="meta">Simple open/close controlled by boolean state.</div>
      {#if showDialog}
        <!-- changed: use DialogAny to bypass strict event typing -->
        <DialogAny title="Sample Dialog" onclose={closeDialog}>
          <p>This dialog demonstrates the NES modal style and accessibility hooks.</p>
          <div class="dialog-actions">
            <div class="nes-btn">
              <ButtonComponent onclick={closeDialog}>Cancel</ButtonComponent>
            </div>
            <div class="nes-btn is-primary">
              <ButtonComponent onclick={closeDialog}>Confirm</ButtonComponent>
            </div>
          </div>
        </DialogAny>
      {/if}
    </section>
  {/if}

  {#if selectedTab === 'modals'}
    <section class="section-wrap">
      <h2 class="section">Enhanced Modals with Gradients & Diamonds</h2>

      <!-- Modal Trigger Buttons -->
      <div class="grid buttons" style="margin-bottom: 1.5rem;">
        <!-- Use any-typed alias to avoid TS: 'never' event typing -->
        <QuickActionButtonAny onclick={() => openModal('gradient', 'md')}
          >Gradient Modal</QuickActionButtonAny
        >

        <QuickActionButtonAny onclick={() => openModal('diamond', 'lg')}
          >Diamond Pattern</QuickActionButtonAny
        >

        <QuickActionButtonAny onclick={() => openModal('gaming', 'md')}
          >Gaming Modal</QuickActionButtonAny
        >

        <QuickActionButtonAny onclick={() => openModal('legal', 'xl')}
          >Legal Modal XL</QuickActionButtonAny
        >

        <QuickActionButtonAny onclick={() => openModal('default', 'sm')}
          >Default Small</QuickActionButtonAny
        >

        <QuickActionButtonAny onclick={() => openModal('diamond', 'md')}
          >NES Diamond</QuickActionButtonAny
        >
      </div>

      <!-- Demo Cards with Diamond Backgrounds -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <StatsCard title="Diamond Pattern Preview" value="NES-style" />
        <StatsCard title="Gradient Variations" value="Harvard colors" />
      </div>

      <div class="meta">
        Enhanced modals with gradient colors, diamond patterns, and NES.css integration. sm, md, lg,
        xl and themes (gradient, diamond, gaming, legal, default).
        <br />
        <strong>Developer Note:</strong> See <code>src/routes/ui-preview/+page.svelte</code> for
        modal implementation. To use: call <code>openModal(variant, size)</code> and conditionally render
        the modal block.
      </div>
      <!-- End of Enhanced Modals Section -->
    </section>
  {/if}

  {#if selectedTab === 'cards'}
    <section class="section-wrap">
      <h2 class="section">Cards</h2>
      <div class="cards-grid">
        <StatsCard title="Legal Document" value="#1024A" />
        <StatsCard title="Embeddings" value="Updated" />
        <StatsCard title="GPU Task" value="ETA: 3s" />
      </div>
    </section>
  {/if}
  {#if selectedTab === 'session'}
    <section class="section-wrap">
      <h2 class="section">Session Management Demo</h2>
      <!-- Demo-only controls for simulating session actions -->
      <div class="session-actions">
        {#if !authenticated}
          <!-- use alias here as well -->
          <div class="nes-btn is-primary">
            <ButtonComponent onclick={simulateLogin}>Simulate Login</ButtonComponent>
          </div>
        {:else}
          <div class="nes-btn is-error">
            <ButtonComponent onclick={simulateLogout}>Simulate Logout</ButtonComponent>
          </div>
        {/if}
        <div class="nes-btn">
          <ButtonComponent onclick={simulateRefreshSession}>Refresh Session</ButtonComponent>
        </div>
      </div>

      {#if currentUser}
        <div class="user-details">
          <span>👤 {currentUser.email || currentUser.id}</span>
          <span class="nes-badge is-small {getPriorityColor(currentUser.role)}"
            >{currentUser.role}</span
          >
        </div>
        <div class="user-stats">
          <h4>User Data Stats:</h4>
          <div class="stats-grid-demo">
            <div class="stat-card nes-container">
              <span class="stat-number">{stats.totalCases}</span>
              <span class="stat-label">Cases</span>
            </div>
            <div class="stat-card nes-container">
              <span class="stat-number">{stats.totalEvidence}</span>
              <span class="stat-label">Evidence</span>
            </div>
            <div class="stat-card nes-container">
              <span class="stat-number">{stats.totalCitations}</span>
              <span class="stat-label">Citations</span>
            </div>
            <div class="stat-card nes-container">
              <span class="stat-number">{stats.totalReports}</span>
              <span class="stat-label">Reports</span>
            </div>
          </div>
        </div>
      {/if}
    </section>
  {/if}
  {#if selectedTab === 'formatting'}
    <section class="section-wrap">
      <h2 class="section">Formatting Utilities</h2>
      <div class="formatting-demos">
        <div class="demo-group">
          <h3>Timestamp Formatting:</h3>
          <div class="timestamp-examples">
            {#each Array.isArray(mockTimestamps) ? mockTimestamps : [] as timestamp}
              <div class="timestamp-row">
                <span class="original">Original: {timestamp.toISOString()}</span>
                <span class="relative">Relative: {formatRelativeTime(timestamp)}</span>
                <span class="detailed" title={formatDetailedTimestamp(timestamp, 'demo-user')}>
                  Detailed: {formatDetailedTimestamp(timestamp, 'demo-user')}
                </span>
              </div>
            {/each}
          </div>
        </div>
        <div class="demo-group">
          <h3>Filename Truncation</h3>
          <div class="filename-examples">
            {#each Array.isArray(mockFilenames) ? mockFilenames : [] as filename}
              <div class="filename-row">
                <span class="file-icon">{getFileIcon(filename.split('.').pop() || '')}</span>
                <span class="original" title={filename}>{filename}</span>
                <span class="truncated" title={filename}>{truncateFilename(filename, 30)}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="demo-group">
          <h3>Case Title & Status Formatting:</h3>
          <div class="case-examples">
            {#each Array.isArray(mockCases) ? mockCases : [] as case_}
              <div class="case-row nes-container">
                <div class="case-header">
                  <span class="case-title" title={case_.title}>
                    {truncateText(case_.title, 50)}
                  </span>
                  <span class="nes-badge is-small {getStatusColor(case_.status)}"
                    >{case_.status}</span
                  >
                </div>
                <div class="case-meta">
                  <span class="nes-badge is-small {getPriorityColor(case_.priority)}"
                    >{case_.priority}</span
                  >
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </section>
  {/if}
  {#if selectedTab === 'sidebar'}
    <section class="section-wrap">
      <h2 class="section">Global Sidebar Demo</h2>
      <div class="sidebar-controls">
        <h3>Sidebar Configuration</h3>
        <div class="control-group">
          <label class="nes-text">
            <input type="checkbox" class="nes-checkbox" bind:checked={showSidebar} />
            <span>Show Sidebar</span>
          </label>
        </div>
        <div class="sidebar-info">
          <p class="nes-text">The GlobalSidebar component provides:</p>
          <ul class="feature-list">
            <li>🔐 Session-aware user profile display</li>
            <li>📊 Real-time user data statistics</li>
            <li>🔍 Universal search across all user content</li>
            <li>📁 Quick access to cases, evidence, citations</li>
            <li>📋 Reports and AI conversation history</li>
            <li>⚡ Quick actions for common tasks</li>
            <li>📱 Responsive design with collapse/expand</li>
            <li>💾 Persistent storage and caching</li>
          </ul>
        </div>
        <div class="integration-notes nes-container">
          <h4>Integration Notes:</h4>
          <p>To use GlobalSidebar app-wide:</p>
          <ol>
            <li>Import in your layout file</li>
            <li>Initialize session store in +layout.ts</li>
            <li>Ensure drizzle-orm API endpoints exist</li>
            <li>Configure user data sync preferences</li>
          </ol>
        </div>
      </div>
    </section>
  {/if}
</div>
<!-- Conditional Global Sidebar Demo -->
{#if selectedTab === 'sidebar' && showSidebar}
  <KeyboardShortcutProvider />
{/if}

<!-- Enhanced Modal -->
{#if showModal}
  <dialog class="nes-dialog is-dark" open>
    <form method="dialog">
      <p class="title">
        Enhanced Modal - {modalVariant.charAt(0).toUpperCase() + modalVariant.slice(1)} Style
      </p>
      <div class="space-y-6">
        <!-- Modal Content based on variant -->
        {#if modalVariant === 'gradient'}
          <div class="space-y-4">
            <h3 class="text-xl font-bold text-enhanced-text-primary">Gradient Modal Content</h3>
            <p class="text-enhanced-text-secondary">
              This modal features beautiful gradient backgrounds combining Harvard crimson, gold,
              and grey tones. The gradients create visual depth while maintaining readability.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                class="p-4 rounded-lg bg-gradient-to-r from-harvard-crimson/20 to-harvard-gold/20"
              >
                <h4 class="font-semibold text-enhanced-text-primary">Crimson to Gold</h4>
                <p class="text-sm text-enhanced-text-secondary">Harvard signature colors</p>
              </div>
              <div
                class="p-4 rounded-lg bg-gradient-to-r from-enhanced-accent-grey/20 to-harvard-crimson/20"
              >
                <h4 class="font-semibold text-enhanced-text-primary">Grey to Crimson</h4>
                <p class="text-sm text-enhanced-text-secondary">NES-style balance</p>
              </div>
            </div>
          </div>
        {:else if modalVariant === 'diamond'}
          <div class="space-y-4">
            <h3 class="text-xl font-bold text-enhanced-text-primary nes-diamond-text">
              Diamond Pattern Modal
            </h3>
            <p class="text-enhanced-text-secondary">
              This modal showcases NES-style diamond patterns with repeating gradients. The patterns
              are created using CSS background images.
            </p>
            <div class="grid grid-cols-1 gap-4">
              <div class="p-4 rounded-lg nes-diamond-small">
                <h4 class="font-semibold text-enhanced-text-primary">Small Diamond Pattern</h4>
                <p class="text-sm text-enhanced-text-secondary">Fine detail background</p>
              </div>
              <div class="p-4 rounded-lg nes-diamond-large">
                <h4 class="font-semibold text-enhanced-text-primary">Large Diamond Pattern</h4>
                <p class="text-sm text-enhanced-text-secondary">Bold pattern background</p>
              </div>
              <div class="p-4 rounded-lg nes-diamond-crimson">
                <h4 class="font-semibold text-enhanced-text-primary">Crimson Diamonds</h4>
                <p class="text-sm text-enhanced-text-secondary">Harvard-themed pattern</p>
              </div>
            </div>
          </div>
        {:else if modalVariant === 'gaming'}
          <div class="space-y-4">
            <h3
              class="text-xl font-bold text-enhanced-text-primary"
              style="font-family: 'Press Start 2P', monospace;"
            >
              Gaming Modal
            </h3>
            <p class="text-enhanced-text-secondary">
              A gaming-themed modal with cyberpunk aesthetics, scan lines, and terminal-style
              elements.
            </p>
            <div class="space-y-4">
              <div
                class="p-4 rounded-lg bg-enhanced-bg-secondary border border-enhanced-accent gaming-scan-lines"
              >
                <h4 class="font-semibold text-enhanced-text-primary mb-2">Terminal Interface</h4>
                <div class="font-mono text-green-400 text-sm">
                  <div>> System Status: ONLINE</div>
                  <div>> AI Models: LOADED</div>
                  <div>> GPU Acceleration ENABLED</div>
                  <div>> Legal Database: CONNECTED</div>
                </div>
              </div>
              <div class="flex space-x-2">
                <!-- use the any-typed alias to allow arbitrary onclick handlers without TS errors -->
                <QuickActionButtonAny
                  onclick={() => {
                    /* execute action */
                  }}>Execute</QuickActionButtonAny
                >
                <QuickActionButtonAny
                  onclick={() => {
                    /* open terminal */
                  }}>Terminal</QuickActionButtonAny
                >
                <button class="nes-btn is-success">Success</button>
              </div>
            </div>
          </div>
        {:else if modalVariant === 'legal'}
          <div class="space-y-4">
            <h3 class="text-xl font-bold text-enhanced-text-primary">Legal Document Modal</h3>
            <p class="text-enhanced-text-secondary">
              Professional modal styling for legal documents, case management, and court filings.
            </p>
            <div class="space-y-4">
              <StatsCard title="Case File #2024-001" value="Harvard Law" />
            </div>
          </div>
        {:else}
          <div class="space-y-4">
            <h3 class="text-xl font-bold text-enhanced-text-primary">Default Modal Content</h3>
            <p class="text-enhanced-text-secondary">
              This is the default modal styling with clean, professional appearance.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatsCard title="Feature Card" value="Standard" />
              <StatsCard title="Grey Card" value="NES-style" />
            </div>
          </div>
        {/if}

        <!-- Common Modal Footer -->
        <div class="flex justify-end space-x-2 pt-4 border-t border-enhanced-border">
          <QuickActionButtonAny onclick={() => closeModal()}>Cancel</QuickActionButtonAny>
          <QuickActionButtonAny onclick={() => closeModal()}>Confirm</QuickActionButtonAny>
        </div>
      </div>
    </form>
  </dialog>
{/if}

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
  .dialog-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1.25rem;
  }
  h1 {
    font-family: 'Press Start 2P', monospace;
    font-size: 1.1rem;
  }
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
    justify-content: space-betweenn;
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
  .feature-list {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
  }
  .feature-list li {
    margin: 0.25rem 0;
    padding: 0.25rem 0;
  }
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
</style>
