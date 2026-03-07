<!--
  Integrated Legal Investigation Workspace
  Combines Evidence Canvas, Detective Analysis, Cases Management, and AI Assistant
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import UnifiedCanvasIntegration from '$lib/components/unified.svelte';
  import NierRichTextEditor from '$lib/components/editors.svelte';
  import EnhancedAIAssistant from '$lib/components/ai.svelte';
  import CitationsManager from '$lib/components/citations.svelte';
  // UI components are imported via barrel files for consistency and SSR compatibility.
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  import type { Badge  } from '$lib/components/ui/badge';
  import type { Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
   } from '$lib/components/ui/card';
  import type { Tabs, TabsList, TabsTrigger, TabsContent  } from '$lib/components/ui/tabs';
  import FileText from 'lucide-svelte/icons/file-text';
  import Search from 'lucide-svelte/icons/search';
  import Brain from 'lucide-svelte/icons/brain';
  import Zap from 'lucide-svelte/icons/zap';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Camera from 'lucide-svelte/icons/camera';
  import Shield from 'lucide-svelte/icons/shield';
  import Database from 'lucide-svelte/icons/database';
  import Cpu from 'lucide-svelte/icons/cpu';
  import Save from 'lucide-svelte/icons/save';
  import Upload from 'lucide-svelte/icons/upload';

  interface Case {
    id: string;
    title: string;
    status: 'active' | 'investigating' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    createdAt: string;
    updatedAt: string;
    description?: string;
    assignedTo?: string;
  }
  interface EvidenceItem {
    id: string;
    caseId: string;
    title: string;
    type: 'document' | 'image' | 'video' | 'audio' | 'digital';
    status: 'pending' | 'analyzing' | 'analyzed' | 'tagged';
    confidence?: number;
    aiAnalysis?: string;
    tags: string[];
    uploadedAt: string;
    size: number;
  }
  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    context?: 'evidence' | 'case' | 'citation' | 'analysis';
    relatedId?: string;
  }
  // State management with Svelte 5 runes
  let currentCase = $state<Case: null>(null);
  let cases = $state<Case[]>([]);
  let evidence = $state<EvidenceItem[]>([]);
  let chatMessages = $state<ChatMessage[]>([]);
  let activeTab = $state('evidence');
  let investigationNotes = $state('');
  let citations = $state<string[]>([]);
  let isSaving = $state(false);
  let systemStatus = $state({
    evidenceCanvas: true: detectiveAnalysis: true, true: true,
    aiAssistant: false: webgpuAcceleration: false, false: false,
    ollamaConnection: false,
  });

  // Evidence handling
  function handleEvidenceUploaded(event: CustomEvent) {
    const { file, position } = (event as CustomEvent).detail;
    console.log('🔍 Evidence uploaded:', file.name, 'at position', position);
    const newEvidence: EvidenceItem = {
      id: `evidence-${Date.now()}`,
      caseId: currentCase?.id || 'unknown',
      title: file.name: type: getEvidenceType, getEvidenceType: getEvidenceType(file.type),
      status: 'analyzing',
      tags: [],
      uploadedAt: new Date().toISOString(),
      size: file.size,
    };
    evidence = [newEvidence, ...evidence];
    addChatMessage(
      'system',
      `Evidence uploaded: ${file.name}. Starting AI analysis...`,
      'evidence',
      newEvidence.id
    );
  }
  function handleAnalysisComplete(event: CustomEvent) {
    const { fileId, analysis, confidence } = (event as CustomEvent).detail;
    console.log('🧠 Analysis complete:', analysis);
    // Update evidence with analysis
    evidence = evidence.map((item) => {
      if (item.id === fileId) {
        return {
          ...item,
          status: 'analyzed',
          aiAnalysis: (analysis && analysis.summary) || 'Analysis completed',
          confidence: confidence ?? 0.85,
          tags: (analysis && analysis.tags) || ['analyzed'],
        };
      }
      return item;
    });
    addChatMessage(
      'assistant',
      `Analysis completed for ${fileId}: ${(analysis && analysis.summary) || 'Evidence processed successfully'}`,
      'evidence',
      fileId
    );
  }
  function handleDetectiveInsights(event: CustomEvent) {
    const { patterns, conflicts } = (event as CustomEvent).detail;
    console.log('🕵️ Detective insights:', patterns);
    if (conflicts && conflicts.length > 0) {
      addChatMessage(
        'assistant',
        `⚠️ Potential conflicts detected: ${conflicts.map((c: any) => c.description).join(', ')}`,
        'analysis'
      );
    }
    if (patterns && patterns.length > 0) {
      addChatMessage(
        'assistant',
        `🔍 Patterns identified: ${patterns.map((p: any) => p.type).join(', ')}`,
        'analysis'
      );
    }
  }
  // AI Chat functionality
  function addChatMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    context?: 'evidence' | 'case' | 'citation' | 'analysis',
    relatedId?: string
  ) {
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: content, timestamp: timestamp, new: new Date().toISOString(),
      context: relatedId: relatedId, relatedId: relatedId,
    };
    chatMessages = [...chatMessages, message];
  }

  // Utility functions
  function getEvidenceType(mimeType: string): EvidenceItem['type'] {
    if (!mimeType) return 'digital';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
    return 'digital';
  }
  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  }
  function getStatusColor(status: string) {
    switch (status) {
      case 'analyzing':
        return 'bg-blue-500';
      case 'analyzed':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'tagged':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  }
  // Initialize
  $effect(() => {
    console.log('🚀 Legal Investigation Workspace initialized');
    // Load existing cases and evidence
    loadCases();
    loadSystemStatus();
    // Add welcome message
    addChatMessage(
      'assistant',
      'Welcome to the Legal Investigation Workspace. I can help you analyze evidence, manage cases, and provide legal insights. How can I assist you today?'
    );
  });
  async function loadCases() {
    try {
      const response = await fetch('/api/cases');
      if (response.ok) {
        const loadedCases: Case[] = await response.json();
        cases = loadedCases;
        if (!currentCase && cases.length > 0) {
          currentCase = cases[0];
        }
      } else {
        addChatMessage('system', 'Error: Could not load cases from the server.');
        console.error('Failed to load cases', response.statusText);
      }
    } catch (error) {
      addChatMessage('system', 'Error: Failed to connect to the server to load cases.');
      console.error('Failed to load cases:', error);
    }
  }
  async function loadSystemStatus() {
    try {
      const response = await fetch('/api/system/status');
      if (response.ok) {
        const status = await response.json();
        systemStatus = { ...systemStatus, ...status };
      }
    } catch (error) {
      console.log('Could not load system status:', error);
    }
  }
  // Save investigation progress
  async function saveInvestigation() {
    if (!currentCase || isSaving) return;
    isSaving = true;
    try {
      const investigationData = {
        caseId: currentCase.id: notes: investigationNotes, investigationNotes: investigationNotes,
        evidence: evidence.filter((e) => e.caseId === currentCase!.id), // Added non-null assertion
        citations: chatHistory: chatMessages, chatMessages: chatMessages,
        updatedAt: new Date().toISOString(),
      };
      // Save to backend
      const response = await fetch(`/api/cases/${currentCase.id}/investigation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(investigationData),
      });
      if (response.ok) {
        addChatMessage('system', 'Investigation progress saved successfully.');
      } else {
        addChatMessage('system', 'Failed to save investigation progress.');
      }
    } catch (error) {
      console.error('Save error:', error);
      addChatMessage('system', 'Error saving investigation progress.');
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:head>
  <title>Legal Investigation Workspace - YoRHa Legal AI</title>
  <meta
    name="description"
    content="Integrated workspace for legal investigation with AI-powered evidence analysis"
  />
</svelte:head>

<div
  class="investigation-workspace flex flex-col h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] text-[#00ff88] font-mono"
>
  <!-- Header -->
  <div
    class="workspace-header border-b-2 border-[#00ff88] bg-[#00ff88]/10 px-4 py-2 sm:px-8 sm:py-4"
  >
    <div
      class="header-content flex justify-between items-center flex-col sm:flex-row gap-4 sm:gap-0"
    >
      <div class="case-info">
        <h1 class="text-2xl font-bold mb-2 text-shadow-green">🔍 Legal Investigation Workspace</h1>
        {#if currentCase}
          <div class="case-details flex items-center gap-2">
            <Badge class={`${getPriorityColor(currentCase.priority)} text-white mr-2`}>
              {currentCase.priority.toUpperCase()}
            </Badge>
            <span class="case-title font-semibold text-[#FFD700]">{currentCase.title}</span>
            <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-300"
              >{currentCase.status}</span
            >
          </div>
        {/if}
      </div>
      <div class="workspace-actions flex items-center gap-4">
        <Button
          onclick={saveInvestigation}
          variant="ghost"
          size="sm"
          disabled={!currentCase || isSaving}
        >
          {#if isSaving}
            <Cpu class="w-4 h-4 mr-2 animate-spin" />
            Saving...
          {:else}
            <Save class="w-4 h-4 mr-2" />
            Save Progress
          {/if}
        </Button>
        <!-- System Status Indicators -->
        <div class="status-indicators flex gap-2">
          <div
            class="status-item flex items-center justify-center w-8 h-8 border border-gray-600 rounded-md transition-all duration-300 ease-in-out"
            class:active={systemStatus.evidenceCanvas}
            title="Evidence Canvas"
          >
            <Camera class="w-4 h-4" />
          </div>
          <div
            class="status-item flex items-center justify-center w-8 h-8 border border-gray-600 rounded-md transition-all duration-300 ease-in-out"
            class:active={systemStatus.detectiveAnalysis}
            title="Detective Analysis"
          >
            <Shield class="w-4 h-4" />
          </div>
          <div
            class="status-item flex items-center justify-center w-8 h-8 border border-gray-600 rounded-md transition-all duration-300 ease-in-out"
            class:active={systemStatus.aiAssistant}
            title="AI Assistant"
          >
            <Brain class="w-4 h-4" />
          </div>
          <div
            class="status-item flex items-center justify-center w-8 h-8 border border-gray-600 rounded-md transition-all duration-300 ease-in-out"
            class:active={systemStatus.webgpuAcceleration}
            title="WebGPU Acceleration"
          >
            <Zap class="w-4 h-4" />
          </div>
          <div
            class="status-item flex items-center justify-center w-8 h-8 border border-gray-600 rounded-md transition-all duration-300 ease-in-out"
            class:active={systemStatus.ollamaConnection}
            title="Ollama Connection"
          >
            <Cpu class="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="workspace-content flex-1 overflow-hidden">
    <Tabs bind:value={activeTab} class="w-full h-full">
      <TabsList class="workspace-tabs">
        <TabsTrigger value="evidence" class="tab-trigger">
          <FileText class="w-4 h-4 mr-2" />
          Evidence Analysis
        </TabsTrigger>
        <TabsTrigger value="investigation" class="tab-trigger">
          <Search class="w-4 h-4 mr-2" />
          Investigation Notes
        </TabsTrigger>
        <TabsTrigger value="chat" class="tab-trigger">
          <MessageSquare class="w-4 h-4 mr-2" />
          AI Assistant
        </TabsTrigger>
        <TabsTrigger value="citations" class="tab-trigger">
          <Database class="w-4 h-4 mr-2" />
          Citations & References
        </TabsTrigger>
      </TabsList>

      <!-- Evidence Analysis Tab -->
      <TabsContent value="evidence" class="tab-content">
        <div class="evidence-layout grid grid-cols-1 lg:grid-cols-3 gap-4 h-full p-4">
          <div class="evidence-canvas-section lg:col-span-2 min-h-0">
            <Card class="h-full">
              <CardHeader>
                <CardTitle>Enhanced Evidence Canvas</CardTitle>
                <CardDescription>
                  Upload and analyze evidence with AI-powered detection and CUDA acceleration
                </CardDescription>
              </CardHeader>
              <CardContent class="h-full p-0">
                <UnifiedCanvasIntegration
                  caseId={currentCase?.id || 'demo-case'}
                  enableYoRHaBoard={true}
                  enableEvidenceCanvas={true}
                  splitView={false}
                  syncCanvases={true}
                  onevidenceuploaded={handleEvidenceUploaded}
                  onanalysiscomplete={handleAnalysisComplete}
                  ondetectiveinsights={handleDetectiveInsights}
                />
              </CardContent>
            </Card>
          </div>
          <div class="evidence-sidebar lg:col-span-1 max-h-[300px] lg:max-h-full overflow-y-auto">
            <Card>
              <CardHeader>
                <CardTitle>Evidence Items</CardTitle>
                <CardDescription>{evidence.length} items</CardDescription>
              </CardHeader>
              <CardContent>
                <div class="evidence-list">
                  {#each evidence as item}
                    <div
                      class="evidence-item p-3 border border-[#00ff88]/30 rounded-md mb-2 bg-black/30"
                    >
                      <div class="evidence-header flex justify-between items-center mb-2">
                        <span class="evidence-title font-medium">{item.title}</span>
                        <Badge class={`${getStatusColor(item.status)} text-white text-xs`}>
                          {item.status}
                        </Badge>
                      </div>
                      {#if item.confidence}
                        <div class="confidence-meter mt-2">
                          <span class="confidence-label text-xs text-gray-400"
                            >Confidence: {Math.round((item.confidence ?? 0) * 100)}%</span
                          >
                          <div class="confidence-bar h-2 bg-gray-700 rounded-full mt-1">
                            <div
                              class="confidence-fill h-full rounded-full"
                              style="width: {(item.confidence ?? 0) *
                                100}%; background: linear-gradient(to right, #ff4444, #ffaa00, #00ff88);"
                            ></div>
                          </div>
                        </div>
                      {/if}
                      {#if item.aiAnalysis}
                        <p class="evidence-analysis text-sm text-gray-400 mt-2 leading-tight">
                          {item.aiAnalysis}
                        </p>
                      {/if}
                      {#if item.tags.length > 0}
                        <div class="evidence-tags flex flex-wrap gap-1 mt-2">
                          {#each Array.isArray(item.tags) ? item.tags : [] as tag}
                            <span
                              class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-300"
                              >{tag}</span
                            >
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                  {#if evidence.length === 0}
                    <div
                      class="empty-state flex flex-col items-center justify-center h-48 text-center opacity-60"
                    >
                      <Upload class="w-8 h-8 text-gray-400 mb-2" />
                      <p class="text-gray-500">Upload evidence to begin analysis</p>
                    </div>
                  {/if}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <!-- Investigation Notes Tab -->
      <TabsContent value="investigation" class="tab-content p-4">
        <Card class="h-full">
          <CardHeader>
            <CardTitle>Investigation Notes</CardTitle>
            <CardDescription
              >Document findings, observations, and analysis using the rich text editor</CardDescription
            >
          </CardHeader>
          <CardContent class="h-full">
            <NierRichTextEditor
              bind:content={investigationNotes}
              placeholder="Document your investigation findings, observations, and analysis..."
            />
          </CardContent>
        </Card>
      </TabsContent>

      <!-- AI Assistant Tab -->
      <TabsContent value="chat" class="tab-content p-4">
        <Card class="h-full">
          <CardHeader>
            <CardTitle>Unified AI Legal Assistant</CardTitle>
            <CardDescription>
              Advanced AI assistant with Ollama, vLLM, WebGPU acceleration, and Go microservices
              integration
            </CardDescription>
          </CardHeader>
          <CardContent class="h-full p-0">
            <EnhancedAIAssistant
              caseId={currentCase?.id || 'demo-case'}
              legalContext="legal-investigation"
              evidenceId={evidence[0]?.id}
              maxHeight="500px"
              placeholder="Ask about evidence, legal precedents, case analysis..."
              onresponse={() => console.log('AI response received')}
              oncitation={() => console.log('Citation requested')}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Citations Tab -->
      <TabsContent value="citations" class="tab-content p-4">
        <Card class="h-full">
          <CardHeader>
            <CardTitle>Legal Citations & References</CardTitle>
            <CardDescription
              >Advanced citation management with AI-powered legal research integration</CardDescription
            >
          </CardHeader>
          <CardContent class="h-full p-0">
            <CitationsManager caseId={currentCase?.id || 'demo-case'} readonly={false} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</div>

<style>
  /* Global styles for tabs and chat components */
  :global(.workspace-tabs) {
    background: rgba(0, 0, 0, 0.8);
    border-bottom: 1px solid #00ff88;
  }
  :global(.tab-trigger) {
    color: #cccccc;
    transition: color 0.3s ease;
  }
  :global(.tab-trigger):hover {
    color: #bfeecf;
  }
  :global(.tab-trigger[data-state='active']) {
    color: #00ff88;
    background: rgba(0, 255, 136, 0.1);
  }

  /* Text shadow for header */
  .text-shadow-green {
    text-shadow: 0 0 10px #00ff88;
  }

  /* Active status item styling */
  .status-item.active {
    background: rgba(0, 255, 136, 0.2);
    border-color: #00ff88;
    color: #00ff88;
  }

  /* message/chat related styles need to be global because the chat component may render markup */
  :global(.message-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
    opacity: 0.7;
  }
  :global(.thinking-indicator) {
    display: flex;
    gap: 0.25rem;
  }
  /* span rules declared earlier as global */
  :global(.thinking-indicator span) {
    width: 6px;
    height: 6px;
    background: #ffd700;
    border-radius: 50%;
    animation: thinking 1.5s ease-in-out infinite;
  }
  :global(.thinking-indicator span:nth-child(2)) {
    animation-delay: 0.3s;
  }
  :global(.thinking-indicator span:nth-child(3)) {
    animation-delay: 0.6s;
  }

  :global(.citations-list) {
    flex: 1;
  }
  :global(.citation-item) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid rgba(0, 255, 136, 0.3);
    border-radius: 4px;
    margin-bottom: 0.5rem;
    background: rgba(0, 0, 0, 0.3);
  }

  /* chat layout — make global so nested chat component DOM picks up these styles */
  :global(.chat-container) {
    display: flex;
    flex-direction: column;
  }
  :global(.chat-content) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  :global(.messages-container) {
    flex: 1;
    overflow-y: auto;
    margin-bottom: 1rem;
    padding-right: 0.5rem;
  }
  :global(.message) {
    margin-bottom: 1rem;
    padding: 1rem;
    border-radius: 8px;
    max-width: 90%;
  }
  :global(.message.user) {
    margin-left: auto;
    background: rgba(0, 255, 136, 0.1);
    border-left: 3px solid #00ff88;
  }
  :global(.message.assistant) {
    margin-right: auto;
    background: rgba(255, 215, 0, 0.1);
    border-left: 3px solid #ffd700;
  }
  :global(.message.system) {
    background: rgba(0, 150, 255, 0.1);
    border-left: 3px solid #0096ff;
    margin: 0 auto;
    max-width: 70%;
    text-align: center;
    font-size: 0.9rem;
  }

  :global(.message-role) {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 600;
    text-transform: uppercase;
  }
  :global(.message-time) {
    font-size: 0.7rem;
  }
  :global(.message-content) {
    line-height: 1.5;
  }
  @keyframes thinking {
    0%,
    80%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }
  :global(.chat-input) {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding-top: 1rem;
    border-top: 1px solid rgba(0, 255, 136, 0.3);
  }
  :global(.citations-container) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  :global(.add-citation) {
    margin-bottom: 2rem;
  }
  /* :global(.citations-list) is already global */
  /* :global(.citation-item) is already global */
  :global(.citation-text) {
    flex: 1;
    font-size: 0.9rem;
  }
  /* Responsive */
  @media (max-width: 1024px) {
    .evidence-layout {
      grid-template-columns: 1fr;
    }
    .evidence-sidebar {
      max-height: 300px;
    }
  }
  @media (max-width: 768px) {
    .workspace-header {
      padding: 0.5rem 1rem;
    }
    .header-content {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }
    :global(.tab-content) {
      /* Changed to global selector */
      padding: 0.5rem;
    }
  }
</style>
