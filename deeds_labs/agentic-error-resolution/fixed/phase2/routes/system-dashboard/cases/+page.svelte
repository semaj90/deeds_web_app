<script lang="ts">
  // Svelte 5 runes are auto-imported
  import  Button, Card, Input  from "$lib/components/ui/enhanced-bits.svelte";
  import type { onMount  } from 'svelte';
  import type { goto  } from '$app/navigation';
  import type { PageData } from './$types';

  type Case = {
    id: string;
    title: string;
    status: string;
    progress: number;
    evidenceCount: number;
    lastUpdate: string | number | Date;
  };

  let { data }: { data: PageData & { cases?: Case[] } } = $props();

  // replace server-provided data usage with local state that can be refreshed
  let cases: Case[] = data.cases ?? [];

  let searchQuery = $state('');

  // make filteredCases a reactive derived value so it updates correctly
  let filteredCases = $derived(() => {
    const q = (searchQuery ?? '').toString().trim().toLowerCase();
    return cases.filter((c) => c.title.toLowerCase().includes(q));
  });

  // load cases from API on mount
  onMount(async () => {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        cases = await res.json();
      } else {
        console.warn('Failed to load cases:', res.status);
      }
    } catch (err) {
      console.error('Error fetching cases:', err);
    }
  });

  async function runAnalysis(caseId: string) {
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'analyze' })
      });
      if (!res.ok) throw new Error(`analysis failed: ${res.status}`);
      // optional: update local case progress/status after enqueue
      const updated = await res.json();
      cases = cases.map(c => c.id === caseId ? { ...c, ...updated } : c);
    } catch (err) {
      console.error('Triggering AI analysis failed:', err);
    }
  }

  async function generateReport(caseId: string) {
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'report' })
      });
      if (!res.ok) throw new Error(`report failed: ${res.status}`);
      const updated = await res.json();
      cases = cases.map(c => c.id === caseId ? { ...c, ...updated } : c);
    } catch (err) {
      console.error('Generating report failed:', err);
    }
  }

  async function deleteCase(caseId: string) {
    if (!confirm(`Are you sure you want to delete this case? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/cases/${caseId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      // optimistic UI update
      cases = cases.filter((c) => c.id !== caseId);
    } catch (err) {
      console.error('Deleting case failed:', err);
    }
  }

  // use goto for navigation (avoid using href prop on Button)
  // replace on:click with onclick (component expects onclick prop in this codebase)
  async function openEvidenceBoard(caseId: string) {
    await goto(`/evidenceboard?case=${caseId}`);
  }
  async function openDetails(caseId: string) {
    await goto(`/system-dashboard/cases/${caseId}`);
  }
</script>

<svelte:head>
  <title>Cases Dashboard - YoRHa Legal AI</title>
</svelte:head>
<div class="cases-dashboard">
  <div class="header nes-container with-title">
    <p class="title">📁 CASES TERMINAL</p>
    <p class="subtitle">Active Investigations & Analysis</p>
  </div>
  <div class="controls">
    <!-- use value + oninput because Input.value is not bindable in this component -->
    <Input
      value={searchQuery}
      oninput={(e) => (searchQuery = (e.target as HTMLInputElement).value)}
      placeholder="Search cases..."
    />
    <Button variant="primary">➕ NEW CASE</Button>
  </div>
  <div class="cases-grid">
    {#if filteredCases.length > 0}
      {#each filteredCases as case_ (case_.id)}
        <Card class="case-card">
          <div class="case-header">
            <h3>{case_.title}</h3>
            <span class="status-badge nes-badge">
              <span
                class={case_.status === 'active'
                  ? 'is-success'
                  : case_.status === 'error'
                    ? 'is-error'
                    : 'is-warning'}
              >
                {case_.status.toUpperCase()}
              </span>
            </span>
          </div>
          <div class="case-stats">
            <div class="stat">
              <span>Progress: {case_.progress}%</span>
              <div class="progress-bar">
                <div class="progress-fill" style="width: {case_.progress}%"></div>
              </div>
            </div>
            <div class="stat">
              <span>Evidence: {case_.evidenceCount} items</span>
            </div>
            <div class="stat">
              <span>Updated: {new Date(case_.lastUpdate).toLocaleString()}</span>
            </div>
          </div>
          <div class="case-actions">
            <!-- navigation via goto -->
            <Button onclick={() => openEvidenceBoard(case_.id)} variant="primary" size="sm"
              >🔍 Evidence Board</Button
            >
            <Button onclick={() => openDetails(case_.id)} variant="secondary" size="sm"
              >📝 Details</Button
            >

            <!-- use onclick prop instead of on:click -->
            <Button onclick={() => runAnalysis(case_.id)} variant="secondary" size="sm"
              >🤖 Run Analysis</Button
            >
            <Button onclick={() => generateReport(case_.id)} variant="ghost" size="sm"
              >📄 Generate Report</Button
            >
            <Button onclick={() => deleteCase(case_.id)} variant="destructive" size="sm"
              >🗑️ Delete</Button
            >
          </div>
        </Card>
      {/each}
    {:else}
      <div class="nes-container is-dark with-title">
        <p class="title">No Results</p>
        <p>No cases match your search query, or no cases are available.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .cases-dashboard {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .header {
    background: linear-gradient(135deg, #4a90e2, #7ed321) !important;
    text-align: center;
  }
  .header .title {
    color: white !important;
    font-family: 'Press Start 2P', cursive !important;
    font-size: 1.25rem !important;
  }
  .header .subtitle {
    color: rgba(255, 255, 255, 0.9) !important;
    font-size: 0.75rem;
  }
  .controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  .cases-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1rem;
  }
  :global(.case-card) {
    background: rgba(26, 26, 46, 0.6) !important;
    border: 2px solid var(--n64-primary) !important;
    padding: 1rem;
    transition: all 0.3s ease;
  }
  :global(.case-card:hover) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(74, 144, 226, 0.2);
    border-color: var(--n64-secondary) !important;
  }
  .case-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .case-header h3 {
    color: var(--nier-text-primary);
    font-family: 'Press Start 2P', cursive;
    font-size: 0.875rem;
    margin: 0;
    line-height: 1.4;
    flex: 1;
  }
  .case-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: rgba(15, 15, 35, 0.5);
    border-radius: 4px;
  }
  .stat {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--nier-text-secondary);
  }
  .progress-bar {
    flex: 1;
    height: 8px;
    background: rgba(74, 144, 226, 0.2);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4a90e2, #7ed321);
    transition: width 0.3s ease;
  }
  .case-actions {
    display: flex;
    gap: 0.5rem;
  }
  @media (max-width: 768px) {
    .cases-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
