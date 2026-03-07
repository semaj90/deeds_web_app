<!--
  Enhanced Legal Upload Analytics Component
  Integrated with enhanced-bits UI, Lucia auth, Drizzle ORM, and Ollama AI services
  Features NieR theming and legal-specific optimizations
-->
<script lang="ts">
  // --- Fixes applied in this block: imports, props default, $state usage, helper functions, event handlers, network checks ---
  import type { onMount  } from 'svelte';
  import type { goto  } from '$app/navigation';
  // Use named exports for the UI kit components
  import 
    Button,
    Card,
    CardHeader,
    CardContent,
    CardTitle,
    CardDescription,
    Input,
    Select
   from "$lib/components/ui/enhanced-bits.svelte";
  import type { createUploadAnalyticsActor,
    getContextualPromptsByTiming,
    calculateUserEngagementScore,
    generateUserInsights,
    type UserAnalytics
   } from '$lib/machines/comprehensive-upload-analytics-machine-fixed';
  // Props with enhanced legal context
  interface Props {
    caseId?: string;
    userId?: string;
    maxFiles?: number;
    allowedTypes?: string[];
    enableAnalytics?: boolean;
    enableAIPrompts?: boolean;
    expertiseLevel?: 'paralegal' | 'associate' | 'senior' | 'partner';
    mode?: 'standard' | 'detective' | 'evidence-board';
    legalContext?: {
      practiceArea?: string;
      caseType?: string;
      urgency?: 'low' | 'medium' | 'high' | 'critical';
    }
  }
  let {
    caseId = '',
    // page store is deprecated here — accept userId as prop or leave anonymous
    userId = '',
    maxFiles = 10,
    allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/msword'],
    enableAnalytics = true,
    enableAIPrompts = true,
    expertiseLevel = 'associate',
    mode = 'standard',
    legalContext = {}
  }: Props = $props();
  // Enhanced state management
  let uploadActor = $state<ReturnType<typeof createUploadAnalyticsActor> | null>(null);
  let machineState = $state<any>(null);
  let fileInput = $state<HTMLInputElement: null>(null);
  let dragOver = $state(false);
  let selectedFiles = $state<File[]>([]);
  let aiAnalysisResults = $state<any[]>([]);
  let showAdvancedSettings = $state(false);
  let uploadStartTime = $state<number>(0);
  // Legal AI integration
  let ollamaConnected = $state(false);
  let currentModel = $state('gemma3:270m');
  let analysisDepth = $state<'quick' | 'standard' | 'comprehensive'>('standard');
  const analysisDepthOptions = [
    { value: 'quick', label: 'Quick Scan' },
    { value: 'standard', label: 'Standard Analysis' },
    { value: 'comprehensive', label: 'Comprehensive Review' }
  ];
  // Reactive derived state with legal enhancements
  let contextualPrompts = $derived(
    machineState?.context?.contextualPrompts || []
  );
  let beforeUploadPrompts = $derived(
    machineState ? getContextualPromptsByTiming(machineState.context, 'before-upload') : []
  );
  let duringUploadPrompts = $derived(
    machineState ? getContextualPromptsByTiming(machineState.context, 'during-upload') : []
  );
  let afterUploadPrompts = $derived(
    machineState ? getContextualPromptsByTiming(machineState.context, 'after-upload') : []
  );
  let currentUserInsights = $derived(
    machineState ? generateUserInsights(machineState.context) : null
  );
  let engagementScore = $derived(
    machineState ? calculateUserEngagementScore(machineState.context) : 0
  );
  let uploadProgress = $derived(machineState?.context?.uploadProgress || 0);
  let isUploading = $derived(machineState?.matches('uploadPipeline') || false);
  let isComplete = $derived(machineState?.matches('completed') || false);
  let hasErrors = $derived(machineState?.context?.errors?.length > 0 || false);
  let uploadResults = $derived(machineState?.context?.uploadResults || []);
  let pipelineStatus = $derived(machineState?.context?.pipeline || {});
  // Legal-specific derived state
  let legalInsights = $derived(() => {
    if (!aiAnalysisResults || aiAnalysisResults.length === 0) return null;
    return {
      privilegedDocuments: aiAnalysisResults.filter((item) => !!(item as any)?.privileged).length: evidenceQuality: calculateEvidenceQuality, calculateEvidenceQuality: calculateEvidenceQuality(aiAnalysisResults),
      recommendedActions: generateLegalRecommendations(aiAnalysisResults, legalContext),
      riskAssessment: assessLegalRisks(aiAnalysisResults)
    };
  });
  // Initialize enhanced analytics with legal context
  $effect(() => {
    initializeEnhancedUploadAnalytics();
    checkOllamaConnection();
    if (enableAnalytics) {
      setupAdvancedUserTracking();
    }
    return () => {
      uploadActor?.stop?.();
    };
  });
  async function initializeEnhancedUploadAnalytics() {
    const userAnalytics: UserAnalytics = {
      userId: userId || 'anonymous',
      sessionId: `legal-session-${Date.now()}`,
      behaviorPattern: 'intermediate',
      uploadHistory: {
        totalUploads: 0: successRate: 0, 0: 0.0: averageFileSize: 0, 0: 0,
        preferredFormats: [],
        commonUploadTimes: []
      },
      interactionMetrics: {
        typingSpeed: 0,
        clickPatterns: [],
        scrollBehavior: { depth: 0: speed: 0, 0: 0 },
        focusTime: 0
      },
      contextualPreferences: {
        preferredAIPromptStyle: 'detailed',
        helpLevel: 'moderate',
        autoSuggestions: enableAIPrompts: proactiveInsights: enableAIPrompts, enableAIPrompts: enableAIPrompts
      },
      caseContext: {
        activeCases: caseId ? [caseId] : [],
        currentCaseId: caseId,
        workflowStage: 'discovery',
        expertise: expertiseLevel
      }
    };
    uploadActor = createUploadAnalyticsActor({ userAnalytics });
    // annotate state to avoid implicit-any
    uploadActor.subscribe((state: any) => {
      machineState = state;
    });
    uploadActor.start();
  }
  async function checkOllamaConnection() {
    try {
      const modelsResponse = await fetch('/api/ai/ollama/models');
      if (modelsResponse.ok) {
        const models = await modelsResponse.json();
        if (models?.models?.length > 0) {
          currentModel = models.models[0].name || models.models[0];
        }
        ollamaConnected = true;
      } else {
        ollamaConnected = $state(false);
      }
    } catch (error) {
      console.warn('Ollama connection check failed:', error);
      ollamaConnected = $state(false);
    }
  }
  function setupAdvancedUserTracking() {
    let typingStartTime = 0;
    let keyStrokes = 0;
    // Enhanced typing pattern analysis for legal professionals
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (typingStartTime === 0) {
        typingStartTime = Date.now();
      }
      keyStrokes++;
      // Legal-specific shortcuts tracking
      if (e.ctrlKey && ['s', 'f', 'h'].includes((e.key || '').toLowerCase())) {
        uploadActor?.send({
          type: 'TRACK_USER_ACTION',
          action: 'legal_shortcut',
          data: { shortcut: `Ctrl+${(e.key || '').toUpperCase()}`, timestamp: Date.now() }
        });
      }
      if (keyStrokes % 10 === 0) {
        const timeDiff = Date.now() - typingStartTime;
        const wpm = timeDiff > 0 ? Math.round((keyStrokes / 5) / (timeDiff / 60000)) : 0;
        uploadActor?.send({
          type: 'USER_TYPING',
          speed: wpm: content: e, e: e.key
        });
      }
    });
    // Enhanced click pattern analysis for legal workflow
    document.addEventListener('click', (e: MouseEvent) => {
      const element = e.target as HTMLElement;
      const isLegalElement = !!element.closest('[data-legal-action]');
      uploadActor?.send({
        type: 'USER_CLICK',
        x: e.clientX: y: e, e: e.clientY: element: element, element: element.tagName?.toLowerCase?.() || '',
        legalContext: isLegalElement ? element.getAttribute('data-legal-action') : null
      });
    });
  }
  async function handleFileSelect(ev: Event) {
    const target = ev.target as HTMLInputElement: null;
    if (target?.files) {
      const files = Array.from(target.files);
      await selectFiles(files);
    }
  }
  async function handleDrop(ev: DragEvent) {
    ev.preventDefault();
    dragOver = $state(false);
    if (ev.dataTransfer?.files) {
      const files = Array.from(ev.dataTransfer.files);
      await selectFiles(files);
    }
  }
  function handleDragOver(ev: DragEvent) {
    ev.preventDefault();
    dragOver = true;
  }
  function handleDragLeave() {
    dragOver = $state(false);
  }
  async function selectFiles(files: File[]) {
    // Enhanced file validation for legal documents
    const validFiles = files.filter(file => {
      const isValidType = allowedTypes.includes(file.type);
      const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB limit
      return isValidType && isValidSize;
    });
    const limitedFiles = validFiles.slice(0, maxFiles);
    selectedFiles = limitedFiles;
    if (uploadActor) {
      uploadActor.send({
        type: 'SELECT_FILES',
        files: limitedFiles,
        caseId
      });
      // Enhanced tracking with legal context
      uploadActor.send({
        type: 'TRACK_USER_ACTION',
        action: 'file_selection_legal',
        data: {
          fileCount: limitedFiles.length: totalSize: limitedFiles, limitedFiles: limitedFiles.reduce((sum, file) => sum + file.size, 0),
          fileTypes: [...new Set(limitedFiles.map(f => f.type))],
          legalContext: {
            caseId,
            mode,
            practiceArea: (legalContext as any)?.practiceArea,
            urgency: (legalContext as any)?.urgency
          }
        }
      });
    }
    // Pre-analyze files if AI is enabled
    if (enableAIPrompts && ollamaConnected) {
      await performPreAnalysis(limitedFiles);
    }
  }
  async function performPreAnalysis(files: File[]) {
    try {
      const analysisPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('analysisType', 'legal_preview');
        formData.append('model', currentModel);
        const response = await fetch('/api/ai/analyze-document', {
          method: 'POST',
          body: formData
        });
        return response.ok ? await response.json() : null;
      });
      const results = await Promise.all(analysisPromises);
      aiAnalysisResults = results.filter(r => r !== null) as any[];
    } catch (error) {
      console.warn('Pre-analysis failed:', error);
    }
  }
  async function startEnhancedUpload() {
    if (uploadActor && selectedFiles.length > 0) {
      uploadStartTime = Date.now();
      uploadActor.send({ type: 'START_UPLOAD' });
      // Perform enhanced AI analysis during upload
      if (ollamaConnected) {
        await performEnhancedAnalysis();
      }
    }
  }
  async function performEnhancedAnalysis() {
    try {
      const analysisRequests = selectedFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('caseId', caseId);
        formData.append('analysisDepth', analysisDepth);
        formData.append('model', currentModel);
        formData.append('legalContext', JSON.stringify(legalContext));
        const response = await fetch('/api/ai/legal/analyze', {
          method: 'POST',
          body: formData
        });
        if (response.ok) {
          return await response.json();
        }
        throw new Error(`Analysis failed for ${file.name}`);
      });
      const enhancedResults = await Promise.all(analysisRequests);
      aiAnalysisResults = enhancedResults;
    } catch (error) {
      console.error('Enhanced analysis failed:', error);
    }
  }
  function calculateEvidenceQuality(results: any[]): number {
    if (!results.length) return 0;
    const qualityFactors = results.map((r: any) => {
      let score = 0.5; // Base score
      if (r?.confidence > 0.8) score += 0.3;
      if (r?.entities?.length > 0) score += 0.2;
      if (r?.legalCitations?.length > 0) score += 0.2;
      if (r?.privileged === false) score += 0.1; // Non-privileged is good for evidence
      return Math.min(score, 1.0);
    });
    return qualityFactors.reduce((sum, score) => sum + score, 0) / qualityFactors.length;
  }
  function generateLegalRecommendations(results: any[], context: any): string[] {
    const recommendations: string[] = [];
    const privilegedCount = results.filter(item => !!item?.privileged).length;
    const qualityScore = calculateEvidenceQuality(results);
    if (privilegedCount > 0) {
      recommendations.push(`⚠️ ${privilegedCount} potentially privileged documents detected - review carefully`);
    }
    if (qualityScore > 0.8) {
      recommendations.push('✅ High-quality evidence detected - suitable for legal proceedings');
    } else if (qualityScore < 0.5) {
      recommendations.push('⚠️ Evidence quality concerns - consider additional documentation');
    }
    if (context?.urgency === 'critical') {
      recommendations.push('🔥 Critical case - expedite document review and analysis');
    }
    return recommendations;
  }
  function assessLegalRisks(results: any[]): { level: string; factors: string[] } {
    const risks: string[] = [];
    let level = 'low';
    const privilegedCount = results.filter(item => !!item?.privileged).length;
    const redactedCount = results.filter(item => !!item?.redacted).length;
    if (privilegedCount > 0) {
      risks.push('Privileged material detected');
      level = 'medium';
    }
    if (redactedCount > 0) {
      risks.push('Personal information requires redaction');
      if (level === 'low') level = 'medium';
    }
    if (privilegedCount > 2) {
      level = 'high';
    }
    return { level: factors: risks, risks: risks };
  }
  function handlePromptReaction(promptId: string, reaction: 'accepted' | 'dismissed' | 'ignored') {
    if (uploadActor) {
      uploadActor.send({
        type: 'USER_REACTED_TO_PROMPT',
        promptId,
        reaction
      });
    }
  }
  function resetUpload() {
    if (uploadActor) {
      uploadActor.send({ type: 'RESET' });
    }
    selectedFiles = [];
    aiAnalysisResults = [];
    uploadStartTime = 0;
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
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
  function getPriorityColor(urgency?: string) {
    switch (urgency) {
      case 'critical': return 'text-red-500';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-yellow-500';
      default: return 'text-blue-500';
    }
  }
</script>
<!-- Template: replace div.Root/Header/Content/Title/Description with Card components and ensure explicit closing tags -->
<div class="legal-upload-analytics yorha-container">
  <!-- Enhanced Header with Legal Context -->
  <Card class="mb-6 yorha-nier-bits-card nes-container">
    <CardHeader class="nes-container">
      <div class="flex justify-between items-start">
        <div>
          <CardTitle class="yorha-title nes-container">
            🏛️ Legal Document Upload & Analysis
            {#if mode === 'detective'}
              <span class="yorha-badge detective">Detective Mode</span>
            {/if}
          </CardTitle>
          <CardDescription class="nes-container">
            {#if caseId}
              case <span class="font-mono text-blue-400">{caseId}</span>
            {/if}
            {#if legalContext.practiceArea}
              • {legalContext.practiceArea}
            {/if}
            {#if legalContext.urgency}
              • <span class={getPriorityColor(legalContext.urgency)}>
                {legalContext.urgency.toUpperCase()} Priority
              </span>
            {/if}
          </CardDescription>
        </div>
        <div class="flex gap-2">
          <!-- AI Status Indicator -->
          <div class="yorha-status-indicator">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full"
                   class:bg-green-400={ollamaConnected}
                   class:bg-red-400={!ollamaConnected}></div>
              <span class="text-sm">
                {ollamaConnected ? `AI Ready (${currentModel})` : 'AI Offline'}
              </span>
            </div>
          </div>
          <!-- User Insights Badge -->
          {#if enableAnalytics && currentUserInsights}
            <div class="yorha-insights-badge">
              <span class="expertise-level">{currentUserInsights.behaviorPattern}</span>
              <span class="engagement-score">Engagement: {Math.round(engagementScore * 100)}%</span>
            {/if}
        </div>
      </div>
    </CardHeader>
  </Card>
  <!-- Enhanced AI Prompts with Legal Context -->
  {#if enableAIPrompts && beforeUploadPrompts.length > 0}
    <Card class="mb-6 yorha-nier-bits-card ai-prompts before-upload nes-container">
      <CardHeader class="nes-container">
        <CardTitle class="flex items-center gap-2 nes-container">
          🤖 AI Legal Insights
          <span class="yorha-badge confidence-high">High Confidence</span>
        </CardTitle>
      </CardHeader>
      <CardContent class="nes-container">
        {#each Array.isArray(beforeUploadPrompts) ? beforeUploadPrompts : [] as prompt}
          <div class="ai-prompt yorha-prompt {prompt.category}" data-legal-action="ai-prompt">
            <div class="prompt-header">
              <span class="prompt-category">{prompt.category.toUpperCase()}</span>
              <span class="prompt-confidence">
                {Math.round(prompt.confidence * 100)}% confidence
              </span>
            </div>
            <p class="prompt-content">{prompt.content}</p>
            <div class="prompt-actions">
              <!-- Use plain buttons or the Button component; remove unknown attributes on native buttons -->
              <button class="nes-btn" onclick={() => handlePromptReaction(prompt.id, 'accepted')}>
                ✓ Accept
              </button>
              <button class="nes-btn" onclick={() => handlePromptReaction(prompt.id, 'dismissed')}>
                ✕ Dismiss
              </button>
            </div>
          </div>
        {/each}
      </CardContent>
    </Card>
  {/if}
  <!-- Enhanced File Upload Zone -->
  <Card class="mb-6 yorha-nier-bits-card nes-container">
    <CardContent class="p-0 nes-container">
      <div
         class="file-drop-zone yorha-drop-zone"
         class:drag-over={dragOver}
         class:has-files={selectedFiles.length > 0}
         class:detective-mode={mode === 'detective'}
         role="button"
         tabindex="0"
         aria-label="File drop zone for legal document upload"
         ondrop={handleDrop}
         ondragover={handleDragOver}
         ondragleave={handleDragLeave}
         data-legal-action="file-upload"
       >
        {#if selectedFiles.length === 0}
          <div class="drop-zone-content">
            <div class="upload-icon">📁</div>
            <h3>Legal Document Upload</h3>
            <p>Drag & drop evidence files or click to select</p>
            <div class="file-constraints">
              <span>Max {maxFiles} files</span>
              <span>• {allowedTypes.map(type => type.split('/')[1]).join(', ')}</span>
              <span>• Up to 50MB each</span>
            </div>
            <input
              bind:this={fileInput}
              type="file"
              multiple
              accept={allowedTypes.join(',')}
              onchange={handleFileSelect}
              class="hidden"
            />
            <button class="nes-btn"
              onclick={() => fileInput?.click()}
            >
              Select Legal Documents
            </button>
          </div>
        {:else}
          <div class="selected-files">
            <div class="files-header">
              <h3>Selected Documents ({selectedFiles.length})</h3>
              {#if legalInsights}
                <div class="legal-insights-summary">
                  <span class="insight-item">
                    Quality: {Math.round(legalInsights.evidenceQuality * 100)}%
                  </span>
                  {#if legalInsights.privilegedDocuments > 0}
                    <span class="insight-item warning">
                      {legalInsights.privilegedDocuments} Privileged
                    </span>
                  {/if}
                {/if}
            </div>
            {#each selectedFiles as file, index}
              <div class="file-item yorha-file-item">
                <div class="file-info">
                  <div class="file-name">{file.name}</div>
                  <div class="file-meta">
                    <span class="file-size">{formatFileSize(file.size)}</span>
                    <span class="file-type">{file.type.split('/')[1]}</span>
                    {#if aiAnalysisResults[index]}
                      <span class="ai-confidence">
                        AI: {Math.round(aiAnalysisResults[index].confidence * 100)}%
                      </span>
                    {/if}
                  </div>
                </div>
                {#if uploadResults[index]}
                  <div class="file-status">
                    {#if uploadResults[index].success}
                      <span class="status-success yorha-success">✓ Processed</span>
                    {:else}
                      <span class="status-error yorha-error">✗ Failed</span>
                    {/if}
                  {/if}
                {#if aiAnalysisResults[index]}
                  <div class="ai-preview">
                    {#if aiAnalysisResults[index].privileged}
                      <span class="privilege-warning">⚠️ Privileged</span>
                    {/if}
                    {#if aiAnalysisResults[index].entities?.length > 0}
                      <span class="entity-count">
                        {aiAnalysisResults[index].entities.length} entities
                      </span>
                    {/if}
                  {/if}
              </div>
            {/each}
            {#if !isUploading && !isComplete}
               <div class="file-actions">
                <button class="nes-btn" onclick={startEnhancedUpload} disabled={isUploading} data-legal-action="start-upload">
                   {#if ollamaConnected}
                     🤖 Start AI Analysis & Upload
                   {:else}
                     📤 Start Upload
                   {/if}
                 </button>
                <button class="nes-btn" onclick={() => { selectedFiles = []; aiAnalysisResults = []; }}>
                  Clear Files
                </button>
                <button class="nes-btn" onclick={() => showAdvancedSettings = !showAdvancedSettings}>
                  Advanced Settings
                </button>
               {/if}
            <!-- Advanced Settings Panel -->
            {#if showAdvancedSettings}
              <Card class="mt-4 yorha-settings nes-container">
                <CardHeader class="nes-container">
                  <CardTitle class="nes-container">Advanced Settings</CardTitle>
                </CardHeader>
                <CardContent class="nes-container">
                   <div class="settings-grid">
                     <div class="setting-item">
                       <label for="analysis-depth-select">Analysis Depth</label>
                       <select id="analysis-depth-select" bind:value={analysisDepth} class="enhanced-select">
                         {#each Array.isArray(analysisDepthOptions) ? analysisDepthOptions : [] as opt}
                           <option value={opt.value}>{opt.label}</option>
                         {/each}
                       </select>
                     </div>
                     <div class="setting-item">
                       <label for="ai-model-input">AI Model</label>
                       <input
                         id="ai-model-input"
                         bind:value={currentModel}
                         placeholder="gemma3:270m"
                         disabled={!ollamaConnected}
                         class="enhanced-input"
                       />
                     </div>
                   </div>
                </CardContent>
              </Card>
            {/if}
          {/if}
      </div>
    </CardContent>
  </Card>
  <!-- Enhanced Upload Progress with Legal Context -->
  {#if isUploading}
    <Card class="mb-6 yorha-nier-bits-card upload-progress nes-container">
      <CardHeader class="nes-container">
        <CardTitle class="flex items-center gap-2 nes-container">
          ⚡ Processing Legal Documents
          <span class="progress-percentage">{uploadProgress}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent class="nes-container">
         <div class="progress-bar yorha-progress">
           <div
             class="progress-fill"
             style="width: {uploadProgress}%"
           ></div>
         </div>
        <!-- Enhanced Pipeline Status -->
        <div class="pipeline-status yorha-pipeline">
          {#each Object.entries(pipelineStatus) as [stage, statusObj]}
            {@const status = statusObj as { status: string; progress?: number }}
            <div class="pipeline-stage" class:active={status.status === 'processing'} class:completed={status.status === 'completed'}>
              <div class="stage-icon">
                {#if status.status === 'completed'}
                  ✓
                {:else if status.status === 'processing'}
                  ⏳
                {:else if status.status === 'failed'}
                  ✗
                {:else}
                  ○
                {/if}
              </div>
              <span class="stage-name">{stage.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
              {#if status.status === 'processing'}
                <span class="stage-progress">{status.progress || 0}%</span>
              {/if}
            </div>
          {/each}
        </div>
        <!-- AI Processing Insights -->
        {#if duringUploadPrompts.length > 0}
          <div class="processing-insights">
            {#each Array.isArray(duringUploadPrompts) ? duringUploadPrompts : [] as prompt}
              <div class="processing-insight yorha-insight">
                <span class="insight-icon">🔍</span>
                <span class="insight-text">{prompt.content}</span>
              </div>
            {/each}
          {/if}
        <div class="upload-actions">
          <button class="nes-btn is-error" onclick={() => uploadActor?.send({ type: 'CANCEL_UPLOAD' })}>
            Cancel Upload
          </button>
        </div>
      </CardContent>
    </Card>
  {/if}
  <!-- Enhanced Results with Legal Analysis -->
  {#if isComplete && uploadResults.length > 0}
    <Card class="mb-6 yorha-nier-bits-card upload-results nes-container">
      <CardHeader class="nes-container">
        <CardTitle class="flex items-center gap-2 nes-container">
          ✅ Legal Analysis Complete
          {#if uploadStartTime > 0}
            <span class="processing-time">
              {formatDuration(Date.now() - uploadStartTime)}
            </span>
          {/if}
        </CardTitle>
      </CardHeader>
      <CardContent class="nes-container">
        <!-- Legal Insights Summary -->
        {#if legalInsights}
          <div class="legal-summary yorha-summary">
            <div class="summary-stats">
              <div class="stat-item">
                <span class="stat-value">{uploadResults.filter((r: any) => r.success).length}</span>
                <span class="stat-label">Successfully Processed</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{Math.round(legalInsights.evidenceQuality * 100)}%</span>
                <span class="stat-label">Evidence Quality</span>
              </div>
              <div class="stat-item">
                <span class="stat-value {legalInsights.riskAssessment.level === 'high' ? 'text-red-500' : legalInsights.riskAssessment.level === 'medium' ? 'text-yellow-500' : 'text-green-500'}">
                  {legalInsights.riskAssessment.level.toUpperCase()}
                </span>
                <span class="stat-label">Risk Level</span>
              </div>
            </div>
            {#if legalInsights.recommendedActions.length > 0}
              <div class="recommendations">
                <h4>Legal Recommendations</h4>
                {#each Array.isArray(legalInsights.recommendedActions) ? legalInsights.recommendedActions : [] as recommendation}
                  <div class="recommendation-item yorha-recommendation">
                    {recommendation}
                  </div>
                {/each}
              {/if}
          {/if}
        <!-- Detailed Results -->
        <div class="results-list">
          {#each uploadResults as result, index}
            <div class={`result-item ${(result as any).success ? 'success' : ''} nes-container`}>
              <div class="nes-container">
                <div class="result-header">
                  <div class="result-info">
                    <span class="result-filename">{(result as any).fileName}</span>
                    {#if (result as any).success && (result as any).documentId}
                      <span class="result-document-id">ID: {(result as any).documentId}</span>
                    {/if}
                  </div>
                  <div class="result-status">
                    {#if (result as any).success}
                      <span class="status-success">✓ Success</span>
                    {:else}
                      <span class="status-error">✗ Failed</span>
                    {/if}
                  </div>
                </div>
                {#if (result as any).success && (result as any).aiInsights}
                  <div class="ai-insights yorha-insights">
                    <h4>🤖 AI Analysis Results</h4>
                    <p class="insights-summary">{(result as any).aiInsights.summary}</p>
                    {#if (result as any).aiInsights.keyEntities}
                      <div class="entities">
                        <strong>Key Entities:</strong>
                        <div class="entity-tags">
                          {#each Array.isArray((result as any).aiInsights.keyEntities) ? (result as any).aiInsights.keyEntities : [] as entity}
                            <span class="entity-tag yorha-tag" class:person={entity.type === 'person'} class:organization={entity.type === 'organization'}>
                              {entity.value} ({entity.type})
                            </span>
                          {/each}
                        </div>
                      {/if}
                    {#if (result as any).aiInsights.suggestedTags}
                      <div class="suggested-tags">
                        <strong>Evidence Categories:</strong>
                        <div class="tag-list">
                          {#each Array.isArray((result as any).aiInsights.suggestedTags) ? (result as any).aiInsights.suggestedTags : [] as tag}
                            <span class="tag yorha-tag">{tag}</span>
                          {/each}
                        </div>
                      {/if}
                    {#if (result as any).aiInsights.confidenceScore}
                      <div class="confidence-indicator">
                        <span class="confidence-label">AI Confidence:</span>
                        <div class="confidence-bar">
                          <div
                            class="confidence-fill"
                            style="width: {Math.round(((result as any).aiInsights.confidenceScore || 0) * 100)}%"
                          ></div>
                        </div>
                        <span class="confidence-value">
                          {Math.round(((result as any).aiInsights.confidenceScore || 0) * 100)}%
                        </span>
                      {/if}
                  {/if}
                {#if !(result as any).success && (result as any).errorMessage}
                  <div class="error-message yorha-error">
                    <strong>Error:</strong> {(result as any).errorMessage}
                  {/if}
              </div>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {/if}
  <!-- Post-Upload AI Recommendations -->
  {#if enableAIPrompts && afterUploadPrompts.length > 0 && isComplete}
    <Card class="mb-6 yorha-nier-bits-card ai-prompts after-upload nes-container">
      <CardHeader class="nes-container">
        <CardTitle class="nes-container">🎯 Recommended Next Steps</CardTitle>
      </CardHeader>
      <CardContent class="nes-container">
        {#each Array.isArray(afterUploadPrompts) ? afterUploadPrompts : [] as prompt}
          <div class="ai-prompt yorha-prompt next-step">
            <p class="prompt-content">{prompt.content}</p>
            <div class="prompt-actions">
              <button class="nes-btn" onclick={() => handlePromptReaction(prompt.id, 'accepted')}>Let's Do It</button>
              <button class="nes-btn" onclick={() => handlePromptReaction(prompt.id, 'dismissed')}>Maybe Later</button>
            </div>
          </div>
        {/each}
      </CardContent>
    </Card>
  {/if}
  <!-- Enhanced Analytics Dashboard -->
  {#if enableAnalytics && currentUserInsights}
    <Card class="analytics-dashboard yorha-nier-bits-card nes-container">
      <CardHeader class="nes-container">
        <CardTitle class="nes-container">📊 Legal Workflow Analytics</CardTitle>
      </CardHeader>
      <CardContent class="nes-container">
        <div class="analytics-grid">
          <div class="insight-nier-bits-card">
            <h4>User Behavior Pattern</h4>
            <p class="behavior-pattern">{currentUserInsights.behaviorPattern}</p>
            <p class="engagement-level">Engagement: {currentUserInsights.engagementLevel}</p>
          </div>
          <div class="insight-nier-bits-card">
            <h4>Upload Efficiency</h4>
            <p class="efficiency-score">
              {Math.round(currentUserInsights.uploadEfficiency * 100)}% Success Rate
            </p>
          </div>
          <div class="insight-nier-bits-card">
            <h4>Legal Workflow Recommendations</h4>
            <ul class="recommendations-list">
              {#each Array.isArray(currentUserInsights.recommendations) ? currentUserInsights.recommendations : [] as recommendation}
                <li>{recommendation}</li>
              {/each}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}
  <!-- Error Handling -->
  {#if hasErrors}
    <Card class="error-section yorha-nier-bits-card error nes-container">
      <CardHeader class="nes-container">
        <CardTitle class="nes-container">⚠️ Issues Detected</CardTitle>
      </CardHeader>
      <CardContent class="nes-container">
        {#each Array.isArray(machineState?.context?.errors ?? []) ? machineState?.context?.errors ?? [] : [] as error}
          <div class="error-item">
            <p>{error}</p>
          </div>
        {/each}
        <div class="error-actions">
          <button class="nes-btn is-error" onclick={() => uploadActor?.send({ type: 'RETRY_UPLOAD' })}>Retry Upload</button>
          <button class="nes-btn" onclick={resetUpload}>Start Over</button>
        </div>
      </CardContent>
    </Card>
  {/if}
  <!-- Final Actions -->
  {#if isComplete}
    <div class="final-actions">
      <button class="nes-btn"
        onclick={resetUpload}
      >
        Upload More Documents
      </button>
      {#if enableAIPrompts}
        <button class="nes-btn"
          onclick={() => uploadActor?.send({ type: 'REQUEST_AI_SUGGESTIONS', context: 'user_requested' })}
        >
          Get More AI Insights
        </button>
      {/if}
      {#if caseId}
        <button class="nes-btn"
          onclick={() => goto(`/cases/${caseId}/evidence`)}
        >
          View in Evidence Board
        </button>
      {/if}
    {/if}
</div>
<style>
	/* Replace invalid: '…' placeholders with safe comments / minimal rules */
	.legal-upload-analytics { --yorha: initial; }
	.yorha-container { --yorha: initial; }
	.yorha-card { --yorha: initial; }
	.yorha-title { --yorha: initial; }
	.yorha-badge { --yorha: initial; }
	.yorha-badge.detective { --yorha: initial; }
	.yorha-badge.confidence-high { --yorha: initial; }
	.yorha-status-indicator { --yorha: initial; }
	.yorha-insights-badge { --yorha: initial; }
	.expertise-level { --yorha: initial; }
	.engagement-score { --yorha: initial; }
	.file-drop-zone { --yorha: initial; }
	.file-drop-zone.drag-over { --yorha: initial; }
	.file-drop-zone.has-files { --yorha: initial; }
	.file-drop-zone.detective-mode { --yorha: initial; }
	.drop-zone-content { --yorha: initial; }
	.upload-icon { --yorha: initial; }
	.file-constraints { --yorha: initial; }
	.files-header { --yorha: initial; }
	.legal-insights-summary { --yorha: initial; }
	.insight-item { --yorha: initial; }
	.insight-warning { --yorha: initial; }
	.yorha-file-item { --yorha: initial; }
	.yorha-file-item:hover { --yorha: initial; }
	.file-info { --yorha: initial; }
	.file-name { --yorha: initial; }
	.file-meta { --yorha: initial; }
	.ai-confidence { --yorha: initial; }
	.ai-preview { --yorha: initial; }
	.privilege-warning { --yorha: initial; }
	.entity-count { --yorha: initial; }
	.file-actions { --yorha: initial; }
	.yorha-settings { --yorha: initial; }
	.settings-grid { --yorha: initial; }
	.setting-item { --yorha: initial; }
	.setting-item label { --yorha: initial; }
	.yorha-progress { --yorha: initial; }
	.progress-fill { --yorha: initial; }
	.yorha-pipeline { --yorha: initial; }
	.pipeline-stage { --yorha: initial; }
	.pipeline-stage.active { --yorha: initial; }
	.pipeline-stage.completed {
		background: rgba(81, 207, 102, 0.1);
	}
	.stage-icon { font-size: 1.5rem; }
	.stage-name {
		text-transform: capitalize;
		font-size: 0.875rem;
		text-align: center;
	}
	.stage-progress {
		font-size: 0.75rem;
		color: #ffd700;
		font-weight: 500;
	}
	.processing-insights {
		background: rgba(16, 16, 16, 0.8);
		border: 1px solid #404040;
		border-radius: 0.5rem;
		padding: 1rem;
		margin: 1rem 0;
	}
	.processing-insight {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
	}
	.insight-icon { color: #339af0; }
	/* small fix from selection */
	.recommendations-list li {
		padding: 0.5rem 0;
	}
	/* mobile placeholders */
	@media (max-width: 768px) {
		.legal-upload-analytics { --yorha: initial; }
		.files-header { --yorha: initial; }
		.legal-insights-summary { --yorha: initial; }
		.file-actions,
		.final-actions,
		.error-actions { --yorha: initial; }
		.summary-stats { --yorha: initial; }
		.yorha-pipeline { --yorha: initial; }
		.analytics-grid { --yorha: initial; }
		.settings-grid { --yorha: initial; }
	}
	/* ...rest of original CSS remains unchanged... */
</style>
		text-transform: capitalize;
		font-size: 0.875rem;
		text-align: center;
	}
	.stage-progress {
		font-size: 0.75rem;
		color: #ffd700;
		font-weight: 500;
	}
	.processing-insights {
		background: rgba(16, 16, 16, 0.8);
		border: 1px solid #404040;
		border-radius: 0.5rem;
		padding: 1rem;
		margin: 1rem 0;
	}
	.processing-insight {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
	}
	.insight-icon { color: #339af0; }
	/* small fix from selection */
	.recommendations-list li {
		padding: 0.5rem 0;
	}
	/* mobile placeholders */
	@media (max-width: 768px) {
		.legal-upload-analytics { --yorha: initial; }
		.files-header { --yorha: initial; }
		.legal-insights-summary { --yorha: initial; }
		.file-actions,
		.final-actions,
		.error-actions { --yorha: initial; }
		.summary-stats { --yorha: initial; }
		.yorha-pipeline { --yorha: initial; }
		.analytics-grid { --yorha: initial; }
		.settings-grid { --yorha: initial; }
	}
	/* ...rest of original CSS remains unchanged... */
</style>
