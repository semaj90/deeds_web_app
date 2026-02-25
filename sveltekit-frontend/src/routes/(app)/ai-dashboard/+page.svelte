<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import AskAI from '$lib/components/ai/AskAI.svelte';
  import ClientSideAIChat from '$lib/components/ai/ClientSideAIChat.svelte';
  import AIChatAssistant from '$lib/components/AIChatAssistant.svelte';
  import AgentChat from '$lib/components/agentic/AgentChat.svelte';
  import ClientGemmaDemo from '$lib/components/ClientGemmaDemo.svelte';
  import ClientGemmaInference from '$lib/components/ClientGemmaInference.svelte';
  import EnhancedLegalAIChatWithSynthesis from '$lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte';
  import StreamingResponse from '$lib/components/StreamingResponse.svelte';
  import ChatMessages from '$lib/components/ChatMessages.svelte';
  import ChatPanel from '$lib/components/ChatPanel.svelte';
  import YorhaAIAssistant from '$lib/components/ai/YorhaAIAssistant.svelte';
  import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
  import GamingAIButton from '$lib/components/ai/GamingAIButton.svelte';
  import EnhancedAIChatTest from '$lib/components/ai/EnhancedAIChatTest.svelte';
  import ContextualChatDemo from '$lib/components/ai/ContextualChatDemo.svelte';
  import YoRHaAIChat from '$lib/components/yorha/YoRHaAIChat.svelte';
  import EnhancedYoRHaAIAssistant from '$lib/components/yorha/EnhancedYoRHaAIAssistant.svelte';
  import IntelligentModelOrchestrator from '$lib/components/ai/IntelligentModelOrchestrator.svelte';
  import Gemma270MWebAssembly from '$lib/components/ai/Gemma270MWebAssembly.svelte';
  import SourceValidator from '$lib/components/rag/SourceValidator.svelte';
  import AnswerWithCitations from '$lib/components/rag/AnswerWithCitations.svelte';
  import RAGPipelineChart from '$lib/components/ai/RAGPipelineChart.svelte';
  import ACEContextBubble from '$lib/components/ai/ACEContextBubble.svelte';
  import RecommendationEngine from '$lib/components/ai/RecommendationEngine.svelte';
  import RAGAssistantChat from '$lib/components/ai/RAGAssistantChat.svelte';
  import type { AnswerWithCitations as AnswerData } from '$lib/types/rag-source-validation';

  interface AIStats {
    activeChats: number;
    ragQueries: number;
    documentsAnalyzed: number;
    citationsFound: number;
    casesProcessed: number;
    assistantSessions: number;
    embeddingModel: string;
    llmModel: string;
    ollamaStatus: string;
  }

  interface ModelInfo {
    name: string;
    size: string;
    modified_at: string;
  }

  let stats = $state<AIStats>({
    activeChats: 0,
    ragQueries: 0,
    documentsAnalyzed: 0,
    citationsFound: 0,
    casesProcessed: 0,
    assistantSessions: 0,
    embeddingModel: 'embeddinggemma:latest',
    llmModel: 'gemma3-legal:latest',
    ollamaStatus: 'unknown',
  });
  let models = $state<ModelInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showAskAI = $state(false);
  let showLocalAI = $state(false);
  let showCaseAssistant = $state(false);
  let showAgentChat = $state(false);
  let showGemmaDemo = $state(false);
  let showOnnxInference = $state(false);
  let showLegalSynthesis = $state(false);
  let showStreamingDemo = $state(false);
  let streamingText = $state('Analyzing the legal precedent for Smith v. Johnson (2024). The court held that under PC 187, the burden of proof requires...');
  let showChatHistory = $state(false);
  let showEmbeddingChat = $state(false);
  let showYorhaAssistant = $state(false);
  let showTypewriter = $state(false);
  let showGamingButton = $state(false);
  let showEnhancedChat = $state(false);
  let showContextualChat = $state(false);
  let showYoRHaChat = $state(false);
  let showEnhancedAssistant = $state(false);
  let showOrchestrator = $state(false);
  let showVlmAnalyzer = $state(false);
  let showRagPipeline = $state(false);
  let showPipelineChart = $state(false);
  let showACEBubble = $state(false);
  let showRecommendations = $state(false);
  let showCaseWorkflow = $state(false);
  let ragQuery = $state('');
  let ragChunks = $state<any[]>([]);
  let ragAnswer = $state<AnswerData | null>(null);
  let ragStep = $state<'search' | 'validate' | 'answer'>('search');
  let ragLoading = $state(false);
  let chatHistoryMessages = $state([
    { id: 'msg-1', role: 'user', content: 'What are the key elements of PC 187?', timestamp: new Date(Date.now() - 300000).toISOString(), citations: [], evidence_references: [] },
    { id: 'msg-2', role: 'assistant', content: 'Under PC 187, murder is defined as the unlawful killing of a human being with malice aforethought. The key elements are: (1) a human being was killed, (2) the killing was unlawful, and (3) the killing was done with malice aforethought. See Smith v. Johnson for recent precedent.', timestamp: new Date(Date.now() - 240000).toISOString(), citations: ['PC 187', 'Smith v. Johnson'], evidence_references: [] },
    { id: 'msg-3', role: 'user', content: 'What about Evidence Exhibit A?', timestamp: new Date(Date.now() - 180000).toISOString(), citations: [], evidence_references: ['Exhibit A'] },
    { id: 'msg-4', role: 'assistant', content: 'Evidence Exhibit A contains forensic analysis supporting the prosecution\'s timeline. The document references USC 18 Section 1111 and CAL 190.2 for sentencing guidelines.', timestamp: new Date(Date.now() - 120000).toISOString(), citations: ['USC 18', 'CAL 190.2'], evidence_references: ['Exhibit A'] },
  ]);

  $effect(() => {
    loadDashboard();
  });

  async function loadDashboard() {
    loading = true;
    error = null;
    try {
      const [statsRes, modelsRes] = await Promise.all([
        fetch('/api/ai/stats').catch(() => null),
        fetch('/api/ai/models').catch(() => null),
      ]);

      if (statsRes?.ok) {
        const data = await statsRes.json();
        stats = { ...stats, ...data };
      }

      if (modelsRes?.ok) {
        const data = await modelsRes.json();
        models = data.models ?? [];
        stats.ollamaStatus = 'connected';
      } else {
        stats.ollamaStatus = 'disconnected';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load AI dashboard';
      stats.ollamaStatus = 'error';
    } finally {
      loading = false;
    }
  }

  async function runRagSearch() {
    if (ragQuery.length < 3) return;
    ragLoading = true;
    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery, top_k: 10 }),
      });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();
      const chunks = data.chunks ?? data.results ?? [];
      ragChunks = chunks.map((c: any, i: number) => ({
        chunk_id: c.chunk_id ?? c.id ?? `chunk-${i}`,
        confidence: c.score >= 0.85 ? 'high' : c.score >= 0.7 ? 'medium' : c.score >= 0.5 ? 'low' : 'marginal',
        source_title: c.source_title ?? c.metadata?.fileName ?? c.collection ?? `Source ${i + 1}`,
        score: c.score ?? 0,
        text: c.text ?? c.content ?? '',
        snippet: (c.text ?? c.content ?? '').slice(0, 300),
        source_type: c.source_type ?? c.metadata?.type ?? 'document',
        related_entities: c.metadata?.entities ?? [],
      }));
      ragStep = 'validate';
    } catch (err) {
      console.error('[RAG Search]', err);
    } finally {
      ragLoading = false;
    }
  }

  async function handleRagValidate(selectedIds: string[]) {
    ragLoading = true;
    try {
      // Step 2: Validate — send approved chunk IDs
      const valRes = await fetch('/api/rag/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: ragQuery,
          approved_chunk_ids: selectedIds,
          rejected_chunk_ids: ragChunks.filter(c => !selectedIds.includes(c.chunk_id)).map(c => c.chunk_id),
        }),
      });
      if (!valRes.ok) throw new Error(`Validate failed: ${valRes.status}`);
      const context = await valRes.json();

      // Step 3: Generate answer with approved context
      const ansRes = await fetch('/api/rag/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: ragQuery,
          approved_context: context.approved_context ?? context,
          token_estimate: context.token_estimate ?? 2000,
        }),
      });
      if (!ansRes.ok) throw new Error(`Answer failed: ${ansRes.status}`);
      ragAnswer = await ansRes.json();
      ragStep = 'answer';
    } catch (err) {
      console.error('[RAG Validate/Answer]', err);
    } finally {
      ragLoading = false;
    }
  }

  const statusColor = $derived(
    stats.ollamaStatus === 'connected' ? 'text-accent' :
    stats.ollamaStatus === 'disconnected' ? 'text-danger' : 'text-warning'
  );
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <header class="mb-8 text-center">
    <h1 class="text-3xl font-bold text-sand mb-2">AI Dashboard</h1>
    <p class="text-sand/60 text-sm">Monitor AI services, models, and processing pipelines</p>
  </header>

  {#if loading}
    <div class="text-center py-16 text-sand/50">Loading AI status...</div>
  {:else}
    <!-- Ollama Status -->
    <Card class="mb-6 bg-panel border-sand/10">
      <CardHeader>
        <CardTitle class="text-sm flex items-center gap-2">
          <span class="w-2 h-2 rounded-full {statusColor === 'text-accent' ? 'bg-accent' : statusColor === 'text-danger' ? 'bg-danger' : 'bg-warning'}"></span>
          Ollama Status:
          <span class={statusColor}>{stats.ollamaStatus}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-sand/50">Embedding Model:</span>
            <span class="text-sand ml-2 font-mono">{stats.embeddingModel}</span>
          </div>
          <div>
            <span class="text-sand/50">LLM Model:</span>
            <span class="text-sand ml-2 font-mono">{stats.llmModel}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      {#each [
        { label: 'RAG Queries', value: stats.ragQueries, color: 'text-accent' },
        { label: 'Documents Analyzed', value: stats.documentsAnalyzed, color: 'text-info' },
        { label: 'Citations Found', value: stats.citationsFound, color: 'text-warning' },
        { label: 'Cases Processed', value: stats.casesProcessed, color: 'text-accent' },
        { label: 'Active Chats', value: stats.activeChats, color: 'text-info' },
        { label: 'Assistant Sessions', value: stats.assistantSessions, color: 'text-sand' },
      ] as stat}
        <Card class="bg-panel border-sand/10">
          <CardContent class="p-4 text-center">
            <p class="text-2xl font-bold {stat.color}">{stat.value}</p>
            <p class="text-xs text-sand/50 mt-1">{stat.label}</p>
          </CardContent>
        </Card>
      {/each}
    </div>

    <!-- Models -->
    {#if models.length > 0}
      <Card class="bg-panel border-sand/10">
        <CardHeader>
          <CardTitle class="text-sm text-sand/80">Available Models ({models.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid gap-2">
            {#each models as model}
              <div class="flex items-center justify-between px-3 py-2 bg-black/20 rounded text-sm">
                <span class="font-mono text-accent">{model.name}</span>
                <div class="flex items-center gap-4 text-xs text-sand/40">
                  <span>{model.size}</span>
                  <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                </div>
              </div>
            {/each}
          </div>
        </CardContent>
      </Card>
    {/if}

    <!-- AI Chat (Server) -->
    <div class="mt-6">
      <button
        onclick={() => (showAskAI = !showAskAI)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showAskAI ? 'Hide AI Chat' : 'Ask AI (Server — Gemma3 Legal)'}
      </button>
      {#if showAskAI}
        <div class="mt-3">
          <AskAI placeholder="Ask a legal question..." showReferences={true} />
        </div>
      {/if}
    </div>

    <!-- Client-Side AI Chat -->
    <div class="mt-4">
      <button
        onclick={() => (showLocalAI = !showLocalAI)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showLocalAI ? 'Hide Local AI' : 'Local AI Chat (Client ONNX — No Server)'}
      </button>
      {#if showLocalAI}
        <div class="mt-3">
          <ClientSideAIChat showStatus={true} />
        </div>
      {/if}
    </div>

    <!-- Case-Specific AI Chat -->
    <div class="mt-4">
      <button
        onclick={() => (showCaseAssistant = !showCaseAssistant)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showCaseAssistant ? 'Hide Case Assistant' : 'Case AI Assistant (Case-Specific Chat)'}
      </button>
      {#if showCaseAssistant}
        <div class="mt-3">
          <AIChatAssistant caseId="general" initialContext="AI Dashboard session" />
        </div>
      {/if}
    </div>

    <!-- Agentic Tool Chat -->
    <div class="mt-4">
      <button
        onclick={() => (showAgentChat = !showAgentChat)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showAgentChat ? 'Hide Agent Chat' : 'Agentic Tool Chat (MCP Tool Calling)'}
      </button>
      {#if showAgentChat}
        <div class="mt-3">
          <AgentChat />
        </div>
      {/if}
    </div>

    <!-- Gemma Inference Demo (Ollama Direct) -->
    <div class="mt-4">
      <button
        onclick={() => (showGemmaDemo = !showGemmaDemo)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showGemmaDemo ? 'Hide Gemma Demo' : 'Gemma Inference Demo (Ollama Direct)'}
      </button>
      {#if showGemmaDemo}
        <div class="mt-3">
          <ClientGemmaDemo />
        </div>
      {/if}
    </div>

    <!-- Client ONNX Inference (WebGPU) -->
    <div class="mt-4">
      <button
        onclick={() => (showOnnxInference = !showOnnxInference)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showOnnxInference ? 'Hide ONNX Inference' : 'Client ONNX Inference (WebGPU/WASM)'}
      </button>
      {#if showOnnxInference}
        <div class="mt-3">
          <ClientGemmaInference />
        </div>
      {/if}
    </div>

    <!-- Enhanced Legal AI Chat with LegalBERT Synthesis -->
    <div class="mt-4">
      <button
        onclick={() => (showLegalSynthesis = !showLegalSynthesis)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showLegalSynthesis ? 'Hide Legal Synthesis Chat' : 'Legal AI Synthesis (LegalBERT + RAG + Streaming)'}
      </button>
      {#if showLegalSynthesis}
        <div class="mt-3">
          <EnhancedLegalAIChatWithSynthesis />
        </div>
      {/if}
    </div>

    <!-- Streaming Response Demo -->
    <div class="mt-4">
      <button
        onclick={() => (showStreamingDemo = !showStreamingDemo)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showStreamingDemo ? 'Hide Streaming Demo' : 'Streaming Response Demo (AI Output Preview)'}
      </button>
      {#if showStreamingDemo}
        <div class="mt-3">
          <StreamingResponse response={streamingText} />
        </div>
      {/if}
    </div>

    <!-- Chat Message History -->
    <div class="mt-4">
      <button
        onclick={() => (showChatHistory = !showChatHistory)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showChatHistory ? 'Hide Chat History' : 'Chat Message History (Citation-Aware Renderer)'}
      </button>
      {#if showChatHistory}
        <div class="mt-3">
          <ChatMessages messages={chatHistoryMessages} />
        </div>
      {/if}
    </div>

    <!-- Embedding Chat (File Upload + Similarity) -->
    <div class="mt-4">
      <button
        onclick={() => (showEmbeddingChat = !showEmbeddingChat)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showEmbeddingChat ? 'Hide Embedding Chat' : 'Embedding Chat (File Upload + Similarity Search)'}
      </button>
      {#if showEmbeddingChat}
        <div class="mt-3" style="height: 500px;">
          <ChatPanel />
        </div>
      {/if}
    </div>

    <!-- YoRHa AI Assistant (WebSocket/SSE) -->
    <div class="mt-4">
      <button
        onclick={() => (showYorhaAssistant = !showYorhaAssistant)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showYorhaAssistant ? 'Hide YoRHa Assistant' : 'YoRHa AI Assistant (WebSocket/SSE Transport)'}
      </button>
      {#if showYorhaAssistant}
        <div class="mt-3">
          <YorhaAIAssistant userID="demo-user" theme="yorha" />
        </div>
      {/if}
    </div>

    <!-- Typewriter Response Demo -->
    <div class="mt-4">
      <button
        onclick={() => (showTypewriter = !showTypewriter)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showTypewriter ? 'Hide Typewriter Demo' : 'Typewriter Response (AI Thinking Animation)'}
      </button>
      {#if showTypewriter}
        <div class="mt-3 bg-panel rounded-lg p-4 border border-sand/20">
          <TypewriterResponse
            text="Under California Penal Code Section 187, murder is defined as the unlawful killing of a human being, or a fetus, with malice aforethought. The prosecution must prove beyond a reasonable doubt that the defendant acted with either express or implied malice. Express malice exists when the defendant manifests a deliberate intention to take away the life of another. Implied malice exists when the killing results from an intentional act that is dangerous to human life, and the defendant knew the act was dangerous and consciously disregarded that danger."
            speed={30}
            enableThinking={true}
            showControls={true}
          />
        </div>
      {/if}
    </div>

    <!-- Gaming AI Button Demo -->
    <div class="mt-4">
      <button
        onclick={() => (showGamingButton = !showGamingButton)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showGamingButton ? 'Hide Gaming AI Button' : 'Gaming AI Button (YoRHa Mode Toggle)'}
      </button>
      {#if showGamingButton}
        <div class="mt-3 bg-panel rounded-lg p-6 border border-sand/20 min-h-[200px] relative">
          <p class="text-sand/60 text-sm mb-4">Interactive floating AI mode toggle with quick actions and animation states.</p>
          <GamingAIButton
            onSettingsClick={() => console.log('AI settings clicked')}
          />
        </div>
      {/if}
    </div>

    <!-- Enhanced AI Chat (bits-ui Dialog) -->
    <div class="mt-4">
      <button
        onclick={() => (showEnhancedChat = !showEnhancedChat)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showEnhancedChat ? 'Hide Enhanced AI Chat' : 'Enhanced AI Chat (bits-ui Dialog + Streaming)'}
      </button>
      {#if showEnhancedChat}
        <div class="mt-3">
          <EnhancedAIChatTest bind:open={showEnhancedChat} title="Enhanced Legal AI Chat" />
        </div>
      {/if}
    </div>

    <!-- Contextual Chat Demo (HMM State Machine) -->
    <div class="mt-4">
      <button
        onclick={() => (showContextualChat = !showContextualChat)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showContextualChat ? 'Hide Contextual Chat' : 'Contextual Chat (HMM State Machine + Predictions)'}
      </button>
      {#if showContextualChat}
        <div class="mt-3">
          <ContextualChatDemo />
        </div>
      {/if}
    </div>

    <!-- YoRHa AI Chat (RAG + Ollama) -->
    <div class="mt-4">
      <button
        onclick={() => (showYoRHaChat = !showYoRHaChat)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showYoRHaChat ? 'Hide YoRHa AI Chat' : 'YoRHa AI Chat (RAG + Ollama Direct)'}
      </button>
      {#if showYoRHaChat}
        <div class="mt-3 h-[500px]">
          <YoRHaAIChat />
        </div>
      {/if}
    </div>

    <!-- 17. Enhanced YoRHa AI Assistant (RAG + Evidence + Analysis) -->
    <div class="mt-4">
      <button
        class="w-full text-left px-4 py-3 bg-panel border border-sand/10 rounded-lg hover:border-accent/30 transition text-sm font-medium text-sand/80"
        onclick={() => (showEnhancedAssistant = !showEnhancedAssistant)}
      >
        {showEnhancedAssistant ? 'Hide Enhanced Assistant' : 'Enhanced YoRHa AI Assistant (RAG + Evidence + Analysis)'}
      </button>
    </div>
    <EnhancedYoRHaAIAssistant
      isOpen={showEnhancedAssistant}
      onClose={() => (showEnhancedAssistant = false)}
      userRole="prosecutor"
    />

    <!-- 18. RAG + KAG + DAG Pipeline Orchestrator -->
    <div class="mt-4">
      <button
        class="w-full text-left px-4 py-3 bg-panel border border-sand/10 rounded-lg hover:border-accent/30 transition text-sm font-medium text-sand/80"
        onclick={() => (showOrchestrator = !showOrchestrator)}
      >
        {showOrchestrator ? 'Hide Pipeline Orchestrator' : 'RAG + KAG + DAG Pipeline Orchestrator (Search \u2192 Validate \u2192 Answer)'}
      </button>
      {#if showOrchestrator}
        <div class="mt-3">
          <IntelligentModelOrchestrator />
        </div>
      {/if}
    </div>

    <!-- 19. VLM Image Analysis (Client ONNX + Server YOLO + VLM) -->
    <div class="mt-4">
      <button
        class="w-full text-left px-4 py-3 bg-panel border border-sand/10 rounded-lg hover:border-accent/30 transition text-sm font-medium text-sand/80"
        onclick={() => (showVlmAnalyzer = !showVlmAnalyzer)}
      >
        {showVlmAnalyzer ? 'Hide VLM Analyzer' : 'VLM Image Analysis (Client ONNX + YOLO + Gemma3 Vision)'}
      </button>
      {#if showVlmAnalyzer}
        <div class="mt-3">
          <Gemma270MWebAssembly />
        </div>
      {/if}
    </div>

    <!-- 20. RAG Source Validation Pipeline (Search → Validate → Answer) -->
    <div class="mt-4">
      <button
        class="w-full text-left px-4 py-3 bg-panel border border-sand/10 rounded-lg hover:border-accent/30 transition text-sm font-medium text-sand/80"
        onclick={() => (showRagPipeline = !showRagPipeline)}
      >
        {showRagPipeline ? 'Hide RAG Validation' : 'RAG Source Validation (Search \u2192 Validate \u2192 Answer)'}
      </button>
      {#if showRagPipeline}
        <div class="mt-3 p-4 bg-panel/50 border border-sand/10 rounded-lg space-y-4">
          <!-- Step indicator -->
          <div class="flex items-center gap-2 text-xs text-sand/60">
            <span class:text-accent={ragStep === 'search'} class:font-bold={ragStep === 'search'}>1. Search</span>
            <span>→</span>
            <span class:text-accent={ragStep === 'validate'} class:font-bold={ragStep === 'validate'}>2. Validate Sources</span>
            <span>→</span>
            <span class:text-accent={ragStep === 'answer'} class:font-bold={ragStep === 'answer'}>3. Answer</span>
          </div>

          {#if ragStep === 'search'}
            <!-- Step 1: Search -->
            <div class="flex gap-2">
              <input
                type="text"
                class="flex-1 px-3 py-2 bg-panelSoft border border-sand/20 rounded text-sm text-sand placeholder:text-sand/40"
                placeholder="Enter legal query (e.g. 'elements of PC 187 murder')"
                bind:value={ragQuery}
                onkeydown={(e) => e.key === 'Enter' && ragQuery.length >= 3 && runRagSearch()}
              />
              <Button
                onclick={runRagSearch}
                disabled={ragLoading || ragQuery.length < 3}
              >
                {ragLoading ? 'Searching...' : 'Search'}
              </Button>
            </div>
          {:else if ragStep === 'validate'}
            <!-- Step 2: Validate -->
            <SourceValidator
              caseId=""
              initialQuery={ragQuery}
              chunks={ragChunks}
              isLoading={ragLoading}
              onValidate={handleRagValidate}
              onCancel={() => { ragStep = 'search'; ragChunks = []; }}
            />
          {:else if ragStep === 'answer' && ragAnswer}
            <!-- Step 3: Answer -->
            <AnswerWithCitations answer={ragAnswer} />
            <div class="flex gap-2 mt-3">
              <Button onclick={() => { ragStep = 'search'; ragAnswer = null; ragChunks = []; ragQuery = ''; }}>
                New Query
              </Button>
              <Button onclick={() => { ragStep = 'validate'; ragAnswer = null; }}>
                Back to Sources
              </Button>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- 21. RAG+KAG+DAG Pipeline Chart -->
    <div class="mt-4">
      <button
        class="w-full text-left px-4 py-3 bg-panel border border-sand/10 rounded-lg hover:border-accent/30 transition text-sm font-medium text-sand/80"
        onclick={() => (showPipelineChart = !showPipelineChart)}
      >
        {showPipelineChart ? 'Hide Pipeline Chart' : 'RAG + KAG + DAG Pipeline Chart (Architecture Visualization)'}
      </button>
      {#if showPipelineChart}
        <div class="mt-3 bg-panel/50 border border-sand/10 rounded-lg">
          <RAGPipelineChart />
        </div>
      {/if}
    </div>

    <!-- 22. ACE Context Bubble (Pipeline Metadata) -->
    <div class="mt-4">
      <button
        class="w-full text-left px-4 py-3 bg-panel border border-sand/10 rounded-lg hover:border-accent/30 transition text-sm font-medium text-sand/80"
        onclick={() => (showACEBubble = !showACEBubble)}
      >
        {showACEBubble ? 'Hide ACE Bubble' : 'ACE Context Bubble (Expandable Pipeline Metadata)'}
      </button>
      {#if showACEBubble}
        <div class="mt-3 p-4 bg-panel/50 border border-sand/10 rounded-lg space-y-4">
          <p class="text-xs text-sand/50 mb-3">Click each bubble to expand the full ACE pipeline breakdown.</p>
          <div class="flex flex-wrap gap-3 items-start">
            <!-- High confidence with full context -->
            <ACEContextBubble
              confidence={0.85}
              source="server-ollama"
              confidenceFactors={{
                caseContext: true,
                ragHits: 4,
                topScore: 0.87,
                embeddingModel: 'embeddinggemma:latest',
                codebaseHits: 0,
                kagNeighbors: 3
              }}
              citations={[
                { sourceNum: 1, documentId: 'evidence_items:abc123', similarity: 0.87 },
                { sourceNum: 3, documentId: 'legal_cases:def456', similarity: 0.72 }
              ]}
              contextUsed={['evidence_items:abc123', 'legal_documents:xyz789']}
              conversationTurns={4}
              routerDecision={{ source: 'server-ollama', reason: 'legal-keywords(3)+case-context-available', confidence: 0.85 }}
            />
            <!-- Low confidence local -->
            <ACEContextBubble
              confidence={0.35}
              source="local-onnx"
              cacheHit="idb"
              routerDecision={{ source: 'local-onnx', reason: 'simple-query', confidence: 0.9 }}
            />
            <!-- Medium with KAG -->
            <ACEContextBubble
              confidence={0.62}
              source="server-ollama"
              confidenceFactors={{
                caseContext: false,
                ragHits: 2,
                topScore: 0.58,
                embeddingModel: 'embeddinggemma:latest',
                codebaseHits: 5,
                kagNeighbors: 1
              }}
              conversationTurns={1}
              routerDecision={{ source: 'server-ollama', reason: 'rag-trigger+long-message', confidence: 0.62 }}
            />
          </div>
        </div>
      {/if}
    </div>

    <!-- 23. AI Recommendation Engine (RAG-powered legal strategy) -->
    <div class="mt-4">
      <button
        class="w-full text-left px-4 py-3 bg-panel border border-sand/10 rounded-lg hover:border-accent/30 transition text-sm font-medium text-sand/80"
        onclick={() => (showRecommendations = !showRecommendations)}
      >
        {showRecommendations ? 'Hide Recommendations' : 'AI Recommendation Engine (Legal Strategy + Evidence Analysis)'}
      </button>
      {#if showRecommendations}
        <div class="mt-3">
          <RecommendationEngine contextQuery="Generate legal case strategy recommendations" />
        </div>
      {/if}
    </div>

    <!-- 24. Case Intake Workflow -->
    <div>
      <button
        class="w-full text-left px-4 py-3 bg-panel border border-sand/10 rounded-lg hover:border-accent/30 transition text-sm font-medium text-sand/80"
        onclick={() => (showCaseWorkflow = !showCaseWorkflow)}
      >
        {showCaseWorkflow ? 'Hide Case Workflow' : 'RAG Case Intake Workflow (WHO/WHAT/WHEN/WHERE/WHY/HOW)'}
      </button>
      {#if showCaseWorkflow}
        <div class="mt-3">
          <RAGAssistantChat onCaseCreated={(id) => console.log('[Case Created]', id)} />
        </div>
      {/if}
    </div>

    {#if error}
      <Card class="mt-4 bg-panel border-danger/40">
        <CardContent class="p-4 text-center">
          <p class="text-danger text-sm">{error}</p>
          <Button onclick={() => loadDashboard()} class="mt-2">Retry</Button>
        </CardContent>
      </Card>
    {/if}
  {/if}
</div>
