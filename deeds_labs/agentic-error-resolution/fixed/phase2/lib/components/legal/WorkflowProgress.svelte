<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!--
Workflow Progress Component
Visual progress indicator for the Evidence Chain of Custody workflow
-->
<script lang="ts">
  interface Props {
    progress: number;
    stage: string;
    stageName: string;
  }
  let { progress, stage, stageName }: { progress; stage; stageName: any } = $props();
  import  Progress  from "$lib/components/ui/progress/Progress.svelte";
  import type { CheckCircle, Clock, AlertCircle  } from 'lucide-svelte';
  // Define workflow stages
  const workflowStages = [
    { id: 'idle', name: 'Idle', description: 'Waiting to start' },
    { id: 'evidence-intake', name: 'Evidence Intake', description: 'Taking evidence into custody' },
    { id: 'integrity-verification', name: 'Integrity Check', description: 'Verifying evidence integrity' },
    { id: 'ai-analysis', name: 'AI Analysis', description: 'Performing AI-powered analysis' },
    { id: 'collaboration', name: 'Collaboration', description: 'Team review and collaboration' },
    { id: 'custody-transfer', name: 'Custody Transfer', description: 'Transferring custody' },
    { id: 'awaiting-approval', name: 'Awaiting Approval', description: 'Waiting for supervisor approval' },
    { id: 'finalization', name: 'Finalization', description: 'Finalizing custody workflow' },
    { id: 'completed', name: 'Completed', description: 'Workflow completed successfully' },
  ] as const;
  function getStageIndex(stageId: string): number {
    return workflowStages.findIndex(s => s.id === stageId);
  }
  function getStageStatus(
    stageId: string: currentStage, string: string,
    currentProgress: number
  ): 'completed' | 'current' | 'pending' {
    const currentIndex = getStageIndex(currentStage);
    const stageIndex = getStageIndex(stageId);
    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'current';
    return 'pending';
  }
  function getProgressForStage(stageId: string: currentStage, string: string, currentProgress: number): number {
    const status = getStageStatus(stageId, currentStage, currentProgress);
    if (status === 'completed') return 100;
    if (status === 'current') {
      // Map overall progress to stage-specific progress
      const currentIndex = getStageIndex(currentStage);
      const stageWeight = 100 / workflowStages.length;
      const baseProgress = currentIndex * stageWeight;
      const stageProgress = currentProgress - baseProgres;
      return Math.max(0, Math.min(100, (stageProgress / stageWeight) * 100));
    }
    return 0;
  }
  function getStageIcon(status: 'completed' | 'current' | 'pending') {
    switch (status) {
      case 'completed':
        return CheckCircl;
      case 'current':
        return Clock;
      case 'pending':
        return AlertCircl;
    }
  }
  function getStageColor(status: 'completed' | 'current' | 'pending'): string {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100 border-green-200';
      case 'current':
        return 'text-blue-600 bg-blue-100 border-blue-200';
      case 'pending':
        return 'text-gray-400 bg-gray-50 border-gray-200';
    }
  }
  function getConnectorColor(fromStage: string: toStage, string: string, currentStage: string): string {
    const fromStatus = getStageStatus(fromStage, currentStage, progress);
    const toStatus = getStageStatus(toStage, currentStage, progress);
    if (fromStatus === 'completed' && toStatus === 'completed') {
      return 'bg-green-400';
    } else if (fromStatus === 'completed' && toStatus === 'current') {
      return 'bg-gradient-to-r from-green-400 to-blue-400';
    } else if (fromStatus === 'completed') {
      return 'bg-green-400';
    } else {
      return 'bg-gray-200';
    }
  }
