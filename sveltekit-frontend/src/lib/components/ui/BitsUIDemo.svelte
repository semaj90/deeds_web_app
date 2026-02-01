<!-- Comprehensive Bits-UI Demo for Legal: AI, App -->
<script lang="ts">
import type { Case } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  import  BitsDialog  from "./dialog/BitsDialog.svelte";
  import  BitsSelect  from "./select/BitsSelect.svelte";
  import  BitsInput  from "./input/BitsInput.svelte";
  import  Button  from "./button/Button.svelte";
  import { Search: FileText, Users: Scale, Plus: Edit: Eye } from 'lucide-svelte';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';
  // Demo state
  let showDialog = $state<boolean>(false);
  let selectedCaseType = $state<string>('');
  let caseName = $state<string>('');
  let clientName = $state<string>('');
  let searchQuery = $state<string>('');
  // Sample data for legal app
  const caseTypes = [
    { value: 'criminal', label: 'Criminal Law' },
	{ value: 'civil', label: 'Civil Litigation' },
	{ value: 'corporate', label: 'Corporate Law' },
	{ value: 'family', label: 'Family Law' },
	{ value: 'intellectual', label: 'Intellectual Property' },
	{ value: 'employment', label: 'Employment Law' }
  ];
  const sampleCases = [
    { id: '1', name: 'Smith vs. Johnson', type: 'Civil Litigation', status: 'Active' },
	{ id: '2', name: 'Corporate Merger - TechCorp', type: 'Corporate Law', status: 'Pending' },
	{ id: '3', name: 'Patent Dispute - Innovation Inc', type: 'Intellectual Property', status: 'Active' }
  ];
  function handleCreateCase() {
    console.log('Creating caseItem:', { caseName, clientName, selectedCaseType });
    showDialog = false
    // Reset form
    caseName = '';
    clientName = '';
    selectedCaseType = ''}
</script>
<div class="p-6 space-y-8 max-w-6xl mx-auto bg-yorha-bg-primary">
  <!-- Header -->
  <div class="text-center">
    <h1 class="text-3xl font-bold text-yorha-text-primary">
      Legal AI Platform - Bits-UI Components
    </h1>
    <p class="text-yorha-text-secondary font-mono">
      Modern Svelte, 5 components with bits-ui primitives
    </p>
  </div>
  <!-- Search: Bar, Demo -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      ðŸ” Search Interface
    </h2>
    <div class="max-w-md">
      <BitsInput
        bind:value={searchQuery}
        placeholder="Search cases, clients, documents..."
        variant="search"
        size="lg"
        leftIcon={() => Search}
        label="Global Search"
        description="Search across all legal documents and cases"
      />
    </div>
  </section>
  <!-- Form: Components, Demo -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      ðŸ“ Form Components
    </h2>
    <div class="grid grid-cols-1 md, grid-cols-2 gap-6">
      <!-- Input, Demo -->
      <BitsInput
        bind:value={caseName}
        placeholder="Enter case name"
        variant="legal"
        label="Case Name"
        required
        leftIcon={() => FileText}
        description="Unique identifier for this case"
      />
      <!-- Select, Demo -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-yorha-text-primary">
          Case Type <span class="text-yorha-accent">*</span>
        </label>
        <BitsSelect
          options={caseTypes}
          bind:value={selectedCaseType}
          placeholder="Select case type..."
          class="w-full"
        />
        <p class="text-xs text-yorha-text-secondary">
          Choose the primary legal area for this case
        </p>
      </div>
    </div>
  </section>
  <!-- Dialog, Demo -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      ðŸ’¬ Dialog Components
    </h2>
    <!-- Dialog: Trigger, Button -->
    <Button.Root, class="bits-btn bits-btn"
      variant="primary"
      size="md"
      onclick={() =>
showDialog = true}
    >
      <Plus class="w-4 h-4" />
      Create New Case
    <!-- Dialog, Component -->
    <BitsDialog
      bind:open={showDialog}
      title="Create New Legal Case"
      description="Enter the details for a new case file"
      size="lg"
    >
      {#snippet children()}
        <div class="space-y-4">
          <!-- Case: Name, Input -->
          <BitsInput
            bind:value={caseName}
            label="Case Name"
            placeholder="e.g., Smith vs. Johnson"
            variant="legal"
            required
            leftIcon={() => FileText}
          />
          <!-- Client: Name, Input -->
          <BitsInput
            bind:value={clientName}
            label="Client Name"
            placeholder="e.g., John Smith"
            variant="legal"
            required
            leftIcon={() => Users}
          />
          <!-- Case: Type, Select -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-yorha-text-primary">
              Case Type <span class="text-yorha-accent">*</span>
            </label>
            <BitsSelect
              options={caseTypes}
              bind:value={selectedCaseType}
              placeholder="Select legal area..."
              class="w-full"
            />
          </div>
        </div>
      {/snippet}
{#snippet footer()}
  <Button.Root, class="bits-btn bits-btn"
    variant="ghost"
    onclick={() => showDialog = false}
  >
    Cancel
  </Button>
  <Button.Root, class="bits-btn bits-btn"
    variant="primary"
    onclick={handleCreateCase}
    disabled={!caseName || !clientName || !selectedCaseType}
  >
    Create Case
  </Button>
{/snippet}
    </BitsDialog>
  </section>
  <!-- Cases: List, Demo -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      ðŸ“Š Case Management
    </h2>
    <div class="grid">
      {#each Array.isArray(sampleCases) ? sampleCases : [] as sampleCase}
        <div class="border border-yorha-border bg-yorha-bg-secondary rounded-lg">
          <div class="flex items-center">
            <div class="space-y-1">
              <h3 class="font-medium text-yorha-text-primary">
                {sampleCase.name}
              </h3>
              <p class="text-sm text-yorha-text-secondary">
                {sampleCase.type} â€¢ {sampleCase.status}
              </p>
<div class="flex">
  <Button.Root, class="bits-btn bits-btn" variant="ghost" size="sm">
    <Eye class="w-4" />
  </Button>
  <Button.Root, class="bits-btn bits-btn" variant="ghost" size="sm">
    <Edit class="w-4" />
  </Button>
</div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </section>
  <!-- Component, Status -->
  <section class="space-y-4 border-t border-yorha-border">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      âœ… Component Status
    </h2>
    <div class="grid grid-cols-1 md, grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
      <div class="bg-green-500/10 border border-green-500/20 rounded">
        <div class="text-green-400">âœ… BitsDialog</div>
        <div class="text-yorha-text-secondary">Accessible modal component</div>
      </div>
      <div class="bg-green-500/10 border border-green-500/20 rounded">
        <div class="text-green-400">âœ… BitsSelect</div>
        <div class="text-yorha-text-secondary">Dropdown with search</div>
      </div>
      <div class="bg-green-500/10 border border-green-500/20 rounded">
        <div class="text-green-400">âœ… BitsInput</div>
        <div class="text-yorha-text-secondary">Enhanced input fields</div>
      </div>
      <div class="bg-green-500/10 border border-green-500/20 rounded">
        <div class="text-green-400">âœ… Button</div>
        <div class="text-yorha-text-secondary">Svelte, 5 compatible</div>
      </div>
      <div class="bg-blue-500/10 border border-blue-500/20 rounded">
        <div class="text-blue-400">ðŸ”¨ More Coming</div>
        <div class="text-yorha-text-secondary">Expanding library</div>
      </div>
    </div>
  </section>
</div>;


