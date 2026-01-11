<script lang="ts">
  import { Card, Panel, Terminal, RetroButton, EvidenceTag } from '$lib/ui';
  import { onMount } from 'svelte';

  let terminalOutput = $state('');
  let evidenceCount = $state(0);

  onMount(() => {
    terminalOutput = 'Detective Tools UI Test Initialized\n';
    terminalOutput += 'Components loaded successfully\n';
    terminalOutput += 'Testing Bits-UI integration...\n';
  });

  function addEvidence() {
    evidenceCount++;
    terminalOutput += `Evidence #${evidenceCount} added to case\n`;
  }
</script>

<svelte:head>
  <title>Detective Tools UI Test</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
  <div class="max-w-6xl mx-auto space-y-8">

    <!-- Header -->
    <div class="text-center">
      <h1 class="text-4xl font-bold text-cyan-400 mb-2">🕵️ Detective Tools UI Test</h1>
      <p class="text-slate-300">Testing the complete UI component library</p>
    </div>

    <!-- Component Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

      <!-- Card Component -->
      <Card class="p-6">
        <h3 class="text-xl font-semibold text-cyan-400 mb-4">Evidence Card</h3>
        <p class="text-slate-300 mb-4">
          This is a test of the Card component with proper styling and layout.
        </p>
        <RetroButton onclick={addEvidence} class="w-full">
          Add Evidence
        </RetroButton>
      </Card>

      <!-- Panel Component -->
      <Panel class="p-6">
        <h3 class="text-xl font-semibold text-green-400 mb-4">Control Panel</h3>
        <div class="space-y-3">
          <EvidenceTag type="primary">Case Active</EvidenceTag>
          <EvidenceTag type="secondary">Priority: High</EvidenceTag>
          <EvidenceTag type="warning">Evidence Count: {evidenceCount}</EvidenceTag>
        </div>
      </Panel>

      <!-- Terminal Component -->
      <Terminal class="h-64">
        <pre class="text-green-400 font-mono text-sm">{terminalOutput}</pre>
      </Terminal>

    </div>

    <!-- Status Section -->
    <div class="text-center">
      <div class="inline-flex items-center space-x-4 bg-slate-800/50 rounded-lg p-4">
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span class="text-slate-300">Bits-UI Integrity: OK</span>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-cyan-400 rounded-full animate-pulse"></div>
          <span class="text-slate-300">Components: Loaded</span>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
          <span class="text-slate-300">Evidence: {evidenceCount}</span>
        </div>
      </div>
    </div>

  </div>
</div>
