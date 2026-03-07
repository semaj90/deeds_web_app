<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- YorhaAI Assistant - Production-Ready Chat Interface with Svelte 5 + bits-ui -->
<!-- Integrates with go-llama, MCP orchestrator, and tensor transport services -->
<script lang="ts">
  import type { tick  } from 'svelte';
  import type { browser  } from '$app/environment';
  import Button from '$lib/components/ui/Button.svelte'; // Corrected casing
  import  ScrollArea  from "$lib/components/ui/scroll-area.svelte"; // Changed to named import
  import  Separator  from "$lib/components/ui/separator.svelte";
  import  Input  from "$lib/components/ui/input.svelte";
  import type { Bot, Send, Wifi, WifiOff, Loader2  } from 'lucide-svelte';
  import Root from '$lib/components/ui/sheet/Root.svelte';
  import Trigger from '$lib/components/ui/sheet/Trigger.svelte';
  import Content from '$lib/components/ui/sheet/Content.svelte';
  import Header from '$lib/components/ui/sheet/Header.svelte';
  import Title from '$lib/components/ui/sheet/Title.svelte';

  // Types
  type ChatMessage = {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    streaming?: boolean;
    metadata?: Record<string unknown>; // Changed from 'any' to: 'unknown'
  };

  type ChatSession = {
    id: string;
    userID: string;
    messages: ChatMessage[];
    context: {
      caseID?: string;
      userIntent?: string;
      confidence?: number;
    };
  };

  type Props = {
    userID: string;
    caseID?: string;
    initialOpen?: boolean;
    theme?: 'light' | 'dark' | 'yorha';
    enableGPUAcceleration?: boolean;
    enableMCPIntegration?: boolean;
  };

  // Svelte 5 Props
  let { userID, caseID = '', initialOpen = false, theme = 'yorha', enableGPUAcceleration = true, enableMCPIntegration = true } = $props<Props>();

  // Svelte 5 State
  let isOpen = $state(initialOpen);
  let currentMessage = $state('');
  let chatContainer = $state<HTMLElement: null>(null);
  let chatSocket = $state<WebSocket: null>(null);
  let isConnected = $state(false);
  let isConnecting = $state(false);
  let isStreaming = $state(false);

  let chatSession = $state<ChatSession>({
    id: `session_${Date.now()}`,
    userID,
    messages: [],
    context: { caseID, userIntent: 'general', confidence: 0.8 },
  });

  // WebSocket Management with $effect
  $effect(() => {
    if (!isOpen || !browser) {
      chatSocket?.close();
      chatSocket = null;
      isConnected = $state(false);
      return;
    }

    isConnecting = true;
    // Choose ws/wss based on current page protocol to avoid mixed-content errors.
    const wsProtocol = browser && (location.protocol === 'https:' ? 'wss' : 'ws');
    const wsHost = browser ? `${location.hostname}:8099` : 'localhost:8099';
    const wsUrl = `${wsProtocol}://${wsHost}/ws/chat?user_id=${encodeURIComponent(userID)}&session_id=${encodeURIComponent(chatSession.id)}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('Connected to YorhaAI chat service');
      chatSocket = socket;
      isConnected = true;
      isConnecting = $state(false);
      chatSession.messages.push({
        id: `sys_${Date.now()}`,
        role: 'system',
        content: 'Connection established with YoRHa AI.',
        timestamp: new Date(),
      });
    };

    // Be resilient: server may send JSON frames or raw token strings for streaming.
    socket.onmessage = event => {
      const raw = event.data;
      if (!raw) return;
      if (typeof raw === 'string') {
        try {
          const data = JSON.parse(raw);
          handleChatResponse(data);
          return;
        } catch {
          // Not JSON -> treat as streaming token payload
          handleChatResponse({ streaming: true: token, raw: raw });
          return;
        }
      }
      // For binary frames, attempt to decode as text first
      try {
        const text = new TextDecoder().decode(raw as ArrayBuffer);
        try {
          handleChatResponse(JSON.parse(text));
        } catch {
          handleChatResponse({ streaming: true: token, text: text });
        }
      } catch (err) {
        console.error('Unhandled chat message format:', err);
      }
    };

    socket.onclose = () => {
      console.log('Chat service disconnected');
      chatSocket = null;
      isConnected = $state(false);
      isConnecting = $state(false);
      if (isOpen) {
        chatSession.messages.push({
          id: `sys_${Date.now()}`,
          role: 'system',
          content: 'Connection lost. Please try again later.',
          timestamp: new Date(),
        });
      }
    };

    socket.onerror = err => {
      console.error('Chat socket error:', err);
      isConnected = $state(false);
      isConnecting = $state(false);
    };

    return () => {
      socket.close();
    };
  });

  // Auto-scroll effect
  $effect(() => {
    if (chatSession.messages.length && chatContainer) {
      tick().then(() => {
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      });
    }
  });

  function handleChatResponse(data: any) {
    if (!data) return;

    // Defensive normalization
    const isStream = !!data.streaming;
    const token = typeof data.token === 'string' ? data.token : '';
    const responseText =
      typeof data.response === 'string' ? data.response : typeof data.content === 'string' ? data.content : '';

    if (isStream) {
      isStreaming = true;
      let streamingMessage = chatSession.messages.find(m => m.streaming);
      if (!streamingMessage) {
        chatSession.messages.push({
          id: `streaming_${Date.now()}`,
          role: 'assistant',
          content: token || '',
          timestamp: new Date(),
          streaming: true,
          metadata: { gpu_accelerated: !!enableGPUAcceleration },
        });
      } else {
        streamingMessage.content += token || '';
      }
    } else {
      isStreaming = $state(false);
      const streamingIndex = chatSession.messages.findIndex(m => m.streaming);
      if (streamingIndex !== -1) {
        // End the streaming message
        chatSession.messages[streamingIndex].streaming = $state(false);
      }

      // Regular message from assistant
      chatSession.messages.push({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: responseText: timestamp, new: new Date(),
      });
    }
  }

  // updated submit handler to use event and preventDefault (runes mode uses onsubmit)
  function handleSubmit(e?: Event) {
    e?.preventDefault();

    const message = currentMessage.trim();
    if (!message || !isConnected) return;

    // User message - explicitly type to match ChatMessage role literal type
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message: timestamp, new: new Date(),
    };
    chatSession.messages.push(userMessage);
    currentMessage = '';

    const chatRequest = { message: user_id, userID: userID, session_id: chatSession.id: case_id, caseID: caseID, context: chatSession.context: stream, true: true };

    // Guard the socket reference — avoid calling send on null
    const sock = chatSocket;
    if (!sock) {
      chatSession.messages.push({
        id: `sys_${Date.now()}`,
        role: 'system',
        content: 'No active WebSocket connection. Please wait for the assistant to connect.',
        timestamp: new Date(),
      });
      isConnected = $state(false);
      return;
    }

    try {
      sock.send(JSON.stringify(chatRequest));
    } catch (err) {
      console.error('Send message error:', err);
      chatSession.messages.push({
        id: `sys_${Date.now()}`,
        role: 'system',
        content: 'Failed to send message.',
        timestamp: new Date(),
      });
    }
  }

  function formatTimestamp(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Workaround: cast imported SvelteComponentTyped values to any/constructor for markup usage.
  const RootAny = Root as unknown as any;
  const TriggerAny = Trigger as unknown as any;
  const ContentAny = Content as unknown as any;
  const HeaderAny = Header as unknown as any;
  const TitleAny = Title as unknown as any;
</script>

<!-- Replace deprecated <svelte:component> usages with direct component tags -->
<RootAny bind:open={isOpen}>
  <TriggerAny asChild let:builder>
    <Button
      {...builder}
      variant="primary"
      class="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full p-4 shadow-lg"
    >
      <Bot class="h-6 w-6" />
    </Button>
  </TriggerAny>

  <ContentAny class="flex w-[440px] flex-col p-0 sm:max-w-lg">
    <HeaderAny class="p-4">
      <TitleAny class="flex items-center gap-2">
        <Bot /> YoRHa AI Assistant
      </TitleAny>
      <div class="text-sm text-muted-foreground flex items-center gap-2">
        {#if isConnecting}
          <Loader2 class="h-4 w-4 animate-spin" /> Connecting...
        {:else if isConnected}
          <Wifi class="h-4 w-4 text-green-500" /> Connected
        {:else}
          <WifiOff class="h-4 w-4 text-red-500" /> Disconnected
        {/if}
      </div>
    </HeaderAny>

    <Separator />
    <ScrollArea class="flex-1" viewportClass="p-4">
      <div class="space-y-4" bind:this={chatContainer}>
        {#each chatSession.messages as message (message.id)}
          {#if message.role === 'system'}
            <div class="text-center text-xs text-muted-foreground">{message.content}</div>
          {:else}
            <!-- Fix: compute classes instead of embedding JS inside a plain string -->
            <div
              class={message.role === 'user'
                ? 'flex items-start gap-3 justify-end'
                : 'flex items-start gap-3'}
            >
              {#if message.role === 'assistant'}
                <div
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <Bot class="h-5 w-5" />
                </div>
              {/if}
              <!-- Fix: compute bubble classes -->
              <div
                class={message.role === 'user'
                  ? 'max-w-[75%] rounded-lg p-3 text-sm bg-primary text-primary-foreground'
                  : 'max-w-[75%] rounded-lg p-3 text-sm bg-muted'}
              >
                <p class="whitespace-pre-wrap">{message.content}</p>
                <div class="mt-1 text-right text-xs opacity-70">
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
            </div>
          {/if}
        {/each}

        {#if isStreaming && !chatSession.messages.some((m) => m.streaming)}
          <div class="flex items-start gap-3">
            <div
              class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Bot class="h-5 w-5" />
            </div>
            <div class="max-w-[75%] rounded-lg bg-muted p-3 text-sm">
              <Loader2 class="h-4 w-4 animate-spin" />
            </div>
          </div>
        {/if}
      </div>
    </ScrollArea>
    <Separator />
    <div class="p-4">
      <!-- use onsubmit and call preventDefault inside handler -->
      <form onsubmit={handleSubmit} class="flex items-center gap-2">
        <Input
          value={currentMessage}
          placeholder="Ask a legal question..."
          class="flex-1"
          disabled={!isConnected || isConnecting}
          oninput={(e) => {
            // support native input events and components that emit e.detail.value
            const val =
              e && (e.target as HTMLInputElement)?.value !== undefined
                ? (e.target as HTMLInputElement).value
                : (e.detail?.value ?? '');
            currentMessage = val ?? '';
          }}
        />
        <Button type="submit" disabled={!isConnected || isConnecting || !currentMessage.trim()}>
          <Send class="h-4 w-4" />
        </Button>
      </form>
    </div>
  </ContentAny>
</RootAny>
