<!--
Collaboration Panel Component
Real-time collaboration interface for multiple investigators working on evidence custody
-->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';

  interface Position { x: number; y: number }
  interface Annotation { userId: string; content: string; position: Position; timestamp: string }
  interface ChatMessage { userId: string; message: string; timestamp: string }
  interface Participant { userId: string; role: string; joinedAt: string }
  interface CollaborationSession {
    sessionId: string;
    participants: Participant[];
    chatHistory: ChatMessage[];
    annotations: Annotation[];
  }

  interface Props {
    collaborationSession?: CollaborationSession | null;
    activeCollaborators?: string[];
    userId?: string;
    evidenceId?: string;
    wsConnection?: WebSocket | null;
    onAddAnnotation?: (content: string, position: Position) => void;
  }

  let {
    collaborationSession: initialCollaborationSession = null,
    activeCollaborators = [],
    userId = '',
    evidenceId = '',
    wsConnection = null,
    onAddAnnotation = () => {}
  }: Props = $props();

  let session = $state<CollaborationSession | null>(initialCollaborationSession);
  $effect(() => { session = initialCollaborationSession; });

  let newMessage = $state('');
  let newAnnotation = $state('');
  let showAnnotationInput = $state(false);
  let annotationPosition = $state<Position>({ x: 0, y: 0 });
  let chatContainer: HTMLDivElement | undefined = $state(undefined);
  let isTyping = $state(false);
  let typingUsers = $state<string[]>([]);

  $effect(() => {
    if (session?.chatHistory && chatContainer) {
      setTimeout(() => {
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 0);
    }
  });

  $effect(() => {
    if (!wsConnection) return;
    const originalOnMessage = wsConnection.onmessage;
    wsConnection.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch {
        originalOnMessage?.call(wsConnection, event);
      }
    };
    return () => {
      wsConnection.onmessage = originalOnMessage ?? null;
    };
  });

  function handleWebSocketMessage(data: any) {
    if (!session) return;
    switch (data?.type) {
      case 'chat-message':
        session = { ...session, chatHistory: [...session.chatHistory, data.message] };
        break;
      case 'user-typing':
        if (data.userId !== userId) {
          typingUsers = [...typingUsers.filter(u => u !== data.userId), data.userId];
          setTimeout(() => {
            typingUsers = typingUsers.filter(u => u !== data.userId);
          }, 3000);
        }
        break;
      case 'annotation-added':
        session = { ...session, annotations: [...session.annotations, data.annotation] };
        break;
    }
  }

  function sendMessage() {
    if (!newMessage.trim() || !session) return;
    const message: ChatMessage = {
      userId,
      message: newMessage.trim(),
      timestamp: new Date().toISOString()
    };
    if (wsConnection) {
      wsConnection.send(JSON.stringify({ type: 'chat-message', sessionId: session.sessionId, message }));
    }
    session = { ...session, chatHistory: [...session.chatHistory, message] };
    newMessage = '';
    isTyping = false;
  }

  function handleTyping() {
    if (!wsConnection || !session) return;
    if (!isTyping) {
      isTyping = true;
      wsConnection.send(JSON.stringify({ type: 'user-typing', sessionId: session.sessionId, userId }));
      setTimeout(() => (isTyping = false), 2000);
    }
  }

  function addAnnotation() {
    if (!newAnnotation.trim() || !session) return;
    const annotation: Annotation = {
      userId,
      content: newAnnotation.trim(),
      position: annotationPosition,
      timestamp: new Date().toISOString()
    };
    if (wsConnection) {
      wsConnection.send(JSON.stringify({ type: 'annotation-added', sessionId: session.sessionId, annotation }));
    }
    session = { ...session, annotations: [...session.annotations, annotation] };
    onAddAnnotation(newAnnotation.trim(), annotationPosition);
    newAnnotation = '';
    showAnnotationInput = false;
  }

  function formatTimestamp(timestamp: string) {
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  }

  function isCurrentUser(participantUserId: string) {
    return participantUserId === userId;
  }

  function handleKeydown(e: KeyboardEvent) {
    handleTyping();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="collaboration-panel">
  {#if !session}
    <Card class="bg-panel border-sand/20">
      <CardContent class="p-6 text-center">
        <p class="text-sand/60 text-2xl mb-4">👥</p>
        <p class="text-sand/60">No active collaboration session</p>
      </CardContent>
    </Card>
  {:else}
    <!-- Active Participants -->
    <Card class="bg-panel border-sand/20 mb-4">
      <CardHeader>
        <CardTitle class="text-sm font-bold text-sand">
          Active Participants ({session.participants.length})
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        {#each session.participants as participant}
          <div class="flex items-center justify-between p-2 bg-sand/5 rounded">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 bg-info rounded-full flex items-center justify-center text-white text-xs font-bold">
                {participant.userId.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div class="flex items-center gap-1">
                  <span class="text-sm text-sand">
                    {isCurrentUser(participant.userId) ? 'You' : participant.userId}
                  </span>
                  {#if activeCollaborators.includes(participant.userId)}
                    <div class="w-2 h-2 bg-accent rounded-full"></div>
                  {/if}
                </div>
                <div class="text-xs text-sand/50">Joined {formatTimestamp(participant.joinedAt)}</div>
              </div>
            </div>
            <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10 text-sand/70">{participant.role}</span>
          </div>
        {/each}
      </CardContent>
    </Card>

    <!-- Real-time Chat -->
    <Card class="bg-panel border-sand/20 mb-4">
      <CardHeader>
        <CardTitle class="text-sm font-bold text-sand">Team Chat</CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <div bind:this={chatContainer} class="h-64 overflow-y-auto p-4 space-y-3">
          {#if session.chatHistory.length === 0}
            <div class="text-center text-sand/60 py-8">
              <p class="text-sm">No messages yet. Start the conversation!</p>
            </div>
          {:else}
            {#each session.chatHistory as message}
              <div class="flex {isCurrentUser(message.userId) ? 'justify-end' : 'justify-start'}">
                <div class="max-w-xs px-3 py-2 rounded-lg {isCurrentUser(message.userId) ? 'bg-info text-white' : 'bg-sand/10 text-sand'}">
                  {#if !isCurrentUser(message.userId)}
                    <div class="text-xs font-medium mb-1">{message.userId}</div>
                  {/if}
                  <div class="text-sm">{message.message}</div>
                  <div class="text-xs mt-1 {isCurrentUser(message.userId) ? 'text-white/60' : 'text-sand/50'}">
                    {formatTimestamp(message.timestamp)}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
          {#if typingUsers.length > 0}
            <div class="flex">
              <div class="bg-sand/10 px-3 py-2 rounded-lg">
                <span class="text-xs text-sand/60">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              </div>
            </div>
          {/if}
        </div>
        <div class="p-4 border-t border-sand/10">
          <div class="flex gap-2">
            <textarea
              bind:value={newMessage}
              placeholder="Type your message..."
              class="flex-1 resize-none min-h-[40px] max-h-[120px] px-3 py-2 bg-black/20 border border-sand/20 rounded text-sand text-sm placeholder:text-sand/40 focus:border-accent focus:outline-none"
              onkeydown={handleKeydown}
            ></textarea>
            <Button onclick={sendMessage} disabled={!newMessage.trim()}>Send</Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Annotations -->
    <Card class="bg-panel border-sand/20 mb-4">
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle class="text-sm font-bold text-sand">
            Annotations ({session.annotations.length})
          </CardTitle>
          <Button onclick={() => (showAnnotationInput = !showAnnotationInput)}>
            {showAnnotationInput ? 'Cancel' : 'Add Note'}
          </Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        {#if showAnnotationInput}
          <div class="border border-sand/20 rounded-lg p-3">
            <textarea
              bind:value={newAnnotation}
              placeholder="Add an annotation or note..."
              class="w-full mb-3 px-3 py-2 bg-black/20 border border-sand/20 rounded text-sand text-sm placeholder:text-sand/40 focus:border-accent focus:outline-none resize-none min-h-[60px]"
            ></textarea>
            <Button onclick={addAnnotation} disabled={!newAnnotation.trim()}>Add Annotation</Button>
          </div>
        {/if}
        {#if session.annotations.length === 0}
          <div class="text-center text-sand/60 py-4">
            <p class="text-sm">No annotations yet</p>
          </div>
        {:else}
          <div class="max-h-48 overflow-y-auto space-y-2">
            {#each session.annotations as annotation}
              <div class="p-3 bg-sand/5 rounded">
                <div class="flex items-start justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 bg-accent rounded-full flex items-center justify-center text-white text-xs">
                      {annotation.userId.slice(0, 2).toUpperCase()}
                    </div>
                    <span class="text-sm text-sand">{annotation.userId}</span>
                  </div>
                  <span class="text-xs text-sand/50">{formatTimestamp(annotation.timestamp)}</span>
                </div>
                <p class="text-sm text-sand/80">{annotation.content}</p>
              </div>
            {/each}
          </div>
        {/if}
      </CardContent>
    </Card>

    <!-- Session Info -->
    <Card class="bg-panel border-sand/20">
      <CardContent class="p-4">
        <div class="flex items-center justify-between text-sm text-sand/60">
          <span>Session {session.sessionId.slice(0, 8)}...</span>
          <span>{activeCollaborators.length} active</span>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