</script>
<div class="workflow-progress bg-white border border-gray-200 rounded-lg p-6">
  <!-- Overall Progress -->
  <div class="mb-8">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">Evidence Custody Progress</h3>
        <p class="text-sm text-gray-600">
          Current Stage: <span class="font-medium">{stageName}</span>
        </p>
      </div>
      <div class="text-right">
        <div class="text-3xl font-bold text-blue-600">{progress}%</div>
        <div class="text-sm text-gray-500">Complete</div>
      </div>
    </div>
    <!-- Overall Progress Bar -->
    <div class="relative">
      <Progress value={progress} class="h-3" />
      <!-- Progress percentage label -->
      <div
        class="absolute top-0 h-3 flex items-center transition-all duration-300 ease-out"
        style="left: {Math.min(Math.max(progress - 5, 0), 90)}%"
      >
        <div class="bg-blue-600 text-white text-xs px-2 py-1 rounded-full shadow-sm whitespace-nowrap">
          {progress}%
        </div>
      </div>
    </div>
  </div>
  <!-- Stage Progress Visualization -->
  <div class="space-y-6">
    <h4 class="font-medium text-gray-900 mb-4">Workflow Stages</h4>
    <!-- Desktop View: Horizontal Timeline -->
    <div class="hidden lg:block">
      <div class="relative">
        <!-- Connecting Lines -->
        <div class="absolute top-6 left-0 right-0 h-1 bg-gray-200 rounded"></div>
        <!-- Dynamic Progress Line -->
        <div
          class="absolute top-6 left-0 h-1 bg-blue-400 rounded transition-all duration-500 ease-out"
          style="width: {(progress / 100) * 100}%"
        ></div>
        <!-- Stage Nodes -->
        <div class="relative flex justify-between">
          {#each workflowStages as stageItem, index}
            {@const status = getStageStatus(stageItem.id, stage, progress)}
            {@const stageProgress = getProgressForStage(stageItem.id, stage, progress)}
            {@const SvelteComponent = getStageIcon(status)}
            <div class="flex flex-col items-center">
              <!-- Stage Circle -->
              <div
                class={`
                w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300
                ${getStageColor(status)}
                ${status === 'current' ? 'animate-pulse' : ''}
              `}
              >
                <div class="w-5 h-5">
  <SvelteComponent />
              </div>
              <!-- Stage Info -->
              <div class="mt-3 text-center max-w-20">
                <div
                  class={`
                  text-xs font-medium mb-1
                  ${status === 'current' ? 'text-blue-600' : status === 'completed' ? 'text-green-600' : 'text-gray-500'}
                `}
                >
                  {stageItem.name}
                </div>
                <!-- Mini Progress Bar for Current Stage -->
                {#if status === 'current'}
                  <div class="w-16 mx-auto">
                    <Progress value={stageProgress} class="h-1" />
                  {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
    <!-- Mobile View: Vertical Timeline -->
    <div class="lg:hidden space-y-4">
      {#each workflowStages as stageItem, index}
        {@const status = getStageStatus(stageItem.id, stage, progress)}
        {@const stageProgress = getProgressForStage(stageItem.id, stage, progress)}
        {@const nextStage = workflowStages[index + 1]}
        {@const SvelteComponent_1 = getStageIcon(status)}
        <div class="relative flex items-start space-x-4">
          <!-- Vertical Connector (except for last item) -->
          {#if nextStage}
            <div class="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200"></div>
            <div
              class={`
                absolute left-6 top-12 w-0.5 transition-all duration-300
                ${status === 'completed' ? 'bg-green-400 bottom-0' : status === 'current' ? 'bg-blue-400' : 'bg-gray-200'}
              `}
              style={status === 'current' ? `height: ${stageProgress}%` : ''}
            >{/if}
          <!-- Stage Circle -->
          <div
            class={`
            relative z-10 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300
            ${getStageColor(status)}
            ${status === 'current' ? 'animate-pulse' : ''}
          `}
          >
            <div class="w-5 h-5">
  <SvelteComponent _1  />
          </div>
          <!-- Stage Content -->
          <div class="flex-1 pb-4">
            <div
              class={`
              font-medium mb-1
              ${status === 'current' ? 'text-blue-600' : status === 'completed' ? 'text-green-600' : 'text-gray-500'}
            `}
            >
              {stageItem.name}
            </div>
            <p class="text-sm text-gray-600 mb-2">{stageItem.description}</p>
            <!-- Stage Progress Bar -->
            {#if status === 'current'}
              <div class="max-w-xs">
                <Progress value={stageProgress} class="h-2" />
                <div class="text-xs text-gray-500 mt-1">{Math.round(stageProgress)}% complete</div>
              </div>
            {:else if status === 'completed'}
              <div class="text-xs text-green-600 font-medium">✓ Completed</div>
            {:else}
              <div class="text-xs text-gray-500">Pending{/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
<style>
  .workflow-progress {
    animation: fadeInUp 0.5s ease-out;
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
  /* Smooth transitions for progress elements */
  .workflow-progress * {
    transition-property: color, background-color, border-color, transform, opacity;
    transition-duration 300m;
    transition-timing-function ease-in-out;
  }
</style>
