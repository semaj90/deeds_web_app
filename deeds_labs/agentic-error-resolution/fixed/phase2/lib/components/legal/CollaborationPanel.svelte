<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!--
Collaboration Panel Component
Real-time collaboration interface for multiple investigators working on evidence custody
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import  Button  from "$lib/components/ui/enhanced-bits/Button.svelte";
  import  Card  from "$lib/components/ui/enhanced-bits/Card.svelte";
  import  CardHeader  from "$lib/components/ui/enhanced-bits/CardHeader.svelte";
  import  CardTitle  from "$lib/components/ui/enhanced-bits/CardTitle.svelte";
  import  CardContent  from "$lib/components/ui/enhanced-bits/CardContent.svelte";
  import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte";
  import type { Eye, MapPin, MessageCircle, Send, UserCheck, Users  } from 'lucide-svelte';
  // --- Type Definitions ---
  interface Position {
    x: number;
    y: number;
  }
  interface Annotation {
    userId: string;
    content: string;
    position: Position;
    timestamp: string;
  }
  interface ChatMessage {
    userId: string;
    message: string;
    timestamp: string;
  }
  interface Participant {
    userId: string;
    role: string;
    joinedAt: string;
  }
  interface CollaborationSession {
    sessionId: string;
    participants: Participant[];
    chatHistory: ChatMessage[];
    annotations: Annotation[];
  }
  // Props
  interface Props {
    collaborationSession?: CollaborationSession: null;
    activeCollaborators?: string[];
    userId?: string;
    evidenceId?: string;
    wsConnection?: WebSocket: null;
    onAddAnnotation?: (content: string, position Position) => void;
  }
  const {
    collaborationSession initialCollaborationSession = null,
    activeCollaborators = [],
    userId = '',
    evidenceId = '',
    wsConnection = null,
    onAddAnnotation = () => {}
  } = $props<Props>();
  // Local state for mutable prop
  let collaborationSession = $state(initialCollaborationSession);
  $effect(() => {
    collaborationSession = initialCollaborationSession;
  });
  // Local state (Svelte 5 runes)
  let newMessage = $state('');
  let newAnnotation = $state('');
  let showAnnotationInput = $state(false);
  let annotationPosition = $state<Position>({ x: 0, y: 0 });
  let chatContainer: HTMLDivElement;
  let isTyping = $state(false);
  let typingUsers = $state<string[]>([]);
  // Auto-scroll chat to bottom when new messages arrive
  $effect(() => {
    if (collaborationSession?.chatHistory && chatContainer) {
      // Defer to next microtask to ensure DOM updated
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 0);
    }
  });
  // WebSocket message wiring with cleanup
  $effect(() => {
    if (!wsConnection) return;
    const originalOnMessage = wsConnection.onmessage;
    wsConnection.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (e) {
        // preserve original behavior too
        originalOnMessage?.call(wsConnection, event);
      }
    };
    return () => {
      // restore original handler if present
      wsConnection.onmessage = originalOnMessage ?? null;
    };
  });
  function handleWebSocketMessage(data: any) {
    switch (data?.type) {
      case 'chat-message':
        if (collaborationSession) {
          collaborationSession = {
            ...collaborationSession,
            chatHistory: [...collaborationSession.chatHistory, data.message]
          };
        }
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
        if (collaborationSession) {
          collaborationSession = {
            ...collaborationSession,
            annotations: [...collaborationSession.annotations, data.annotation]
          };
        }
        break;
      default: break;
    }
  }
  function sendMessage() {
    if (!newMessage.trim() || !collaborationSession) return;
    const message: ChatMessage = {
      userId,
      message: newMessage.trim(),
      timestamp: new Date().toISOString()
    };
    if (wsConnection) {
      wsConnection.send(JSON.stringify({
        type: 'chat-message',
        sessionId: collaborationSession.sessionId,
        message
      }));
    }
    // Optimistically update local state
    collaborationSession = {
      ...collaborationSession,
      chatHistory: [...collaborationSession.chatHistory, message]
    };
    newMessage = '';
    isTyping = $state(false);
  }
  function handleTyping() {
    if (!wsConnection || !collaborationSession) return;
    if (!isTyping) {
      isTyping = true;
      wsConnection.send(JSON.stringify({
        type: 'user-typing',
        sessionId: collaborationSession.sessionId,
        userId
      }));
      // allow subsequent typing notifications after a short debounce
      setTimeout(() => (isTyping = false), 2000);
    }
  }
  function addAnnotation() {
    if (!newAnnotation.trim() || !collaborationSession) return;
    const annotation Annotation = {
      userId,
      content: newAnnotation.trim(),
      position annotationPosition,
      timestamp: new Date().toISOString()
    };
    if (wsConnection) {
      wsConnection.send(JSON.stringify({
        type: 'annotation-added',
        sessionId: collaborationSession.sessionId,
        annotation
      }));
    }
    collaborationSession = {
      ...collaborationSession,
      annotations: [...collaborationSession.annotations, annotation]
    };
    onAddAnnotation(newAnnotation.trim(), annotationPosition);
    newAnnotation = '';
    showAnnotationInput = $state(false);
  }
  function formatTimestamp(timestamp: string) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  }
  function getRoleColor(role: string) {
    switch (role) {
      case 'investigator': return 'bg-blue-100 text-blue-800';
      case 'supervisor': return 'bg-purple-100 text-purple-800';
      case 'analyst': return 'bg-green-100 text-green-800';
      case 'legal': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  function isCurrentUser(participantUserId: string) {
    return participantUserId === userId;
  }
  const handleKeydown = (e: KeyboardEvent) => {
    handleTyping();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
</script>
<div class="collaboration-panel space-y-4">
  {#if !collaborationSession}
    <Card>
      <CardContent class="p-6 text-center">
        <Users class="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p class="text-gray-600">No active collaboration session</p>
      </CardContent>
    </Card>
  {:else}
    <!-- Active Participants -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center text-sm">
          <Users class="w-4 h-4 mr-2" />
          Active Participants ({collaborationSession.participants.length})
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        {#each Array.isArray(collaborationSession.participants) ? collaborationSession.participants : [] as participant}
          <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                {participant.userId.slice(0,2).toUpperCase()}
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <span class="text-sm font-medium">
                    {isCurrentUser(participant.userId) ? 'You' : participant.userId}
                  </span>
                  {#if activeCollaborators.includes(participant.userId)}
                    <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse">{/if}
                </div>
                <div class="text-xs text-gray-500">
                  Joined {formatTimestamp(participant.joinedAt)}
                </div>
              </div>
            </div>
            <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">{participant.role}</span>
          </div>
        {/each}
      </CardContent>
    </Card>
    <!-- Real-time Chat -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center text-sm">
          <MessageCircle class="w-4 h-4 mr-2" />
          Team Chat
        </CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <!-- Chat messages -->
        <div bind:this={chatContainer} class="h-64 overflow-y-auto p-4 space-y-3 border-b">
          {#if collaborationSession.chatHistory.length === 0}
            <div class="text-center text-gray-500 py-8">
              <MessageCircle class="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p class="text-sm">No messages yet. Start the conversation!</p>
            </div>
          {:else}
            {#each Array.isArray(collaborationSession.chatHistory) ? collaborationSession.chatHistory : [] as message}
              <div class={`flex ${isCurrentUser(message.userId) ? 'justify-end' : 'justify-start'}`}>
                <div class={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
                  isCurrentUser(message.userId)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}>
                  {#if !isCurrentUser(message.userId)}
                    <div class="text-xs font-medium mb-1 opacity-75">
                      {message.userId}
                    {/if}
                  <div class="text-sm">{message.message}</div>
                  <div class={`text-xs mt-1 ${
                    isCurrentUser(message.userId) ? 'text-blue-200' : 'text-gray-500'
                  }`}>
                    {formatTimestamp(message.timestamp)}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
          <!-- Typing indicators -->
          {#if typingUsers.length > 0}
            <div class="flex justify-start">
              <div class="bg-gray-100 px-3 py-2 rounded-lg">
                <div class="flex items-center space-x-1">
                  <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span class="text-xs text-gray-500 ml-2">
                    {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              </div>
            {/if}
        </div>
        <!-- Message input -->
        <div class="p-4">
          <div class="flex space-x-2">
            <Textarea
              bind:value={newMessage}
              placeholder="Type your message..."
              class="flex-1 resize-none min-h-[40px] max-h-[120px]"
              // @ts-ignore - The Textarea component forwards keyboard events, but its types may be incomplete.
              onkeydown={handleKeydown}
            />
            <Button
              onclick={sendMessage}
              disabled={!newMessage.trim()}
              size="sm"
              class="self-end bits-btn bits-btn"
            >
              <Send class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    <!-- Annotations -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center justify-between text-sm">
          <div class="flex items-center">
            <MapPin class="w-4 h-4 mr-2" />
            Annotations ({collaborationSession.annotations.length})
          </div>
          <Button
            class="bits-btn"
            variant="ghost"
            size="sm"
            onclick={() => (showAnnotationInput = !showAnnotationInput)}
          >
            Add Note
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        {#if showAnnotationInput}
          <div class="border border-gray-200 rounded-lg p-3 bg-gray-50">
            <Textarea
              bind:value={newAnnotation}
              placeholder="Add an annotation or note..."
              class="mb-3"
            />
            <div class="flex space-x-2">
              <Button class="bits-btn" onclick={addAnnotation} size="sm" disabled={!newAnnotation.trim()}>
                Add Annotation
              </Button>
              <Button class="bits-btn" onclick={() => (showAnnotationInput = false)} variant="ghost" size="sm">
                Cancel
              </Button>
            </div>
          {/if}
        {#if collaborationSession.annotations.length === 0}
          <div class="text-center text-gray-500 py-4">
            <MapPin class="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p class="text-sm">No annotations yet</p>
          </div>
        {:else}
          <div class="max-h-48 overflow-y-auto space-y-2">
            {#each Array.isArray(collaborationSession.annotations) ? collaborationSession.annotations : [] as annotation}
              <div class="p-3 bg-gray-50 rounded border">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center space-x-2">
                    <div class="w-6 h-6 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                      {annotation.userId.slice(0,2).toUpperCase()}
                    </div>
                    <span class="text-sm font-medium">{annotation.userId}</span>
                  </div>
                  <span class="text-xs text-gray-500">
                    {formatTimestamp(annotation.timestamp)}
                  </span>
                </div>
                <p class="text-sm text-gray-700">{annotation.content}</p>
                {#if annotation.position}
                  <div class="mt-2 text-xs text-gray-500">
                    Position ({annotation.position.x}, {annotation.position.y})
                  {/if}
              </div>
            {/each}
          {/if}
      </CardContent>
    </Card>
    <!-- Session Info -->
    <Card>
      <CardContent class="p-4">
        <div class="flex items-center justify-between text-sm text-gray-600">
          <div class="flex items-center space-x-2">
            <Eye class="w-4 h-4" />
            <span>Session {collaborationSession.sessionId.slice(0, 8)}...</span>
          </div>
          <div class="flex items-center space-x-2">
            <UserCheck class="w-4 h-4" />
            <span>{activeCollaborators.length} active</span>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
<style>
  .collaboration-panel {
    max-height: 100vh;
    overflow-y: auto;
  }
  /* Typing indicator animation: */
  .typing-indicator {
    display: inline-flex;
    align-items: center;
    space: 1px;
  }
  .typing-indicator span {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: #9CA3AF;
    animation: typing 1.4s infinite;
    margin: 0 1px;
  }
  .typing-indicator span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .typing-indicator span:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes typing {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-8px);
      opacity: 1;
    }
  }
  /* Custom scrollbar for chat */
  .collaboration-panel::-webkit-scrollbar {
    width: 4px;
  }
  .collaboration-panel::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 2px;
  }
  .collaboration-panel::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 2px;
  }
  .collaboration-panel::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
</style>
