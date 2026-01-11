<script lang="ts">
  interface EvidenceNode {
    id: string;
    caseId: string;
    type: string;
    title: string;
    description: string;
    x: number;
    y: number;
    confidence: number;
    metadata: Record<string, any>;
  }

  interface EvidenceConnection {
    id: string;
    caseId: string;
    fromNodeId: string;
    toNodeId: string;
    type: string;
  }

  import { page } from '$app/stores';
  import ClientGemmaInference from '$lib/components/ClientGemmaInference.svelte';
  import EvidenceAssistant from '$lib/components/evidence/EvidenceAssistant.svelte';
  import EvidenceBoard from '$lib/components/evidence/EvidenceBoard.svelte';
  import VictimStatementWizard from '$lib/components/evidence/VictimStatementWizard.svelte';
  import Button from '$lib/components/ui/button';
  import { onMount } from 'svelte';

  let caseId = $state('');
  let nodes = $state<EvidenceNode[]>([]);
  let connections = $state<EvidenceConnection[]>([]);
  let showAssistant = $state(false);
  let selectedNode = $state<EvidenceNode | null>(null);
  let showVictimWizard = $state(false);
  let showClientInference = $state(false);

  onMount(async () => {
    // Extract case ID from URL params
    const urlParams = new URLSearchParams($page.url.search);
    caseId = urlParams.get('caseId') || 'default-case';

    // Load existing evidence
    await loadEvidence();
  });

  async function loadEvidence() {
    try {
      const [nodesResponse, connectionsResponse] = await Promise.all([
        fetch(`/api/evidence/nodes?caseId=${caseId}`),
        fetch(`/api/evidence/connections?caseId=${caseId}`),
      ]);

      nodes = await nodesResponse.json();
      connections = await connectionsResponse.json();
    } catch (error) {
      console.error('Failed to load evidence:', error);
    }
  }

  async function addEvidenceNode() {
    try {
      const newNode = {
        caseId,
        type: 'other',
        title: 'New Evidence',
        description: '',
        x: Math.random() * 800,
        y: Math.random() * 600,
        confidence: 0.5,
        metadata: {},
      };

      const response = await fetch('/api/evidence/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNode),
      });

      const createdNode = await response.json();
      nodes = [...nodes, createdNode];
    } catch (error) {
      console.error('Failed to add evidence node:', error);
    }
  }

  function openEvidenceAssistant(node: EvidenceNode) {
    selectedNode = node;
    showAssistant = true;
  }

  function handleNodeUpdate(event: CustomEvent) {
    const { nodeId, updates } = event.detail;

    // Update local state
    nodes = nodes.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    );

    // Update in database
    fetch(`/api/evidence/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  function handleVictimStatementSave(event: CustomEvent) {
    const { statement } = event.detail;
    console.log('Victim statement saved:', statement);
    showVictimWizard = false;
    // TODO: Create evidence node from victim statement
  }
</script>

<svelte:head>
  <title>Evidence Board - Case {caseId}</title>
</svelte:head>

<div class="evidence-board-page">
  <header class="page-header">
    <h1>Evidence Board</h1>
    <div class="header-actions">
      <Button variant="outline" on:click={addEvidenceNode}>
        Add Evidence
      </Button>
      <Button variant="outline" on:click={() => showVictimWizard = true}>
        Victim Statement
      </Button>
      <Button variant="outline" on:click={() => showClientInference = true}>
        AI Analysis
      </Button>
      <Button variant="outline" on:click={() => loadEvidence()}>
        Refresh
      </Button>
    </div>
  </header>

  <main class="board-container">
    <EvidenceBoard
      {caseId}
      initialNodes={nodes}
      initialConnections={connections}
      on:nodeSelect={(e) => openEvidenceAssistant(e.detail.node)}
    />
  </main>

  <!-- Evidence Assistant Modal -->
  {#if showAssistant && selectedNode}
    <EvidenceAssistant
      node={selectedNode}
      bind:open={showAssistant}
      on:update={handleNodeUpdate}
    />
  {/if}

  <!-- Victim Statement Wizard -->
  <VictimStatementWizard
    bind:open={showVictimWizard}
    {caseId}
    on:save={handleVictimStatementSave}
  />

  <!-- Client Gemma Inference -->
  {#if showClientInference}
    <div class="inference-modal">
      <div class="inference-modal-content">
        <button class="close-btn" onclick={() => showClientInference = false}>×</button>
        <ClientGemmaInference />
      </div>
    </div>
  {/if}
</div>

<style>
  .evidence-board-page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f8f9fa;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: white;
    border-bottom: 1px solid #e9ecef;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .page-header h1 {
    margin: 0;
    color: #1f2937;
    font-size: 1.5rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .board-container {
    flex: 1;
    overflow: hidden;
  }

  .inference-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .inference-modal-content {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    max-width: 800px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    position: relative;
  }

  .close-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
  }

  .close-btn:hover {
    color: #000;
  }
</style>