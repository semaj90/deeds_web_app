<!-- @migration-task Error while migrating Svelte code: Attributes need to be uniqu;
https://svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<!-- QLorA Training Panel with Checkbox Toggle -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import type { fade, fly  } from 'svelte/transition';
  import type { quintOut  } from 'svelte/easing';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge.svelte";
  // Import QLorA training service
  import type { qloraTrainingService,
    trainingConfig,
    currentTrainingJob,
    userAnalytics,
    type TrainingJob,
    type QLorATrainingConfig
   } from '$lib/services/qlora-training-service';
  // Props
  interface Props {
    caseFiles?: File[];
    enabledByDefault?: boolean;
  }
  let {
    caseFiles = [],
    enabledByDefault = false
  }: Props = $props();
  // State
  let trainingEnabled = $state(enabledByDefault);
  let showAdvancedConfig = $state(false);
  let dragActive = $state(false);
  let uploadProgress = $state(0);
  let selectedFiles = $state<File[]>([]);
  // Reactive values
  let config = $state<QLorATrainingConfig: null>(null);
  let currentJob = $state<TrainingJob: null>(null);
  let analytics = $state<any>(null);
  // Subscriptions
  let unsubscribeConfig: (() => void) | null = null;
  let unsubscribeJob: (() => void) | null = null;
  let unsubscribeAnalytics: (() => void) | null = null;
  $effect(() => {
    // Subscribe to training stores
    unsubscribeConfig = trainingConfig.subscribe(value => config = value);
    unsubscribeJob = currentTrainingJob.subscribe(value => currentJob = value);
    unsubscribeAnalytics = userAnalytics.subscribe(value => analytics = value);
  });
  onDestroy(() => {
    unsubscribeConfig?.();
    unsubscribeJob?.();
    unsubscribeAnalytics?.();
  });
  // Handlers
  async function handleTrainingToggle() {
    if (!config) return;
    trainingEnabled = !trainingEnabled;
    // Update service configuration
    qloraTrainingService.updateConfig({
      enabled: trainingEnabled;
    });
    // If enabling and we have files, start training
    if (trainingEnabled && (selectedFiles.length > 0 || caseFiles.length > 0)) {
      const filesToTrain = selectedFiles.length > 0 ? selectedFiles : caseFile;
      await startTraining(filesToTrain);
    }
  }
  async function startTraining(files: File[]) {
    if (!files.length) return;
    try {
      uploadProgress = 0;
      const job = await qloraTrainingService.startTraining(files, trainingEnabled);
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        uploadProgress += Math.random() * 20;
        if (uploadProgress >= 100) {
          uploadProgress = 100;
          clearInterval(progressInterval);
        }
      }, 500);
    } catch (error) {
      console.error('Failed to start training:', error);
      // Show error notification
    }
  }
  function handleFileDrop(_event: DragEvent) {
    event.preventDefault();
    dragActive = $state(false);
    const files = Array.from(event.dataTransfer?.files || []);
    const caseFiles = files.filter(file =>
      file.name.endsWith('.case') ||
      file.type === 'application/json' ||
      file.name.endsWith('.json')
    );
    if (caseFiles.length > 0) {
      selectedFiles = [...selectedFiles, ...caseFiles];
      // Auto-start training if enabled
      if (trainingEnabled) {
        startTraining(caseFiles);
      }
    }
  }
  function handleFileInput(_event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    selectedFiles = [...selectedFiles, ...files];
  }
  function removeFile(_index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
  }
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  function getStatusColor(status: string): string {
    switch (status) {
      case 'running': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'paused': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  }
  async function pauseTraining() {
    await qloraTrainingService.pauseTraining();
  }
  async function resumeTraining() {
    await qloraTrainingService.resumeTraining();
  }
  async function stopTraining() {
    await qloraTrainingService.stopTraining();
  }
</script>
<div class="w-full max-w-4xl mx-auto bg-gradient-to-br from-gray-900 to-gray-800 border-cyan-500/20 nes-container">
  <div class="yorha-panel-header pb-4">
    <h3 class="nes-text is-primary text-2xl font-bold text-cyan-400 flex items-center gap-3">
      <span class="text-3xl">🧠</span>
      QLorA Training System
      <Badge class="ml-auto" variant={trainingEnabled ? "default" : "secondary"}>
        {trainingEnabled ? 'ENABLED' : 'DISABLED'}
      </Badge>
    </h3>
  </div>
  <div class="yorha-panel-content space-y-6">
    <!-- Main Training Toggle -->
    <div class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-cyan-500/20">
      <div class="space-y-1">
        <h3 class="text-lg font-semibold text-white">Enable QLorA Training</h3>
        <p class="text-gray-400 text-sm">
          Train legal AI models on .case files with Low-Rank Adaptation
        </p>
      </div>
      <label class="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          class="sr-only peer"
          bind:checked={trainingEnabled}
          onclick={handleTrainingToggle}
        />
        <div class="w-14 h-8 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300/20 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-cyan-600"></div>
      </label>
    </div>
    <!-- File Upload Area -->
    <div
      class="border-2 border-dashed border-cyan-500/30 rounded-lg p-8 text-center transition-all duration-200 {dragActive ? 'border-cyan-400 bg-cyan-500/10' : 'hover:border-cyan-500/50'}"
      role="region" aria-label="Drop zone" ondragover={ (e) => { e.preventDefault(); dragActive = true }}
      ondragleave={() => dragActive = false}
      ondrop={handleFileDrop}
    >
      <div class="space-y-4">
        <div class="text-6xl">📄</div>
        <div class="space-y-2">
          <h3 class="text-xl font-semibold text-white">Drop .case files here</h3>
          <p class="text-gray-400">or click to select files for training</p>
        </div>
        <label for="file-input" class="inline-block">
          <Button class="bg-cyan-600 hover:bg-cyan-700 bits-btn bits-btn">
Select Files
</Button>
        </label>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".case,.json"
          class="hidden"
          onchange={handleFileInput}
        />
      </div>
    </div>
    <!-- Selected Files -->
    {#if selectedFiles.length > 0}
      <div class="space-y-3" transitionfly={{ y: 20, duration 300 }}>
        <h4 class="text-lg font-semibold text-white">Selected Files ({selectedFiles.length})</h4>
        <div class="grid gap-2 max-h-40 overflow-y-auto">
          {#each selectedFiles as file, index}
            <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded border border-gray-700" transitionfly={{ x: -20, duration 200 }}>
              <div class="flex items-center gap-3">
                <span class="text-2xl">📋</span>
                <div>
                  <p class="text-white font-medium">{file.name}</p>
                  <p class="text-gray-400 text-sm">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                onclick={() => removeFile(index)}
                class="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/20 transition-colors"
              >
                ✕
</Button>
            </div>
          {/each}
        </div>
        {#if trainingEnabled}
          <button class="nes-btn"
            onclick={() => startTraining(selectedFiles)}
            class="bits-btn w-full bg-green-600 hover:bg-green-700"
            disabled={currentJob?.status === 'running'}
          >
            {currentJob?.status === 'running' ? 'Training in Progress...' : 'Start Training'}
          </button>
        {/if}
      {/if}
    <!-- Training Progress -->
    {#if currentJob}
      <div class="space-y-4" transitionfade={{ duration 300 }}>
        <div class="flex items-center justify-between">
          <h4 class="text-lg font-semibold text-white">Training Progress</h4>
          <Badge class={getStatusColor(currentJob.status) + ' text-white'}>
            {currentJob.status.toUpperCase()}
          </Badge>
        </div>
        <!-- Progress Bars -->
        <div class="space-y-3">
          <div>
            <div class="flex justify-between text-sm text-gray-400 mb-1">
              <span>Epoch {currentJob.progress.currentEpoch}/{currentJob.progress.totalEpochs}</span>
              <span>{Math.round((currentJob.progress.currentStep / currentJob.progress.totalSteps) * 100)}%</span>
            </div>
            <div class="w-full bg-gray-700 rounded-full h-2">
              <div
                class="bg-cyan-500 h-2 rounded-full transition-all duration-500"
                style="width: {(currentJob.progress.currentStep / currentJob.progress.totalSteps) * 100}%"
              ></div>
            </div>
          </div>
          {#if uploadProgress > 0 && uploadProgress < 100}
            <div>
              <div class="flex justify-between text-sm text-gray-400 mb-1">
                <span>File Upload</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div class="w-full bg-gray-700 rounded-full h-2">
                <div
                  class="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style="width: {uploadProgress}%"
                ></div>
              </div>
            {/if}
        </div>
        <!-- Training Metrics -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-gray-800/50 p-3 rounded border border-gray-700">
            <p class="text-gray-400 text-sm">Loss</p>
            <p class="text-white font-semibold">{currentJob.progress.loss.toFixed(4)}</p>
          </div>
          <div class="bg-gray-800/50 p-3 rounded border border-gray-700">
            <p class="text-gray-400 text-sm">Accuracy</p>
            <p class="text-white font-semibold">{(currentJob.progress.accuracy * 100).toFixed(1)}%</p>
          </div>
          <div class="bg-gray-800/50 p-3 rounded border border-gray-700">
            <p class="text-gray-400 text-sm">Memory</p>
            <p class="text-white font-semibold">{formatFileSize(currentJob.metrics.memoryUsage)}</p>
          </div>
          <div class="bg-gray-800/50 p-3 rounded border border-gray-700">
            <p class="text-gray-400 text-sm">GPU Util</p>
            <p class="text-white font-semibold">{(currentJob.metrics.gpuUtilization * 100).toFixed(0)}%</p>
          </div>
        </div>
        <!-- Reinforcement Learning Stats -->
        {#if config?.useReinforcementLearning && currentJob.reinforcementLearning.episodes > 0}
          <div class="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
            <h5 class="text-purple-300 font-semibold mb-2">🎯 Reinforcement Learning</h5>
            <div class="grid grid-cols-3 gap-4">
              <div>
                <p class="text-gray-400 text-sm">Episodes</p>
                <p class="text-purple-300 font-semibold">{currentJob.reinforcementLearning.episodes}</p>
              </div>
              <div>
                <p class="text-gray-400 text-sm">Avg Reward</p>
                <p class="text-purple-300 font-semibold">{currentJob.reinforcementLearning.averageReward.toFixed(3)}</p>
              </div>
              <div>
                <p class="text-gray-400 text-sm">Best Reward</p>
                <p class="text-purple-300 font-semibold">{currentJob.reinforcementLearning.bestReward.toFixed(3)}</p>
              </div>
            </div>
          {/if}
        <!-- Training Controls -->
        <div class="flex gap-3">
          {#if currentJob.status === 'running'}
            <Button class="bits-btn" onclick={pauseTraining} variant="ghost" size="sm">
⏸️ Pause
</Button>
            <Button class="bits-btn" onclick={stopTraining} variant="error" size="sm">
⏹️ Stop
</Button>
          {:else if currentJob.status === 'paused'}
            <Button class="bits-btn" onclick={resumeTraining} variant="default" size="sm">
▶️ Resume
</Button>
            <Button class="bits-btn" onclick={stopTraining} variant="error" size="sm">
⏹️ Stop
</Button>
          {/if}
          <Button class="bits-btn"
            onclick={() =>
showAdvancedConfig = !showAdvancedConfig}
            variant="ghost"
            size="sm"
            class="ml-auto"
          >
            ⚙️ Advanced Config
</Button>
        </div>
      {/if}
    <!-- Advanced Configuration -->
    {#if showAdvancedConfig}
      <div class="space-y-4 border-t border-gray-700 pt-6" transitionfly={{ y: -20, duration 300 }}>
        <h4 class="text-lg font-semibold text-white">Advanced Configuration</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300" for="lora-rank">LoRA Rank</label><input id="lora-rank"
              type="number"
              value={config?.rank || 16}
              min="1"
              max="128"
              class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-500 focus:outline-none"
              onchange={(e) => qloraTrainingService.updateConfig({ rank: parseInt(e.target.value) })}
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300" for="learning-rate">Learning Rate</label><input id="learning-rate"
              type="number"
              value={config?.trainingParams.learningRate || 2e-4}
              step="0.0001"
              min="0.0001"
              max="0.01"
              class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-500 focus:outline-none"
              onchange={(e) => qloraTrainingService.updateConfig({
                trainingParams: { ...config?.trainingParams!, learningRate: parseFloat(e.target.value) }
              })}
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300" for="batch-size">Batch Size</label><select id="batch-size"
              value={config?.trainingParams.batchSize || 4}
              class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-500 focus:outline-none"
              onchange={(e) => qloraTrainingService.updateConfig({
                trainingParams: { ...config?.trainingParams!, batchSize: parseInt(e.target.value) }
              })}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={8}>8</option>
            </select>
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300" for="epochs">Epochs</label><input id="epochs"
              type="number"
              value={config?.trainingParams.epochs || 3}
              min="1"
              max="20"
              class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-cyan-500 focus:outline-none"
              onchange={(e) => qloraTrainingService.updateConfig({
                trainingParams: { ...config?.trainingParams!, epochs: parseInt(e.target.value) }
              })}
            />
          </div>
        </div>
        <!-- Feature Toggles -->
        <div class="space-y-3">
          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config?.useReinforcementLearning || false}
              onchange={(e) => qloraTrainingService.updateConfig({ useReinforcementLearning: e.target.checked })}
              class="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 focus:ring-2"
            />
            <span class="text-gray-300">Enable Reinforcement Learning</span>
          </label>
          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config?.enableUserAnalytics || false}
              onchange={(e) => qloraTrainingService.updateConfig({ enableUserAnalytics: e.target.checked })}
              class="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 focus:ring-2"
            />
            <span class="text-gray-300">Enable User Analytics</span>
          </label>
        </div>
      {/if}
    <!-- User Analytics Summary -->
    {#if analytics && config?.enableUserAnalytics}
      <div class="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4" transitionfade={{ duration 300 }}>
        <h5 class="text-blue-300 font-semibold mb-3">📊 User Analytics</h5>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p class="text-gray-400">Interactions</p>
            <p class="text-blue-300 font-semibold">{analytics.interactions.length}</p>
          </div>
          <div>
            <p class="text-gray-400">Accuracy Rate</p>
            <p class="text-blue-300 font-semibold">{(analytics.performance.accuracyRate * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p class="text-gray-400">Avg Task Time</p>
            <p class="text-blue-300 font-semibold">{formatDuration(analytics.performance.averageTaskTime)}</p>
          </div>
          <div>
            <p class="text-gray-400">Productivity Score</p>
            <p class="text-blue-300 font-semibold">{(analytics.performance.productivityScore * 100).toFixed(0)}</p>
          </div>
        </div>
      {/if}
  </div>
</div>
<style>
  /* Custom scrollbar for file list */
  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }
  .overflow-y-auto::-webkit-scrollbar-track {
    background: rgba(55, 65, 81, 0.3);
    border-radius: 3px;
  }
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgba(59, 130, 246, 0.5);
    border-radius: 3px;
  }
  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: rgba(59, 130, 246, 0.7);
  }
</style>