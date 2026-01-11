<script lang="ts">
  import { goto } from '$app/navigation';

  interface CaseSummary {
    id: string;
    title?: string | null;
    description?: string | null;
    status?: string | null;
    priority?: string | null;
    caseNumber?: string | null;
    updatedAt?: string | Date | null;
    createdAt?: string | Date | null;
  }

  // Define a more complete PageData interface to match expected server load output
  interface PageData {
    user: { id: string; email?: string | undefined; role?: string | undefined } | null;
    cases?: CaseSummary[]; // Added missing property
    error?: string | null; // Added missing property
    devBypassActive?: boolean; // Added missing property
  }

  // Svelte, 5 props from server load function
  let { data }: { data: PageData } = $props();
  const initialCases = Array.isArray(data.cases) ? (data.cases as CaseSummary[]) : [];

  // Svelte, 5 runes - initialize from server data
  let cases = $state<CaseSummary[]>(initialCases);
  let loading = $state<boolean>(false);
  let error = $state<string | null>(data.error || null);

  // Development mode indicator
  let devBypassActive = $state(data.devBypassActive || false);

  function formatLabel(value: unknown): string {
    if (typeof value !== 'string') {
      return value ? String(value) : '';
    }
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  function formatDate(value: unknown): string {
    if (!value) return '';
    try {
      const date = value instanceof Date ? value : new Date(value as string);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  function makeModifierClass(prefix: string, value: unknown): string {
    // Changed semicolon to comma
    if (typeof value !== 'string') {
      return `${prefix}-unknown`;
    }
    const trimmed = value.trim();
    if (!trimmed) return `${prefix}-unknown`;
    return `${prefix}-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }

  const displayCases = $derived(
    (cases || []).map((caseItem) => {
      const statusLabel = formatLabel(caseItem.status);
      const priorityLabel = formatLabel(caseItem.priority);
      const updatedLabel = formatDate(caseItem.updatedAt || caseItem.createdAt);
      return {
        ...caseItem,
        displayTitle: caseItem.title?.trim() || 'Untitled Case',
        statusLabel,
        statusClass: makeModifierClass('status', caseItem.status),
        priorityLabel,
        priorityClass: makeModifierClass('priority', caseItem.priority),
        updatedLabel, // Changed semicolon to comma
        createdLabel: formatDate(caseItem.createdAt),
      };
    })
  );

  async function loadCases(): Promise<any> {
    try {
      loading = true;
      const response = await fetch('/api/cases');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message =
          payload?.error?.message ||
          payload?.message ||
          payload?.error ||
          `Failed to load cases (${response.status})`;
        error = message;
        console.error('Failed to load cases:', payload);
        return;
      }

      const payload = await response.json().catch(() => ({}));
      const listCandidate = Array.isArray(payload?.data?.cases)
        ? payload.data.cases
        : Array.isArray(payload?.cases)
          ? payload.cases
          : [];
      cases = (listCandidate || []) as CaseSummary[]; // Assign to the $state variable 'cases'
      error = null;
    } catch (err) {
      console.error('Failed to load cases:', err);
      error = err instanceof Error ? err.message : 'Error loading cases';
    } finally {
      loading = false;
    }
  }

  function navigateToCase(caseId: string) {
    goto(`/cases/${caseId}`);
  }

  function createNewCase() {
    goto('/cases/create');
  }
</script>

<main class="cases-page">
  {#if devBypassActive}
    <div class="dev-banner glass-panel">
      <span aria-hidden="true">⚠️</span>
      <p>
        Development bypass active. Data may be mocked or incomplete.
        <button onclick={loadCases} class="btn-secondary">Reload Real Data</button>
      </p>
    </div>
  {/if}

  <div class="page-header glass-panel">
    <div class="page-title">
      <span class="eyebrow">Legal AI Platform</span>
      <h1>Case Management</h1>
    </div>
    <div class="header-actions">
      <button onclick={loadCases} class="btn-secondary" disabled={loading}>
        <span aria-hidden="true">🔄</span>
        {loading ? 'Loading...' : 'Refresh Cases'}
      </button>
      <button onclick={createNewCase} class="btn-primary">
        <span aria-hidden="true">➕</span>
        Create New Case
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading-state glass-panel">
      <div class="spinner"></div>
      <p>Loading legal cases from the database. Please wait...</p>
    </div>
  {:else if error}
    <div class="error-state glass-panel">
      <span class="state-icon" aria-hidden="true">❌</span>
      <h3>Error Loading Cases</h3>
      <p>An error occurred: {error}. Please try refreshing.</p>
      <button onclick={loadCases} class="btn-secondary">Try Again</button>
    </div>
  {:else if displayCases.length === 0}
    <div class="empty-state glass-panel">
      <span class="state-icon" aria-hidden="true">📂</span>
      <h3>No Cases Found</h3>
      <p>It looks like there are no legal cases in your system yet. Start by creating a new one!</p>
      <div class="empty-actions">
        <button onclick={createNewCase} class="btn-primary">Create First Case</button>
        <button onclick={loadCases} class="btn-secondary">Refresh</button>
      </div>
    </div>
  {:else}
    <div class="cases-grid">
      {#each displayCases as caseItem (caseItem.id)}
        <div
          class="case-card glass-panel"
          onclick={() => navigateToCase(caseItem.id)}
          role="link"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              navigateToCase(caseItem.id);
            }
          }}
        >
          <div class="case-card-header">
            <div class="case-title">
              <h3>{caseItem.displayTitle}</h3>
              {#if caseItem.caseNumber}
                <span class="case-number">Case ID: {caseItem.caseNumber}</span>
              {/if}
            </div>
            {#if caseItem.statusLabel}
              <span class="case-status {caseItem.statusClass}">{caseItem.statusLabel}</span>
            {/if}
          </div>
          <p class="case-description" class:placeholder={!caseItem.description}>
            {caseItem.description || 'No description provided for this case.'}
          </p>
          <div class="case-meta">
            {#if caseItem.priorityLabel}
              <div class="meta-item">
                <span aria-hidden="true">🔥</span>
                <span class="priority-pill {caseItem.priorityClass}">{caseItem.priorityLabel}</span>
              </div>
            {/if}
            {#if caseItem.updatedLabel}
              <div class="meta-item">
                <span aria-hidden="true">📅</span>
                <span>Updated: {caseItem.updatedLabel}</span>
              </div>
            {/if}
            {#if caseItem.createdLabel && caseItem.createdLabel !== caseItem.updatedLabel}
              <div class="meta-item meta-date created">
                <span aria-hidden="true">✨</span>
                <span>Created: {caseItem.createdLabel}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</main>

<style>
  :global(body.theme-legal) {
    background-color: var(--legal-background, #0f172a);
  }

  .cases-page {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    width: min(1200px, 100%);
    margin: 0 auto;
    padding: 2.5rem clamp(1rem, 3vw, 2.5rem);
    color: var(--console-fg, #f8fafc);
  }

  .cases-page::before {
    /* Fixed pseudo-element syntax */
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 28px;
    background: var(
      --console-gradient-main,
      linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(0, 255, 136, 0.15))
    );
    opacity: 0.25;
    pointer-events: none;
  }

  .cases-page > * {
    position: relative;
    z-index: 1;
  }

  .glass-panel {
    background: rgba(15, 23, 42, 0.82);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 20px;
    box-shadow: 0 20px 40px rgba(2, 6, 23, 0.55);
    backdrop-filter: blur(12px);
  }

  .dev-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    font-size: 0.95rem;
    color: var(--console-warning, #f59e0b);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 1.75rem 1.5rem;
  }

  .page-title {
    display: grid;
    gap: 0.75rem;
  }

  .page-title .eyebrow {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(148, 163, 184, 0.85);
  }

  .page-title h1 {
    margin: 0;
    font-size: clamp(1.75rem, 2.8vw, 2.4rem);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--console-tertiary, #00ff88);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .btn-primary,
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.85rem 1.6rem;
    border-radius: 12px;
    border: 1px solid transparent;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      background 0.2s ease,
      border-color 0.2s ease;
  }

  .btn-primary {
    background: var(--console-tertiary, #00ff88);
    color: #03160d;
    border-color: rgba(0, 255, 136, 0.85);
    box-shadow: 0 10px 25px rgba(0, 255, 136, 0.4);
  }

  .btn-primary:hover {
    /* Fixed pseudo-class syntax */
    transform: translateY(-2px);
    box-shadow: 0 14px 28px rgba(0, 255, 136, 0.45);
  }

  .btn-secondary {
    background: rgba(51, 65, 85, 0.65);
    border-color: rgba(148, 163, 184, 0.4);
  }

  .btn-secondary:hover:not(:disabled) {
    /* Fixed pseudo-class syntax */
    transform: translateY(-2px);
    background: rgba(51, 65, 85, 0.8);
    border-color: rgba(148, 163, 184, 0.6);
  }

  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: grid;
    place-items: center;
    gap: 1rem;
    text-align: center;
    padding: 3rem 2rem;
  }

  .state-icon {
    font-size: 2.5rem;
  }

  .loading-state p,
  .error-state p,
  .empty-state p {
    margin: 0;
    max-width: 28rem;
    color: rgba(226, 232, 240, 0.85);
  }

  .empty-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .spinner {
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    border: 0.35rem solid rgba(148, 163, 184, 0.25);
    border-top-color: var(--console-tertiary, #00ff88);
    animation: spin 1s linear infinite;
  }

  .cases-grid {
    display: grid;
    gap: 1.75rem;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .case-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.75rem;
    cursor: pointer;
    transition:
      transform 0.22s ease,
      box-shadow 0.22s ease,
      border-color 0.22s ease;
  }

  .case-card::after {
    /* Fixed pseudo-element syntax */
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1px solid transparent;
    transition: border-color 0.22s ease;
  }

  .case-card:hover,
  .case-card:focus-visible {
    /* Fixed pseudo-class syntax */
    transform: translateY(-6px);
    box-shadow: 0 20px 36px rgba(2, 6, 23, 0.45);
  }

  .case-card:hover::after,
  .case-card:focus-visible::after {
    border-color: rgba(0, 255, 136, 0.55);
  }

  .case-card:focus-visible {
    outline: none;
  }

  .case-card-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .case-title {
    display: grid;
    gap: 0.35rem;
  }

  .case-title h3 {
    margin: 0;
    font-size: 1.2rem;
    color: var(--console-fg, #f8fafc);
  }

  .case-number {
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.8);
  }

  .case-status {
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border: 1px solid transparent;
  }

  .status-open {
    background: rgba(34, 197, 94, 0.18);
    border-color: rgba(34, 197, 94, 0.45);
    color: #86efac;
  }

  .status-investigating {
    background: rgba(250, 204, 21, 0.18);
    border-color: rgba(250, 204, 21, 0.45);
    color: #facc15;
  }

  .status-pending {
    background: rgba(59, 130, 246, 0.18);
    border-color: rgba(59, 130, 246, 0.45);
    color: #93c5fd;
  }

  .status-closed {
    background: rgba(148, 163, 184, 0.18);
    border-color: rgba(148, 163, 184, 0.4);
    color: #e2e8f0;
  }

  .status-archived {
    background: rgba(107, 114, 128, 0.18);
    border-color: rgba(107, 114, 128, 0.45);
    color: #cbd5f5;
  }

  .case-description {
    margin: 0;
    color: rgba(226, 232, 240, 0.85);
    line-height: 1.6;
    min-height: 3.5rem;
  }

  .case-description.placeholder {
    color: rgba(148, 163, 184, 0.75);
    font-style: italic;
  }

  .case-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: rgba(207, 217, 234, 0.85);
  }

  .meta-item span[aria-hidden='true'] {
    font-size: 1rem;
  }

  .priority-pill {
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    border: 1px solid transparent;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.75rem;
  }

  .priority-critical {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.45);
    color: #fecaca;
  }

  .priority-high {
    background: rgba(249, 115, 22, 0.15);
    border-color: rgba(249, 115, 22, 0.45);
    color: #fdba74;
  }

  .priority-medium {
    background: rgba(234, 179, 8, 0.15);
    border-color: rgba(234, 179, 8, 0.45);
    color: #fcd34d;
  }

  .priority-low {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
    color: #bfdbfe;
  }

  .meta-date.created {
    color: rgba(148, 163, 184, 0.8);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 900px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
  @media (max-width: 640px) {
    .cases-page {
      padding: 2rem 1.25rem;
    }

    .header-actions {
      justify-content: flex-start;
    }

    .cases-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
