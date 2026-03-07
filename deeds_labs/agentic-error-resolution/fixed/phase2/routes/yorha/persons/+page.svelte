<script lang="ts">
  // Svelte 5 runes are auto-imported
  // $state and $derived are available in runes mode via types, not runtime imports
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import * as Lucide from 'lucide-svelte';
  function resolveIcon(name: string) {
    const ns = Lucide as any;
    // try exact name, then lowercase, then default export (some builds), then undefined
    return ns[name] ?? ns[name.toLowerCase()] ?? ns.default?.[name] ?? ns.default ?? undefined;
  }
  const Search = resolveIcon('Search');
  const Plus = resolveIcon('Plus');
  const Eye = resolveIcon('Eye');
  const Edit = resolveIcon('Edit');
  const Trash2 = resolveIcon('Trash2');
  const AlertTriangle = resolveIcon('AlertTriangle');
  const Shield = resolveIcon('Shield');
  // Persons of Interest data
  let persons = $state([
    {
      id: 'POI-001',
      name: 'Marcus Chen',
      alias: 'The Ghost',
      threat_level: 'high',
      status: 'wanted',
      last_seen: '2024-01-15',
      location: 'Downtown District',
      description: 'Former cybersecurity expert turned corporate spy',
      cases: ['CASE-2024-087', 'CASE-2024-089'],
      photo: null,
    },
    {
      id: 'POI-002',
      name: 'Sarah Williams',
      alias: 'Red Phoenix',
      threat_level: 'medium',
      status: 'surveillance',
      last_seen: '2024-01-20',
      location: 'Tech Quarter',
      description: 'Data analyst with suspicious financial transactions',
      cases: ['CASE-2024-088'],
      photo: null,
    },
    {
      id: 'POI-003',
      name: 'Unknown Subject',
      alias: 'Digital Phantom',
      threat_level: 'critical',
      status: 'active',
      last_seen: '2024-01-22',
      location: 'Multiple Networks',
      description: 'Advanced persistent threat actor, identity unknown',
      cases: ['CASE-2024-087', 'CASE-2024-090'],
      photo: null,
    },
  ]);
  let searchQuery = $state('');
  let selectedThreatLevel = $state('all');
  let showNewPersonModal = $state(false);
  // New person form state for the modal
  let newPerson = $state({
    name: '',
    alias: '',
    threat_level: 'low',
    status: 'surveillance',
    description: '',
    last_seen: '',
    location: '',
  });
  let isLoading = $state(false);
  let error: string | null = $state(null);
  // Filter persons based on search and threat level
  let filteredPersons = $derived(() => {
    // make a shallow copy to avoid mutating original
    let filtered = persons ? [...persons] : [];
    const q = (searchQuery || '').trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (item) =>
          (item.name || '').toLowerCase().includes(q) ||
          (item.alias || '').toLowerCase().includes(q) ||
          (item.description || '').toLowerCase().includes(q)
      );
    }
    if (selectedThreatLevel && selectedThreatLevel !== 'all') {
      filtered = filtered.filter((item) => item.threat_level === selectedThreatLevel);
    }
    return filtered;
  });
  function getThreatLevelColor(level: string) {
    switch (level) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-black';
      case 'low':
        return 'bg-green-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  }
  function getStatusColor(status: string) {
    switch (status) {
      case 'wanted':
        return 'bg-red-600 text-white';
      case 'surveillance':
        return 'bg-blue-600 text-white';
      case 'active':
        return 'bg-orange-600 text-white';
      case 'cleared':
        return 'bg-green-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  }
  // Load persons from API
  async function loadPersons() {
    try {
      isLoading = true;
      error = null;
      const response = await fetch('/api/persons-of-interest');
      if (response && response.ok) {
        const data = await response.json();
        persons = data?.persons || persons; // Fallback to mock data
      }
    } catch (err) {
      error = 'Failed to load persons of interest';
      console.warn('Using mock data due to API error:', err);
    } finally {
      isLoading = false;
    }
  }
  // Add new person
  async function addPerson(personData: any) {
    try {
      const response = await fetch('/api/persons-of-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personData),
      });
      if (response.ok) {
        const created = await response.json();
        persons = [...persons, created];
        showNewPersonModal = false;
      }
    } catch (err) {
      error = 'Failed to add person';
      console.error('Add person failed:', err);
    }
  }
  // Handler wired to modal's ADD PERSON button
  async function handleAddPerson() {
    // minimal validation
    if (!newPerson.name || newPerson.name.trim().length === 0) {
      error = 'Name is required';
      return;
    }
    try {
      await addPerson(newPerson);
      newPerson = {
        name: '',
        alias: '',
        threat_level: 'low',
        status: 'surveillance',
        description: '',
        last_seen: '',
        location: '',
      };
      showNewPersonModal = false;
      error = null;
    } catch (err) {
      console.error('Failed to add person from modal', err);
      error = 'Failed to add person';
    }
  }
  $effect(() => {
    loadPersons();
  });
</script>

<svelte:head>
  <title>PERSONS OF INTEREST - YoRHa Detective Interface</title>
</svelte:head>
<!-- YoRHa Interface -->
<div class="yorha-interface">
  <!-- Left Sidebar -->
  <aside class="yorha-sidebar">
    <div class="yorha-logo">
      <div class="yorha-title">YORHA</div>
      <div class="yorha-subtitle">DETECTIVE</div>
      <div class="yorha-subtext">Investigation Interface</div>
    </div>
    <nav class="yorha-nav">
      <div class="nav-section">
        <a href="/yorha-command-center" class="nav-item">
          <span class="nav-icon">⌂</span>
          COMMAND CENTER
        </a>
        <a href="/yorha/cases" class="nav-item">
          <span class="nav-text">ACTIVE CASES</span>
          <span class="nav-count">3</span>
        </a>
        <a href="/evidenceboard" class="nav-item">
          <span class="nav-icon">📁</span>
          EVIDENCE
        </a>
        <button class="nav-item persons-active">
          <span class="nav-icon">👤</span>
          PERSONS OF INTEREST
        </button>
        <a href="/yorha/analysis" class="nav-item">
          <span class="nav-icon">📊</span>
          ANALYSIS
        </a>
        <a href="/yorha/search" class="nav-item">
          <span class="nav-icon">🔍</span>
          GLOBAL SEARCH
        </a>
        <a href="/yorha/terminal" class="nav-item">
          <span class="nav-icon">></span>
          TERMINAL
        </a>
      </div>
      <div class="nav-section">
        <a href="/yorha/config" class="nav-item">
          <span class="nav-icon">⚙</span>
          SYSTEM CONFIG
        </a>
      </div>
    </nav>
    <div class="yorha-status">
      <div class="status-item">Online</div>
      <div class="status-time">{new Date().toLocaleTimeString()}</div>
      <div class="status-text">System: Operational</div>
    </div>
  </aside>
  <!-- Main Content -->
  <main class="yorha-main">
    <!-- Header -->
    <header class="persons-header">
      <div class="header-left">
        <button class="header-icon">👤</button>
        <h1 class="persons-title">PERSONS OF INTEREST</h1>
        <div class="persons-subtitle">Surveillance and Investigation Targets</div>
      </div>
      <div class="header-right">
        <Button class="header-btn bits-btn bits-btn" onclick={() => (showNewPersonModal = true)}>
          <Plus class="w-4 h-4" />
          ADD PERSON
        </Button>
      </div>
    </header>
    <!-- Search and Filters -->
    <div class="search-toolbar">
      <div class="search-section">
        <div class="search-input-wrapper">
          <Search class="search-icon w-4 h-4" />
          <Input
            type="text"
            placeholder="Search persons, aliases, descriptions..."
            bind:value={searchQuery}
            class="search-input"
          />
        </div>
        <select bind:value={selectedThreatLevel} class="threat-filter">
          <option value="all">All Threat Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="stats-section">
        <div class="stat-item">
          <span class="stat-number">{persons.length}</span>
          <span class="stat-label">Total Persons</span>
        </div>
        <div class="stat-item critical">
          <span class="stat-number"
            >{persons.filter((item) => item.threat_level === 'critical').length}</span
          >
          <span class="stat-label">Critical</span>
        </div>
        <div class="stat-item high">
          <span class="stat-number"
            >{persons.filter((item) => item.status === 'wanted').length}</span
          >
          <span class="stat-label">Wanted</span>
        </div>
      </div>
    </div>
    <!-- Error State -->
    {#if error}
      <div class="error-banner">
        <AlertTriangle class="w-4 h-4" />
        {error}
      </div>
    {/if}
    <!-- Persons Grid -->
    <div class="persons-grid">
      {#if isLoading}
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading persons of interest...</div>
        </div>
      {:else}
        {#each filteredPersons as person (person.id)}
          <!-- use direct component tags (Svelte 5 supports dynamic component variables) -->
          <Card class="person-nier-bits-card nes-container">
            <div class="person-header nes-container">
              <div class="person-photo">
                {#if person.photo}
                  <img src={person.photo} alt={person.name} />
                {:else}
                  <div class="photo-placeholder">
                    <Shield class="w-8 h-8" />
                  </div>
                {/if}
              </div>
              <div class="person-basic-info">
                <div class="person-name">{person.name}</div>
                <div class="person-alias">"{person.alias}"</div>
                <div class="person-id">{person.id}</div>
              </div>
              <div class="person-badges">
                <Badge class={getThreatLevelColor(person.threat_level)}>
                  {person.threat_level.toUpperCase()}
                </Badge>
                <Badge class={getStatusColor(person.status)}>
                  {person.status.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div class="person-content nes-container">
              <div class="person-details">
                <div class="detail-row">
                  <span class="detail-label">Last Seen:</span>
                  <span class="detail-value">{person.last_seen}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Location</span>
                  <span class="detail-value">{person.location}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Cases:</span>
                  <span class="detail-value">{person.cases.length} active</span>
                </div>
              </div>
              <div class="person-description">
                {person.description}
              </div>
              <div class="person-cases">
                {#each Array.isArray(person.cases) ? person.cases : [] as caseId}
                  <span
                    class="case-badge px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                    >{caseId}</span
                  >
                {/each}
              </div>
            </div>

            <div class="person-actions nes-container card-footer">
              <Button class="bits-btn" size="sm" variant="ghost">
                <Eye class="w-4 h-4" />
                View
              </Button>
              <Button class="bits-btn" size="sm" variant="ghost">
                <Edit class="w-4 h-4" />
                Edit
              </Button>
              <Button class="bits-btn" size="sm" variant="destructive">
                <Trash2 class="w-4 h-4" />
                Remove
              </Button>
            </div>
          </Card>
        {/each}
      {/if}
    </div>

    {#if filteredPersons.length === 0}
      <div class="empty-state">
        <div class="empty-icon">👤</div>
        <div class="empty-title">No Persons Found</div>
        <!-- fixed missing quote in class attribute -->
        <div class="empty-subtitle">
          {searchQuery
            ? 'Try adjusting your search criteria'
            : 'Add persons of interest to begin tracking'}
        </div>
      </div>
    {/if}
  </main>
</div>

{#if showNewPersonModal}
  <!-- overlay: focusable, has ARIA role and keyboard handler to close modal -->
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    aria-label="Close person modal"
    onclick={() => (showNewPersonModal = false)}
    onkeydown={(e) => {
      // Close on Enter / Space / Escape for keyboard users
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'Escape') {
        showNewPersonModal = false;
      }
    }}
  >
    <!-- dialog: stop propagation explicitly, labelled, modal semantics -->
    <div
      class="yorha-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <header class="dialog-header">
        <!-- ensure the heading has the id referenced by aria-labelledby -->
        <h3 id="dialog-title" class="dialog-title">ADD PERSON OF INTEREST</h3>
        <button
          class="close-btn"
          aria-label="Close"
          type="button"
          onclick={() => (showNewPersonModal = false)}>×</button
        >
      </header>

      <div class="modal-form">
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="full-name">FULL NAME</label>
            <Input
              id="full-name"
              placeholder="Enter full name"
              class="yorha-input"
              bind:value={newPerson.name}
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="alias">ALIAS / CODENAME</label>
            <Input
              id="alias"
              placeholder="Known alias or codename"
              class="yorha-input"
              bind:value={newPerson.alias}
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="threat-level">THREAT LEVEL</label>
            <select id="threat-level" class="yorha-select" bind:value={newPerson.threat_level}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="status">STATUS</label>
            <select id="status" class="yorha-select" bind:value={newPerson.status}>
              <option value="surveillance">Under Surveillance</option>
              <option value="wanted">Wanted</option>
              <option value="active">Active Investigation</option>
              <option value="cleared">Cleared</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="last-seen">LAST SEEN DATE</label>
            <Input
              id="last-seen"
              type="date"
              class="yorha-input"
              bind:value={newPerson.last_seen}
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="location">LAST KNOWN LOCATION</label>
            <Input
              id="location"
              placeholder="e.g. Downtown District"
              class="yorha-input"
              bind:value={newPerson.location}
            />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label" for="description">DESCRIPTION</label>
            <textarea
              id="description"
              placeholder="Physical description, known activities, etc."
              rows="4"
              class="yorha-textarea"
              bind:value={newPerson.description}
            ></textarea>
          </div>
        </div>
      </div>

      <footer class="dialog-footer">
        <Button
          class="bits-btn"
          variant="ghost"
          onclick={() => {
            showNewPersonModal = false;
            newPerson = {
              name: '',
              alias: '',
              threat_level: 'low',
              status: 'surveillance',
              description: '',
              last_seen: '',
              location: '',
            };
          }}
        >
          CANCEL
        </Button>

        <Button class="bits-btn" onclick={handleAddPerson}>ADD PERSON</Button>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* Replaced corrupted stylesheet with a cleaned version. Keep selectors used in markup. */
  .yorha-interface {
    display: flex;
    height: 100vh;
    background: #2a2a2a;
    color: #d4af37;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }

  /* Sidebar */
  .yorha-sidebar {
    width: 200px;
    background: #1a1a1a;
    border-right: 1px solid #3a3a3a;
    display: flex;
    flex-direction: column;
  }
  .yorha-logo {
    padding: 20px 15px;
  }
  .yorha-title,
  .yorha-subtitle {
    font-size: 18px;
    font-weight: bold;
    color: #d4af37;
    line-height: 1;
  }
  .yorha-subtext {
    font-size: 10px;
    color: #888;
    padding-top: 8px;
    border-bottom: 1px solid #3a3a3a;
  }
  .yorha-nav {
    padding: 10px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 8px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    color: #888;
    text-decoration: none;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
    justify-content: space-between;
    font-size: 11px;
  }
  .nav-item:hover {
    background: #2a2a2a;
    color: #d4af37;
  }
  .nav-item.persons-active {
    background: #162016;
    color: #d4af37;
    border-left: 3px solid #d4af37;
    padding-left: 9px;
  }
  .nav-count {
    font-size: 10px;
    background: #d4af37;
    color: #000;
    padding: 1px 6px;
    border-radius: 2px;
  }

  /* Main area */
  .yorha-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #2a2a2a;
    overflow: hidden;
  }
  .persons-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid #3a3a3a;
    background: #2a2a2a;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-icon {
    background: none;
    border: 1px solid #555;
    color: #d4af37;
    padding: 6px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
  }
  .persons-title {
    font-size: 24px;
    font-weight: bold;
    color: #d4af37;
    margin: 0;
  }
  .persons-subtitle {
    font-size: 12px;
    color: #888;
  }

  /* Search toolbar */
  .search-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: #242424;
    border-bottom: 1px solid #3a3a3a;
  }
  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  :global(.search-icon) {
    position: absolute;
    left: 10px;
  }
  :global(.search-input) {
    padding-left: 36px !important;
    background: #1a1a1a !important;
    border: 1px solid #555 !important;
    color: #d4af37 !important;
    min-width: 300px;
  }
  .threat-filter {
    background: #1a1a1a;
    border: 1px solid #555;
    color: #d4af37;
    padding: 6px 12px;
    font-family: inherit;
    font-size: 12px;
  }

  /* Stats */
  .stats-section {
    display: flex;
    gap: 20px;
    color: #d4af37;
    align-items: center;
  }
  .stat-item {
    text-align: center;
    font-size: 11px;
  }
  .stat-number {
    font-size: 18px;
    font-weight: bold;
    color: #d4af37;
  }
  .stat-item.critical .stat-number {
    color: #ef4444;
  }
  .stat-item.high .stat-number {
    color: #f97316;
  }

  /* Persons grid & cards */
  .persons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 20px;
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }
  :global(.person-nier-bits-card) {
    background: #1a1a1a !important;
    border: 1px solid #3a3a3a !important;
    padding: 12px;
  }
  .person-header {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .person-photo {
    width: 60px;
    height: 60px;
    border-radius: 4px;
    overflow: hidden;
    background: #2a2a2a;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .photo-placeholder {
    color: #666;
  }
  .person-basic-info {
    flex: 1;
  }
  .person-name {
    font-size: 16px;
    font-weight: bold;
    color: #d4af37;
    margin-bottom: 2px;
  }
  .person-alias,
  .person-id {
    font-size: 10px;
    color: #666;
    font-family: 'JetBrains Mono', monospace;
    margin: 4px 0;
  }
  .person-badges {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .person-details {
    color: #888;
    margin: 12px 0;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    font-size: 11px;
  }
  .detail-label {
    color: #888;
  }
  .detail-value {
    color: #d4af37;
  }
  .person-description {
    font-size: 11px;
    color: #ccc;
    line-height: 1.4;
    margin: 8px 0;
  }
  .person-cases {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 8px 0;
  }
  .case-badge {
    font-size: 9px;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #333;
    background: #151515;
    color: #d4af37;
  }

  /* Actions */
  .person-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* Empty / loading / error */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #666;
    text-align: center;
  }
  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }
  .empty-title {
    font-size: 18px;
    color: #888;
    margin-bottom: 8px;
  }
  .empty-subtitle {
    font-size: 12px;
    color: #999;
    margin-bottom: 10px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: #4a1a1a;
    border: 1px solid #ef4444;
    color: #fca5a5;
    font-size: 12px;
    margin: 15px 20px;
    border-radius: 4px;
  }
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #888;
  }
  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 2px solid #3a3a3a;
    border-top: 2px solid #d4af37;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 12px;
  }
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .yorha-modal {
    width: 720px;
    max-width: 95%;
    background: #2a2a2a;
    border: 2px solid #d4af37;
    color: #d4af37;
    padding: 16px;
    border-radius: 6px;
  }
  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .dialog-title {
    font-size: 14px;
    font-weight: bold;
  }
  .close-btn {
    background: transparent;
    border: none;
    color: #d4af37;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    padding: 8px 0 0 0;
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .form-field-full {
    grid-column: 1 / -1;
  }
  .form-label {
    font-size: 11px;
    font-weight: bold;
    color: #d4af37;
    text-transform: uppercase;
  }
  :global(.yorha-input) {
    background: #1a1a1a !important;
    border: 1px solid #555 !important;
    color: #d4af37 !important;
    font-family: inherit !important;
    padding: 8px;
  }
  .yorha-select {
    background: #1a1a1a;
    border: 1px solid #555;
    color: #d4af37;
    padding: 6px 10px;
    font-size: 12px;
  }
  .yorha-textarea {
    background: #1a1a1a;
    border: 1px solid #555;
    color: #d4af37;
    padding: 8px 10px;
    font-size: 12px;
    resize: vertical;
  }
  .dialog-footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 12px;
  }
</style>
