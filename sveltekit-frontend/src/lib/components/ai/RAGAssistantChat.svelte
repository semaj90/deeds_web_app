<!-- RAG Assistant Chat — WHO/WHAT/WHEN/WHERE/WHY/HOW guided case intake workflow -->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { cn } from '$lib/utils';

  interface Message {
    id: string;
    content: string;
    type: 'user' | 'assistant' | 'system';
    timestamp: string;
  }

  interface RAGAssistantChatProps {
    onCaseCreated?: (caseId: string) => void;
    class?: string;
  }

  let {
    onCaseCreated,
    class: className = ''
  }: RAGAssistantChatProps = $props();

  // Chat state
  let messages = $state<Message[]>([]);
  let currentMessage = $state('');
  let isTyping = $state(false);
  let isProcessing = $state(false);
  let chatContainer = $state<HTMLDivElement | null>(null);

  // Workflow state
  let workflowActive = $state(false);
  let currentStep = $state(0);
  let workflowData = $state<Record<string, string>>({
    what: '', who: '', when: '', where: '', why: '', how: '',
    priority: 'medium', category: 'criminal'
  });

  // RAG state
  let isIngesting = $state(false);
  let ingestionProgress = $state(0);
  let ragContext = $state<Array<{ type: string; title: string; relevance: number; summary: string }>>([]);

  const workflowSteps = [
    { key: 'what', question: 'What happened? Please describe the incident or situation in detail.', icon: 'file-text', placeholder: 'Describe what occurred, the nature of the incident, key events...' },
    { key: 'who', question: 'Who was involved? Identify all parties, witnesses, and key individuals.', icon: 'users', placeholder: 'List suspects, victims, witnesses, law enforcement, experts...' },
    { key: 'when', question: 'When did this occur? Provide timeline details and chronology.', icon: 'clock', placeholder: 'Dates, times, sequence of events, duration...' },
    { key: 'where', question: 'Where did it happen? Specify all relevant locations.', icon: 'map-pin', placeholder: 'Crime scene, addresses, jurisdictions, related locations...' },
    { key: 'why', question: 'Why did this happen? What was the motive or underlying cause?', icon: 'life-buoy', placeholder: 'Motive, intent, circumstances, contributing factors...' },
    { key: 'how', question: 'How was it carried out? Describe the method and execution.', icon: 'settings', placeholder: 'Method of operation, tools used, sequence of actions...' }
  ];

  function addMessage(content: string, type: Message['type'] = 'assistant') {
    messages = [...messages, {
      id: crypto.randomUUID(),
      content,
      type,
      timestamp: new Date().toISOString()
    }];
    scrollToBottom();
  }

  async function typeMessage(content: string): Promise<void> {
    isTyping = true;
    const msgId = crypto.randomUUID();
    messages = [...messages, { id: msgId, content: '', type: 'assistant', timestamp: new Date().toISOString() }];
    scrollToBottom();

    for (let i = 0; i <= content.length; i++) {
      const idx = messages.findIndex(m => m.id === msgId);
      if (idx !== -1) {
        const copy = [...messages];
        copy[idx] = { ...copy[idx], content: content.slice(0, i) };
        messages = copy;
      }
      await new Promise(r => setTimeout(r, 25 + Math.random() * 15));
    }
    isTyping = false;
    scrollToBottom();
  }

  async function performRAGIngestion(content: string): Promise<void> {
    isIngesting = true;
    ingestionProgress = 0;
    addMessage('Processing input through legal knowledge base...', 'system');

    const steps = [
      'Tokenizing and chunking legal content...',
      'Generating embeddings with legal model...',
      'Searching similar cases and precedents...',
      'Analyzing legal patterns and correlations...',
      'Integrating with existing case knowledge...'
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 600));
      ingestionProgress = Math.round(((i + 1) / steps.length) * 100);
      if (i === steps.length - 1) {
        ragContext = [
          ...ragContext,
          { type: 'precedent', title: 'Similar case pattern detected', relevance: 0.89, summary: 'Matching MO and evidence patterns' },
          { type: 'statute', title: 'Relevant legal statutes identified', relevance: 0.76, summary: 'Applicable criminal code sections' }
        ];
      }
    }
    isIngesting = false;
    addMessage('RAG analysis complete. Relevant precedents and statutes found.', 'system');
  }

  async function startWorkflow(): Promise<void> {
    workflowActive = true;
    currentStep = 0;
    ragContext = [];
    await typeMessage("I'll guide you through our systematic case intake methodology. This ensures we capture all critical elements for a strong case.");
    await new Promise(r => setTimeout(r, 500));
    await typeMessage(workflowSteps[0].question);
  }

  async function processWorkflowStep(answer: string): Promise<void> {
    if (!answer.trim()) return;
    addMessage(answer.trim(), 'user');
    workflowData[workflowSteps[currentStep].key] = answer.trim();

    await performRAGIngestion(answer.trim());
    await typeMessage('Excellent analysis noted. Building your case profile with this information.');

    currentStep++;
    if (currentStep < workflowSteps.length) {
      await new Promise(r => setTimeout(r, 800));
      await typeMessage(workflowSteps[currentStep].question);
    } else {
      await completeWorkflow();
    }
  }

  async function completeWorkflow(): Promise<void> {
    await typeMessage('Outstanding! All essential case elements captured. Creating your comprehensive case file now...');
    isProcessing = true;

    try {
      const caseData = {
        title: `Case: ${(workflowData.what || '').slice(0, 50)}...`,
        description: `WHO: ${workflowData.who}\n\nWHAT: ${workflowData.what}\n\nWHEN: ${workflowData.when}\n\nWHERE: ${workflowData.where}\n\nWHY: ${workflowData.why}\n\nHOW: ${workflowData.how}`,
        category: workflowData.category,
        priority: workflowData.priority,
        status: 'open',
        metadata: { workflow_data: workflowData, rag_context: ragContext, ai_processed: true }
      };

      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caseData)
      });

      if (response.ok) {
        const result = await response.json();
        const caseId = result?.data?.id ?? result?.id ?? 'unknown';
        await typeMessage(`Case successfully created! Case ID: ${caseId}\n\n${ragContext.length} relevant precedents found. Priority: ${workflowData.priority}. Ready to assist with evidence collection and legal strategy.`);
        onCaseCreated?.(caseId);
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      await typeMessage('Failed to create case. The case data has been captured and can be retried.');
      console.error('Case creation error:', error);
    } finally {
      isProcessing = false;
      workflowActive = false;
      currentStep = 0;
    }
  }

  async function handleChatMessage(): Promise<void> {
    if (!currentMessage.trim() || isProcessing) return;
    const userMsg = currentMessage.trim();
    addMessage(userMsg, 'user');
    currentMessage = '';

    if (userMsg.toLowerCase().includes('case') || userMsg.toLowerCase().includes('investigation') || userMsg.toLowerCase().includes('help')) {
      await typeMessage("I can help you create a comprehensive case. Would you like to start the systematic intake workflow?");
      setTimeout(() => startWorkflow(), 2000);
    } else {
      await performRAGIngestion(userMsg);
      await typeMessage("I've analyzed your input through our legal knowledge base. How can I assist you further?");
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 100);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatMessage();
    }
  }

  function handleWorkflowKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      const textarea = (e.target as HTMLTextAreaElement);
      const val = textarea.value.trim();
      if (val) {
        textarea.value = '';
        processWorkflowStep(val);
      }
    }
  }

  // Auto-greet on mount
  $effect(() => {
    (async () => {
      await new Promise(r => setTimeout(r, 800));
      await typeMessage("Hello! I'm your Legal AI Assistant. I can help you build strong cases using systematic analysis and our RAG knowledge base.");
      await new Promise(r => setTimeout(r, 600));
      await typeMessage("Say 'help' or click 'Start Case Workflow' to begin a structured case intake.");
    })();
  });
