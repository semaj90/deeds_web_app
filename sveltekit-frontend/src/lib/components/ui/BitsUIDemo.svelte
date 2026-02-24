<!-- Comprehensive Bits-UI Demo for Legal: AI, App -->
<script lang="ts">
  import Dialog from "./dialog/Dialog.svelte";
  import Select from "./select/Select.svelte";
  import SelectItem from "./select/SelectItem.svelte";
  import Input from "./input/Input.svelte";
  import Button from "./button/Button.svelte";
  import Icon from '$lib/components/ui/Icon.svelte';

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
    showDialog = false;
    // Reset form
    caseName = '';
    clientName = '';
    selectedCaseType = '';
  }
</script>

<div class="p-6 space-y-8 max-w-6xl mx-auto bg-yorha-bg-primary">
  <!-- Header -->
  <div class="text-center">
    <h1 class="text-3xl font-bold text-yorha-text-primary">
      Legal AI Platform - Bits-UI Components
    </h1>
    <p class="text-yorha-text-secondary font-mono">
      Modern Svelte 5 components with bits-ui v2.16.2 primitives
    </p>
  </div>

  <!-- Search: Bar, Demo -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      Search Interface
    </h2>
    <div class="max-w-md">
      <label class="block text-sm font-medium text-yorha-text-primary mb-1">Global Search</label>
      <div class="relative">
        <Icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yorha-text-secondary" />
        <Input
          bind:value={searchQuery}
          placeholder="Search cases, clients, documents..."
          class="pl-10"
        />
      </div>
      <p class="text-xs text-yorha-text-secondary mt-1">Search across all legal documents and cases</p>
    </div>
  </section>

  <!-- Form: Components, Demo -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      Form Components
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Input, Demo -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-yorha-text-primary">
          Case Name <span class="text-yorha-accent">*</span>
        </label>
        <div class="relative">
          <Icon name="file-text" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yorha-text-secondary" />
          <Input
            bind:value={caseName}
            placeholder="Enter case name"
            class="pl-10"
          />
        </div>
        <p class="text-xs text-yorha-text-secondary">Unique identifier for this case</p>
      </div>
      <!-- Select, Demo -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-yorha-text-primary">
          Case Type <span class="text-yorha-accent">*</span>
        </label>
        <Select
          bind:value={selectedCaseType}
          placeholder="Select case type..."
          class="w-full"
        >
          {#snippet children()}
            {#each caseTypes as ct}
              <SelectItem value={ct.value} label={ct.label}>
                {ct.label}
              </SelectItem>
            {/each}
          {/snippet}
        </Select>
        <p class="text-xs text-yorha-text-secondary">
          Choose the primary legal area for this case
        </p>
      </div>
    </div>
  </section>

  <!-- Dialog, Demo -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      Dialog Components
    </h2>
    <!-- Dialog: Trigger, Button -->
    <Button
      variant="default"
      onclick={() => showDialog = true}
    >
      <Icon name="plus" class="w-4 h-4" />
      Create New Case
    </Button>

    <!-- Dialog, Component -->
    <Dialog
      bind:open={showDialog}
      title="Create New Legal Case"
      description="Enter the details for a new case file"
    >
      {#snippet children()}
        <div class="space-y-4">
          <!-- Case: Name, Input -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-yorha-text-primary">Case Name</label>
            <div class="relative">
              <Icon name="file-text" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yorha-text-secondary" />
              <Input
                bind:value={caseName}
                placeholder="e.g., Smith vs. Johnson"
                class="pl-10"
              />
            </div>
          </div>
          <!-- Client: Name, Input -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-yorha-text-primary">Client Name</label>
            <div class="relative">
              <Icon name="users" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yorha-text-secondary" />
              <Input
                bind:value={clientName}
                placeholder="e.g., John Smith"
                class="pl-10"
              />
            </div>
          </div>
          <!-- Case: Type, Select -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-yorha-text-primary">
              Case Type <span class="text-yorha-accent">*</span>
            </label>
            <Select
              bind:value={selectedCaseType}
              placeholder="Select legal area..."
              class="w-full"
            >
              {#snippet children()}
                {#each caseTypes as ct}
                  <SelectItem value={ct.value} label={ct.label}>
                    {ct.label}
                  </SelectItem>
                {/each}
              {/snippet}
            </Select>
          </div>

          <!-- Footer actions inside dialog -->
          <div class="flex justify-end gap-3 pt-4 border-t border-yorha-border">
            <Button
              variant="outline"
              onclick={() => showDialog = false}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onclick={handleCreateCase}
              disabled={!caseName || !clientName || !selectedCaseType}
            >
              Create Case
            </Button>
          </div>
        </div>
      {/snippet}
    </Dialog>
  </section>

  <!-- Cases: List, Demo -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      Case Management
    </h2>
    <div class="grid gap-3">
      {#each Array.isArray(sampleCases) ? sampleCases : [] as sampleCase}
        <div class="border border-yorha-border bg-yorha-bg-secondary rounded-lg p-4">
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <h3 class="font-medium text-yorha-text-primary">
                {sampleCase.name}
              </h3>
              <p class="text-sm text-yorha-text-secondary">
                {sampleCase.type} &bull; {sampleCase.status}
              </p>
            </div>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm">
                <Icon name="eye" class="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Icon name="edit" class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Component, Status -->
  <section class="space-y-4 border-t border-yorha-border pt-6">
    <h2 class="text-xl font-semibold text-yorha-text-primary">
      Component Status
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
      <div class="bg-accent/10 border border-accent/20 rounded p-3">
        <div class="text-accent">Dialog</div>
        <div class="text-yorha-text-secondary">Accessible modal (bits-ui Dialog.Root)</div>
      </div>
      <div class="bg-accent/10 border border-accent/20 rounded p-3">
        <div class="text-accent">Select</div>
        <div class="text-yorha-text-secondary">Dropdown with search (bits-ui Select.Root)</div>
      </div>
      <div class="bg-accent/10 border border-accent/20 rounded p-3">
        <div class="text-accent">Input</div>
        <div class="text-yorha-text-secondary">Enhanced input fields</div>
      </div>
      <div class="bg-accent/10 border border-accent/20 rounded p-3">
        <div class="text-accent">Button</div>
        <div class="text-yorha-text-secondary">Svelte 5 compatible (bits-ui Button.Root)</div>
      </div>
      <div class="bg-accent/10 border border-accent/20 rounded p-3">
        <div class="text-accent">ScrollArea</div>
        <div class="text-yorha-text-secondary">Custom scrollbar (bits-ui ScrollArea.Root)</div>
      </div>
      <div class="bg-info/10 border border-info/20 rounded p-3">
        <div class="text-info/80">bits-ui v2.16.2</div>
        <div class="text-yorha-text-secondary">Latest headless primitives</div>
      </div>
    </div>
  </section>
</div>