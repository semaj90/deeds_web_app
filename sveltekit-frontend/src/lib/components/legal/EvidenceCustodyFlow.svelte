<!--
  Evidence Chain of Custody Flow Component
  Main UI component for managing the complete custody workflow with real-time collaboration
  and AI-powered verification features.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createActor } from 'xstate';
  import { evidenceCustodyMachine, type EvidenceCustodyContext, type EvidenceCustodyEvent } from '$lib/state/evidenceCustodyMachine';
  import CustodyTimeline from './CustodyTimeline.svelte';
  import IntegrityVerification from './IntegrityVerification.svelte';
  import CollaborationPanel from './CollaborationPanel.svelte';
  import WorkflowProgress from './WorkflowProgress.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  // Lightweight toast fallback (svelte-sonner not installed)
  const toast = {
    success: (msg: string) => console.log('[Custody] \u2705', msg),
    error: (msg: string) => console.error('[Custody] \u274C', msg),
    info: (msg: string) => console.info('[Custody] \u2139\uFE0F', msg),
  };
  import Icon from '$lib/components/ui/Icon.svelte';

  // Props
  interface Props {
    evidenceId: string;
    caseId: string;
    userId: string;
    originalHash: string;
    onWorkflowComplete?: (result: any) => void;
    onWorkflowError?: (error: string) => void;
  }

  let {
    evidenceId,
    caseId,
    userId,
    originalHash,
    onWorkflowComplete = undefined,
    onWorkflowError = undefined
  }: Props = $props();

  // State machine actor
  let custodyActor = $state(createActor(evidenceCustodyMachine));
  let currentState = $state(custodyActor.getSnapshot());
  let isWorkflowActive = $state(false);

  // Reactive state derived from machine
  let progress = $derived(currentState.context.progress);
  let stage = $derived(currentState.context.workflowStage);
  let integrityStatus = $derived(currentState.context.integrityStatus);
  let activeCollaborators = $derived(currentState.context.activeCollaborators);
  let custodyEvents = $derived(currentState.context.custodyEvents);
  let requiresApproval = $derived(currentState.context.requiresApproval);
  let error = $derived(currentState.context.error);
  let warnings = $derived(currentState.context.warnings);

  // UI state
  let isCollaborationExpanded = $state(false);
  let showIntegrityDetails = $state(false);
  let transferReason = $state('');
  let showTransferDialog = $state(false);

  // WebSocket for real-time updates
  let wsConnection: WebSocket | null = null;

  onMount(() => {
    // Start the state machine actor
    custodyActor.start();

    // Subscribe to state changes
    custodyActor.subscribe((state) => {
      currentState = state;
      isWorkflowActive = !['idle', 'completed', 'failed', 'rejected', 'cancelled'].includes(state.value as string);

      // Handle workflow completion
      if (state.value === 'completed') {
        toast.success('Evidence custody workflow completed successfully');
        onWorkflowComplete?.(state.context);
      } else if (['failed', 'rejected'].includes(state.value as string)) {
        toast.error(`Workflow ${state.value}: ${state.context.error || 'Unknown error'}`);
        onWorkflowError?.(state.context.error || 'Unknown error');
      }
    });

    // Set up WebSocket connection for real-time collaboration
    setupWebSocketConnection();

    return () => {
      custodyActor.stop();
      closeWebSocketConnection();
    };
  });

  function startWorkflow() {
    custodyActor.send({
      type: 'START_CUSTODY_WORKFLOW',
      evidenceId,
      caseId,
      userId,
      originalHash
    });
  }

  function retryWorkflow() {
    custodyActor.send({ type: 'RETRY' });
  }

  function cancelWorkflow() {
    if (confirm('Are you sure you want to cancel the custody workflow? This action cannot be undone.')) {
      custodyActor.send({ type: 'CANCEL_WORKFLOW' });
    }
  }

  function approveWorkflow() {
    custodyActor.send({ type: 'APPROVE_CUSTODY' });
  }

  function rejectWorkflow() {
    const reason = prompt('Please provide a reason for rejection:');
    if (reason) {
      custodyActor.send({ type: 'REJECT_CUSTODY', reason });
    }
  }

  function startCustodyTransfer() {
    if (transferReason.trim()) {
      custodyActor.send({
        type: 'TRANSFER_CUSTODY',
        newCustodian: userId,
        reason: transferReason
      });
      showTransferDialog = false;
      transferReason = '';
    }
  }

  function joinCollaboration() {
    custodyActor.send({
      type: 'JOIN_COLLABORATION',
      userId,
      role: 'investigator'
    });
    isCollaborationExpanded = true;
  }

  function leaveCollaboration() {
    custodyActor.send({
      type: 'LEAVE_COLLABORATION',
      userId
    });
  }

  function setupWebSocketConnection() {
    try {
      wsConnection = new WebSocket(`ws://localhost:3000/api/websocket?room=custody-${evidenceId}`);

      wsConnection.onopen = () => {
        console.log('WebSocket connected for custody workflow');
      };

      wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Handle real-time collaboration updates
        if (data.type === 'collaboration-update') {
          handleCollaborationUpdate(data);
        }
      };

      wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      wsConnection.onclose = () => {
        console.log('WebSocket connection closed');
        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (isWorkflowActive) {
            setupWebSocketConnection();
          }
        }, 5000);
      };
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
    }
  }

  function closeWebSocketConnection() {
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }
  }

  function handleCollaborationUpdate(data: any) {
    // Handle different types of collaboration updates
    switch (data.action) {
      case 'user-joined':
        toast.info(`${data.userName} joined the collaboration`);
        break;
      case 'user-left':
        toast.info(`${data.userName} left the collaboration`);
        break;
      case 'annotation-added':
        toast.info('New annotation added');
        break;
    }
  }

  function getStatusIconName(status: string): string {
    switch (status) {
      case 'verified':
        return 'check-circle';
      case 'compromised':
        return 'alert-triangle';
      case 'pending':
      case 'requires-attention':
        return 'clock';
      default:
        return 'clock';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'verified':
        return 'text-accent';
      case 'compromised':
        return 'text-danger';
      case 'requires-attention':
        return 'text-warning';
      case 'pending':
        return 'text-info';
      default:
        return 'text-sand/60';
    }
  }

  function getStageDisplayName(stage: string) {
    return stage.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
</script>

<!-- Main Custody Workflow Container -->
<div class="evidence-custody-flow max-w-7xl mx-auto p-6 space-y-6">
  <!-- Header Section -->
  <div class="flex items-center justify-between bg-gradient-to-r from-info/5 to-info/5 rounded-lg p-6">
    <div>
      <h1 class="text-3xl font-bold text-sand mb-2">Evidence Chain of Custody</h1>
      <p class="text-sand/60">
        Evidence ID: <span class="font-mono text-sm bg-sand/10 px-2 py-1 rounded">{evidenceId}</span>
        &bull; Case ID: <span class="font-mono text-sm bg-sand/10 px-2 py-1 rounded">{caseId}</span>
      </p>
    </div>

    <!-- Status Badge -->
    <div class="flex items-center space-x-4">
      {#if integrityStatus}
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium {integrityStatus === 'verified' ? 'bg-accent/10 text-accent' : integrityStatus === 'compromised' ? 'bg-danger/10 text-danger' : 'bg-sand/10 text-sand'}">
          <Icon name={getStatusIconName(integrityStatus)} class="w-4 h-4" />
          {integrityStatus.toUpperCase()}
        </span>
      {/if}

      {#if activeCollaborators.length > 0}
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-sand/10 text-sand border border-sand/20">
          <Icon name="users" class="w-4 h-4" />
          {activeCollaborators.length} Collaborator{activeCollaborators.length > 1 ? 's' : ''}
        </span>
      {/if}
    </div>
  </div>

  <!-- Workflow Progress -->
  {#if isWorkflowActive}
    <WorkflowProgress
      {progress}
      {stage}
      stageName={getStageDisplayName(stage)}
    />
  {/if}

  <!-- Error Messages -->
  {#if error}
    <div class="border border-danger/30 bg-danger/5 rounded-lg p-4 flex items-start gap-3">
      <Icon name="alert-triangle" class="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
      <div>
        <h4 class="font-medium text-danger">Workflow Error</h4>
        <p class="text-danger text-sm">{error}</p>
      </div>
    </div>
  {/if}

  <!-- Warnings -->
  {#if warnings.length > 0}
    <div class="border border-warning/30 bg-warning/5 rounded-lg p-4 flex items-start gap-3">
      <Icon name="alert-triangle" class="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
      <div>
        <h4 class="font-medium text-warning">Warnings</h4>
        <ul class="list-disc list-inside mt-2 text-sm text-warning">
          {#each warnings as warning}
            <li>{warning}</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  <!-- Main Content Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Left Column - Main Workflow -->
    <div class="lg:col-span-2 space-y-6">
      <!-- Workflow Controls -->
      {#if !isWorkflowActive && currentState.value === 'idle'}
        <div class="border rounded-lg overflow-hidden">
          <div class="px-4 py-3 border-b bg-sand/5">
            <h3 class="font-medium flex items-center gap-2">
              <Icon name="shield" class="w-5 h-5" />
              Start Custody Workflow
            </h3>
          </div>
          <div class="p-4">
            <p class="text-sand/60 mb-4">
              Begin the Evidence Chain of Custody workflow to ensure proper handling,
              verification, and documentation of evidence integrity.
            </p>
            <Button onclick={startWorkflow} class="w-full">
              Start Custody Workflow
            </Button>
          </div>
        </div>
      {/if}

      <!-- Integrity Verification -->
      {#if currentState.context.verificationResults || currentState.value === 'integrityVerification'}
        <div class="border rounded-lg overflow-hidden">
          <div class="px-4 py-3 border-b bg-sand/5 flex items-center justify-between">
            <h3 class="font-medium flex items-center gap-2">
              <Icon name="file-check" class="w-5 h-5" />
              Integrity Verification
            </h3>
            <button
              class="text-sm text-info hover:underline"
              onclick={() => showIntegrityDetails = !showIntegrityDetails}
            >
              {showIntegrityDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>
          <div class="p-4">
            <IntegrityVerification
              {integrityStatus}
              verificationResults={currentState.context.verificationResults}
              originalHash={currentState.context.originalHash}
              currentHash={currentState.context.currentHash}
              aiAnalysis={currentState.context.aiAnalysis}
              showDetails={showIntegrityDetails}
            />
          </div>
        </div>
      {/if}

      <!-- Custody Timeline -->
      {#if custodyEvents.length > 0}
        <div class="border rounded-lg overflow-hidden">
          <div class="px-4 py-3 border-b bg-sand/5">
            <h3 class="font-medium flex items-center gap-2">
              <Icon name="clock" class="w-5 h-5" />
              Custody Timeline
            </h3>
          </div>
          <div class="p-4">
            <CustodyTimeline
              events={custodyEvents}
              currentStage={stage}
            />
          </div>
        </div>
      {/if}

      <!-- Workflow Actions -->
      {#if isWorkflowActive}
        <div class="border rounded-lg overflow-hidden">
          <div class="px-4 py-3 border-b bg-sand/5">
            <h3 class="font-medium">Workflow Actions</h3>
          </div>
          <div class="p-4 space-y-4">
            {#if currentState.value === 'awaitingApproval'}
              <div class="flex space-x-3">
                <Button onclick={approveWorkflow} class="bg-accent text-white hover:bg-accent/60">
                  Approve Custody
                </Button>
                <Button onclick={rejectWorkflow} class="bg-danger text-white hover:bg-danger/80">
                  Reject Custody
                </Button>
              </div>
            {/if}

            {#if currentState.value === 'collaboration'}
              <div class="flex space-x-3">
                <Button onclick={() => showTransferDialog = true} class="border">
                  Transfer Custody
                </Button>
                {#if !activeCollaborators.includes(userId)}
                  <Button onclick={joinCollaboration} class="border">
                    Join Collaboration
                  </Button>
                {:else}
                  <Button onclick={leaveCollaboration} class="border">
                    Leave Collaboration
                  </Button>
                {/if}
              </div>
            {/if}

            {#if currentState.value === 'error'}
              <div class="flex space-x-3">
                <Button onclick={retryWorkflow}>
                  Retry Workflow
                </Button>
                <Button onclick={cancelWorkflow} class="bg-danger text-white hover:bg-danger/80">
                  Cancel Workflow
                </Button>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Right Column - Collaboration Panel -->
    <div class="space-y-6">
      {#if isCollaborationExpanded || activeCollaborators.length > 0}
        <CollaborationPanel
          collaborationSession={currentState.context.collaborationSession}
          {activeCollaborators}
          {userId}
          {evidenceId}
          {wsConnection}
          onAddAnnotation={(content, position) => {
            custodyActor.send({
              type: 'ADD_ANNOTATION',
              userId,
              content,
              position
            });
          }}
        />
      {/if}
    </div>
  </div>

  <!-- Transfer Dialog -->
  {#if showTransferDialog}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-lg max-w-md w-full p-6">
        <h3 class="text-lg font-semibold mb-4">Transfer Custody</h3>
        <p class="text-sand/60 mb-4">
          Please provide a reason for transferring custody of this evidence.
        </p>
        <textarea
          bind:value={transferReason}
          placeholder="Enter transfer reason..."
          class="w-full p-3 border rounded-lg mb-4 h-24 resize-none"
        ></textarea>
        <div class="flex space-x-3">
          <Button
            onclick={startCustodyTransfer}
            disabled={!transferReason.trim()}
            class="flex-1"
          >
            Transfer
          </Button>
          <Button
            onclick={() => showTransferDialog = false}
            class="flex-1 border"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .evidence-custody-flow {
    min-height: 100vh;
  }

  /* Custom animations for state transitions */
  .workflow-transition {
    animation: fadeInUp 0.3s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