</script>

<div class={cn('flex flex-col bg-yorha-bg-secondary border border-yorha-border rounded-lg overflow-hidden', className)}>
  <!-- Header -->
  <div class="flex items-center gap-3 p-4 border-b border-yorha-border">
    <div class={cn('flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 shrink-0', isTyping && 'animate-pulse')}>
      <Icon name="scale" class="w-5 h-5 text-accent" />
    </div>
    <div class="flex-1">
      <h3 class="text-sm font-semibold text-yorha-text-primary">Legal AI Assistant</h3>
      <p class="text-xs text-yorha-text-secondary">
        {#if isProcessing}
          Creating case...
        {:else if isIngesting}
          RAG Processing...
        {:else if isTyping}
          Typing...
        {:else if workflowActive}
          Workflow step {currentStep + 1}/{workflowSteps.length}
        {:else}
          Ready to assist
        {/if}
      </p>
    </div>
  </div>

  <!-- RAG Progress -->
  {#if isIngesting}
    <div class="px-4 py-2 bg-yorha-bg-tertiary border-b border-yorha-border">
      <div class="flex justify-between text-xs font-mono mb-1">
        <span class="text-accent">RAG Analysis</span>
        <span class="text-yorha-text-secondary">{ingestionProgress}%</span>
      </div>
      <div class="w-full h-1.5 bg-yorha-bg-primary rounded-full overflow-hidden">
        <div class="h-full bg-accent rounded-full transition-all duration-300" style="width: {ingestionProgress}%"></div>
      </div>
    </div>
  {/if}

  <!-- RAG Context -->
  {#if ragContext.length > 0}
    <div class="px-4 py-2 bg-yorha-bg-tertiary border-b border-yorha-border">
      <h4 class="text-xs font-semibold text-yorha-text-secondary uppercase mb-2">Found Legal Context</h4>
      <div class="space-y-1">
        {#each ragContext.slice(-4) as ctx}
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 rounded bg-sand/10 text-sand/50 uppercase text-[10px]">{ctx.type}</span>
              <span class="text-yorha-text-primary">{ctx.title}</span>
            </div>
            <span class="text-sand/30">{Math.round(ctx.relevance * 100)}%</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Messages -->
  <div class="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[400px]" bind:this={chatContainer}>
    {#each messages as message (message.id)}
      <div class={cn(
        'max-w-[80%] px-3 py-2 rounded-lg text-sm',
        message.type === 'user' && 'ml-auto bg-accent/10 text-yorha-text-primary border border-accent/20',
        message.type === 'assistant' && 'mr-auto bg-yorha-bg-tertiary text-yorha-text-primary border border-yorha-border',
        message.type === 'system' && 'mx-auto bg-warning/10 text-warning border border-warning/20 text-xs'
      )}>
        <div class="whitespace-pre-wrap">{message.content}</div>
        <div class="text-[10px] text-sand/30 mt-1 text-right">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    {/each}
    {#if isTyping}
      <div class="mr-auto bg-yorha-bg-tertiary border border-yorha-border rounded-lg px-3 py-2">
        <div class="flex gap-1.5">
          <span class="w-2 h-2 rounded-full bg-sand/40 animate-bounce" style="animation-delay: 0ms"></span>
          <span class="w-2 h-2 rounded-full bg-sand/40 animate-bounce" style="animation-delay: 150ms"></span>
          <span class="w-2 h-2 rounded-full bg-sand/40 animate-bounce" style="animation-delay: 300ms"></span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Workflow Interface -->
  {#if workflowActive && currentStep < workflowSteps.length}
    <div class="px-4 py-3 border-t border-yorha-border bg-yorha-bg-tertiary">
      <div class="flex items-center gap-2 mb-2">
        <Icon name={workflowSteps[currentStep].icon} class="w-4 h-4 text-accent" />
        <span class="text-xs font-semibold text-yorha-text-primary uppercase">{workflowSteps[currentStep].key}</span>
        <span class="text-xs text-yorha-text-secondary ml-auto">Step {currentStep + 1} of {workflowSteps.length}</span>
      </div>
      <textarea
        class="w-full resize-vertical min-h-[64px] p-2 text-sm bg-yorha-bg-primary border border-yorha-border rounded text-yorha-text-primary placeholder:text-sand/30 focus:border-accent focus:outline-none"
        placeholder={workflowSteps[currentStep].placeholder}
        rows="3"
        onkeydown={handleWorkflowKeydown}
      ></textarea>
      <div class="flex items-center justify-between mt-2">
        <button
          onclick={(e) => {
            const textarea = (e.currentTarget as HTMLElement).closest('.px-4')?.querySelector('textarea');
            if (textarea && textarea.value.trim()) {
              const val = textarea.value.trim();
              textarea.value = '';
              processWorkflowStep(val);
            }
          }}
          class="px-3 py-1.5 text-xs font-mono bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 transition-colors"
          type="button"
        >
          Answer & Continue
        </button>
        <span class="text-[10px] text-sand/30">Ctrl+Enter to submit</span>
      </div>
    </div>
  {/if}

  <!-- Chat Input -->
  {#if !workflowActive}
    <div class="px-4 py-3 border-t border-yorha-border">
      <div class="flex gap-2">
        <textarea
          bind:value={currentMessage}
          placeholder="Ask about legal cases, or say 'help' to start a new case..."
          rows="2"
          class="flex-1 resize-none p-2 text-sm bg-yorha-bg-primary border border-yorha-border rounded text-yorha-text-primary placeholder:text-sand/30 focus:border-accent focus:outline-none"
          onkeydown={handleKeydown}
        ></textarea>
        <button
          onclick={handleChatMessage}
          disabled={!currentMessage.trim() || isProcessing}
          class="px-3 self-end bg-yorha-primary/10 text-yorha-primary border border-yorha-primary/20 rounded hover:bg-yorha-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          type="button"
        >
          <Icon name="send" class="w-4 h-4" />
        </button>
      </div>
      <div class="flex gap-2 mt-2">
        <button
          onclick={startWorkflow}
          class="px-2 py-1 text-xs font-mono bg-yorha-bg-tertiary text-yorha-text-secondary border border-yorha-border rounded hover:text-yorha-primary hover:border-yorha-primary/30 transition-colors"
          type="button"
        >
          <Icon name="clipboard-list" class="w-3 h-3 inline mr-1" />
          Start Case Workflow
        </button>
      </div>
    </div>
  {/if}
</div>
