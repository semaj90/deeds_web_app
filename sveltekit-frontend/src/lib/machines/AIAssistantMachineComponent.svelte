<script lang="ts">
    import { onMount } from 'svelte';
    import { useActor } from '@xstate/svelte';
    import { aiAssistantMachine } from '$lib/machines/aiAssistantMachine';
    import { fade, slide } from 'svelte/transition';
    import { Button } from '$lib/components/ui/enhanced-bits';

    const { snapshot, send } = useActor(aiAssistantMachine);

    let messageInput = $state('');

    function handleSend() {
        if (!messageInput.trim()) return;
        send({ type: 'SEND_MESSAGE', message: messageInput });
        messageInput = '';
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    function clearChat() {
        send({ type: 'CLEAR_CONVERSATION' });
    }

    $inspect($snapshot.context).content('AI Context Update');
</script>

<div class="ai-assistant-container font-mono">
    <!-- Header -->
    <div class="yorha-header mb-4 p-2 bg-black text-white flex justify-between items-center bg-opacity-80">
        <h2 class="text-xl tracking-widest uppercase">AI_ASSISTANT_V2</h2>
        <div class="status-indicators flex gap-4 text-xs">
            <span class={$snapshot.context.gpuReady ? 'text-green-400' : 'text-gray-500'}>
                [GPU: {$snapshot.context.gpuReady ? 'ACTIVE' : 'OFFLINE'}]
            </span>
            <span class="text-blue-400">
                [MODEL: {$snapshot.context.model}]
            </span>
        </div>
    </div>

    <!-- Chat History -->
    <div class="chat-history h-[500px] overflow-y-auto mb-4 border-2 border-black p-4 bg-gray-100 bg-opacity-90 scroll-smooth">
        {#if $snapshot.context.conversationHistory.length === 0}
            <div class="empty-state text-center py-20 text-gray-400" in:fade>
                <div class="text-4xl mb-4 opacity-20">--- NO_DATA ---</div>
                <p>System ready. Waiting for user input.</p>
            </div>
        {:else}
            {#each $snapshot.context.conversationHistory as entry (entry.id)}
                <div class="message-entry mb-6" in:slide={{ duration: 300 }}>
                    <div class="entry-meta flex justify-between text-[10px] uppercase mb-1 border-b border-gray-300">
                        <span class={entry.type === 'user' ? 'text-blue-600' : 'text-green-600'}>
                            [{entry.type}]
                        </span>
                        <span class="text-gray-400">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                    <div class="entry-content text-sm leading-relaxed whitespace-pre-wrap">
                        {entry.content}
                    </div>
                </div>
            {/each}
        {/if}

        {#if $snapshot.matches('processing')}
            <div class="status-indicator text-xs text-blue-600 animate-pulse mt-4">
                [ANALYZING_DATA...]
            </div>
        {/if}

        {#if $snapshot.context.error}
            <div class="error-box mt-4 p-2 bg-red-100 border border-red-500 text-red-700 text-xs">
                [ERROR: {$snapshot.context.error}]
            </div>
        {/if}
    </div>

    <!-- Input Area -->
    <div class="input-area flex gap-2">
        <textarea
            bind:value={messageInput}
            onkeydown={handleKeydown}
            disabled={$snapshot.matches('processing')}
            placeholder="ENTER COMMAND OR QUERY..."
            class="flex-1 p-2 border-2 border-black bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-[80px]"
        ></textarea>

        <div class="controls flex flex-col gap-2">
            <Button
                onclick={handleSend}
                disabled={!messageInput.trim() || $snapshot.matches('processing')}
                class="h-1/2 px-6"
            >
                SEND
            </Button>
            <Button
                onclick={clearChat}
                variant="outline"
                class="h-1/2 px-6"
            >
                CLEAR
            </Button>
        </div>
    </div>
</div>

<style>
    .ai-assistant-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 1rem;
    }

    .chat-history::-webkit-scrollbar {
        width: 8px;
    }

    .chat-history::-webkit-scrollbar-track {
        background: #f1f1f1;
    }

    .chat-history::-webkit-scrollbar-thumb {
        background: #000;
        border-radius: 0;
    }
</style>


