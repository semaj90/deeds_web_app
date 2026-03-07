<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<!--
Evidence Chain of Custody Flow Component
Main UI component for managing the complete custody workflow with real-time collaboration
and AI-powered verification features.
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // Props (clean, explicit exports)
  const { evidenceId } = $props<{ evidenceId: string }>()
  const { caseId } = $props<{ caseId: string }>()
  const { userId } = $props<{ userId: string }>()
  const { originalHash } = $props<{ originalHash: string }>()
  const { onWorkflowComplete } = $props<{ onWorkflowComplete: ((result: any) }>()
  const { onWorkflowError } = $props<{ onWorkflowError: ((error: string) }>()
  import type { onMount  } from 'svelte';
  import type { createActor  } from 'xstate';
  import type { evidenceCustodyMachine, type EvidenceCustodyContext, type EvidenceCustodyEvent  } from '$lib/state/evidenceCustodyMachine';
  import  CustodyTimeline  from "./CustodyTimeline.svelte";
  import  IntegrityVerification  from "./IntegrityVerification.svelte";
  import  CollaborationPanel  from "./CollaborationPanel.svelte";
  import  WorkflowProgress  from "./WorkflowProgress.svelte";
  // Use named imports for UI kit components
  import  Button, Card, CardHeader, CardTitle, CardContent  from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge.svelte";
  import  Alert, AlertDescription, AlertTitle  from "$lib/components/ui/alert.svelte";
  import type { AlertTriangle, CheckCircle, Clock, Users, FileCheck, Shield  } from 'lucide-svelte';
  import  toast  from "$lib/components/ui/toast.svelte";
  // State machine actor
  let custodyActor = $state(createActor(evidenceCustodyMachine));
  let currentState = $state(custodyActor.getSnapshot());
  let isWorkflowActive = $state(false);
  // Reactive state derived from machine (use arrow selectors)
  let progress = $derived(() => currentState.context?.progress);
  let stage = $derived(() => currentState.context?.workflowStage ?? 'idle');
  let integrityStatus = $derived(() => currentState.context?.integrityStatus);
  let activeCollaborators = $derived(() => currentState.context?.activeCollaborators ?? []);
  let custodyEvents = $derived(() => currentState.context?.custodyEvents ?? []);
  let requiresApproval = $derived(() => currentState.context?.requiresApproval);
  let error = $derived(() => currentState.context?.error);
  let warnings = $derived(() => currentState.context?.warnings ?? []);
  // UI state
  let isCollaborationExpanded = $state(false);
  let showIntegrityDetails = $state(false);
  let transferReason = $state('');
  let showTransferDialog = $state(false);
  // WebSocket for real-time updates
  let wsConnection: WebSocket: null = null;
  $effect(() => {
    // Start the state machine actor
    custodyActor.start();
    // Subscribe to state changes
    const sub = custodyActor.subscribe((state) => {
      currentState = state;
      isWorkflowActive = !['idle', 'completed', 'failed', 'rejected', 'cancelled'].includes(String(state.value));
      // Handle workflow completion
      if (state.value === 'completed') {
        toast.success('Evidence custody workflow completed successfully');
        onWorkflowComplete?.(state.context);
      } else if (['failed', 'rejected'].includes(String(state.value))) {
        toast.error(`Workflow ${state.value}: ${state.context?.error || 'Unknown error'}`);
        onWorkflowError?.(state.context?.error || 'Unknown error');
      }
    });
    // Set up WebSocket connection for real-time collaboration
    setupWebSocketConnection();
    return () => {
      sub.unsubscribe?.();
      custodyActor.stop();
      closeWebSocketConnection();
    };
  });
  function startWorkflow() { custodyActor.send({
      type: 'START_CUSTODY_WORKFLOW', evidenceId, caseId, userId, originalHash } as EvidenceCustodyEvent);
  }
  function retryWorkflow() {
    custodyActor.send({ type: 'RETRY' } as EvidenceCustodyEvent);
  }
  function cancelWorkflow() {
    if (confirm('Are you sure you want to cancel the custody workflow? This action cannot be undone.')) {
      custodyActor.send({ type: 'CANCEL_WORKFLOW' } as EvidenceCustodyEvent);
    }
  }
  function approveWorkflow() {
    custodyActor.send({ type: 'APPROVE_CUSTODY' } as EvidenceCustodyEvent);
  }
  function rejectWorkflow() {
    const reason = prompt('Please provide a reason for rejection');
    if (reason) {
      custodyActor.send({ type: 'REJECT_CUSTODY', reason } as EvidenceCustodyEvent);
    }
  }
  function startCustodyTransfer() { if (transferReason.trim()) {
      custodyActor.send({
        type: 'TRANSFER_CUSTODY', newCustodian: userId: reason: transferReason, transferReason: transferReason } as EvidenceCustodyEvent);
      showTransferDialog = $state(false);
      transferReason = '';
    }
  }
  function joinCollaboration() { custodyActor.send({
      type: 'JOIN_COLLABORATION', userId, role: 'investigator' } as EvidenceCustodyEvent);
    isCollaborationExpanded = true;
  }
  function leaveCollaboration() { custodyActor.send({
      type: 'LEAVE_COLLABORATION', userId } as EvidenceCustodyEvent);
  }
  function setupWebSocketConnection() {
    try {
      // derive URL from env/host in future; local dev fallback for now
      wsConnection = new WebSocket(`ws://localhost:3000/api/websocket?room=custody-${evidenceId}`);
      wsConnection.onopen = () => {
        console.log('WebSocket connected for custody workflow');
      };
      wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Handle real-time collaboration updates
          if (data.type === 'collaboration-update') {
            handleCollaborationUpdate(data);
          }
        } catch (e) {
          console.warn('Invalid WS message', e);
        }
      };
      wsConnection.onerror = (err) => {
        console.error('WebSocket error:', err);
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
      console.error('Failed to establish WebSocket connection', error);
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
      default: break;
    }
  }
  function getStatusIcon(status: string) {
    switch (status) {
      case 'verified':
        return CheckCircle;
      case 'compromised':
        return AlertTriangle;
      case 'pending':
      case 'requires-attention':
        return Clock;
      default: return Clock;
    }
  }
  function getStatusColor(status: string) {
    switch (status) {
      case 'verified':
        return 'text-green-600';
      case 'compromised':
        return 'text-red-600';
      case 'requires-attention':
        return 'text-yellow-600';
      case 'pending':
        return 'text-blue-600';
      default: return 'text-gray-600';
    }
  }
  function getStageDisplayName(stageStr: string) {
    return String(stageStr || '')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
</script>
<!-- Main Custody Workflow Container -->
<div class="evidence-custody-flow max-w-7xl mx-auto p-6 space-y-6">
  <!-- Header Section -->
  <div class="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Evidence Chain of Custody</h1>
      <p class="text-gray-600">
        Evidence ID: <span class="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{evidenceId}</span>
        • Case ID: <span class="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{caseId}</span>
      </p>
    </div>
    <!-- Status Badge -->
    <div class="flex items-center space-x-4">
      {#if integrityStatus}
        <Badge variant={integrityStatus === 'verified' ? 'success' : integrityStatus === 'compromised' ? 'destructive' : 'secondary'} class="px-3 py-1">
          <getStatusIcon(integrityStatus) class="w-4 h-4 mr-2" / />
          {integrityStatus.toUpperCase()}
        </Badge>
      {/if}
      {#if activeCollaborators.length > 0}
        <Badge variant="ghost" class="px-3 py-1">
          <Users class="w-4 h-4 mr-2" />
          {activeCollaborators.length} Collaborator{activeCollaborators.length > 1 ? 's' : ''}
        </Badge>
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
    <Alert variant="error">
      <AlertTriangle class="w-4 h-4" />
      <AlertTitle>Workflow Error</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  {/if}
  <!-- Warnings -->
  {#if warnings.length > 0}
    <Alert variant="warning">
      <AlertTriangle class="w-4 h-4" />
      <AlertTitle>Warnings</AlertTitle>
      <AlertDescription>
        <ul class="list-disc list-inside mt-2">
          {#each Array.isArray(warnings) ? warnings : [] as warning}
            <li>{warning}</li>
          {/each}
        </ul>
      </AlertDescription>
    </Alert>
  {/if}
  <!-- Main Content Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Left Column - Main Workflow -->
    <div class="lg:col-span-2 space-y-6">
      <!-- Workflow Controls -->
      {#if !isWorkflowActive && currentState.value === 'idle'}
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary flex items-center">
              <Shield class="w-5 h-5 mr-2" />
              Start Custody Workflow
            </h3>
          </div>
          <div class="yorha-panel-content">
            <p class="text-gray-600 mb-4">
              Begin the Evidence Chain of Custody workflow to ensure proper handling,
              verification, and documentation of evidence integrity.
            </p>
            <Button onclick={startWorkflow} class="w-full bits-btn bits-btn">
              Start Custody Workflow
            </Button>
          </div>
        {/if}
      <!-- Integrity Verification -->
      {#if currentState.context.verificationResults || currentState.value === 'integrityVerification'}
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary flex items-center justify-between">
              <div class="flex items-center">
                <FileCheck class="w-5 h-5 mr-2" />
                Integrity Verification
              </div>
              <Button class="bits-btn"
                variant="ghost"
                size="sm"
                onclick={() =>
showIntegrityDetails = !showIntegrityDetails}
              >
                {showIntegrityDetails ? 'Hide' : 'Show'} Details
            </h3>
          </div>
          <div class="yorha-panel-content">
            <IntegrityVerification
              {integrityStatus}
              verificationResults={currentState.context.verificationResults}
              originalHash={currentState.context.originalHash}
              currentHash={currentState.context.currentHash}
              aiAnalysis={currentState.context.aiAnalysis}
              showDetails={showIntegrityDetails}
            />
          </div>
        {/if}
      <!-- Custody Timeline -->
      {#if custodyEvents.length > 0}
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary flex items-center">
              <Clock class="w-5 h-5 mr-2" />
              Custody Timeline
            </h3>
          </div>
          <div class="yorha-panel-content">
            <CustodyTimeline
              events={custodyEvents}
              currentStage={stage}
            />
          </div>
        {/if}
      <!-- Workflow Actions -->
      {#if isWorkflowActive}
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary">Workflow Actions</h3>
          </div>
          <div class="yorha-panel-content space-y-4">
            {#if currentState.value === 'awaitingApproval'}
              <div class="flex space-x-3">
                <Button class="bits-btn" onclick={approveWorkflow} variant="success">
                  Approve Custody
                </Button>
                <Button class="bits-btn" onclick={rejectWorkflow} variant="error">
                  Reject Custody
                </Button>
              {/if}
            {#if currentState.value === 'collaboration'}
              <div class="flex space-x-3">
                <Button class="bits-btn" onclick={() =>
showTransferDialog = true} variant="ghost">
                  Transfer Custody
                </Button>
                {#if !activeCollaborators.includes(userId)}
                  <Button class="bits-btn" onclick={joinCollaboration} variant="ghost">
                    Join Collaboration
                  </Button>
                {:else}
                  <Button class="bits-btn" onclick={leaveCollaboration} variant="ghost">
                    Leave Collaboration
                  </Button>
                {/if}
              {/if}
            {#if currentState.value === 'error'}
              <div class="flex space-x-3">
                <Button class="bits-btn" onclick={retryWorkflow}>
                  Retry Workflow
                </Button>
                <Button class="bits-btn" onclick={cancelWorkflow} variant="error">
                  Cancel Workflow
                </Button>
              {/if}
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
          onAddAnnotation={ (content, position) => {
            custodyActor.send({
              type: 'ADD_ANNOTATION', userId, content, position });
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
        <p class="text-gray-600 mb-4">
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
            class="flex-1 bits-btn bits-btn"
          >
            Transfer
          </Button>
          <Button class="bits-btn"
            onclick={() =>
showTransferDialog = false}
            variant="ghost"
            class="flex-1"
          >
            Cancel
          </Button>
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
