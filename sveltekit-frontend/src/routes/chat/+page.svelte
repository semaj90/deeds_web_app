<script lang="ts">
    import { ChatSession } from '$lib/models/ChatSession.svelte.js';

    const room = new ChatSession('case-101');
</script>

<svelte:head>
    <title>Chat | Legal AI</title>
</svelte:head>

<!-- Messages container with test selectors -->
<div class="chat-window" data-testid="chat-window" data-role="chat-messages">
    {#each room.messages as msg, i (i)}
        <div
            class="msg {msg.role}"
            data-testid="chat-message"
            data-role={msg.role}
            data-author={msg.role}
        >
            <strong>{msg.role}:</strong> {msg.content}

            {#if msg.metadata?.confidence !== undefined}
                <span class="confidence" data-testid="confidence">
                    Confidence: {(msg.metadata.confidence * 100).toFixed(0)}%
                </span>
            {/if}

            {#if msg.metadata?.citations?.length}
                <div class="citations" data-testid="citations">
                    <strong>Sources:</strong>
                    {#each msg.metadata.citations as citation}
                        <span class="citation">{citation}</span>
                    {/each}
                </div>
            {/if}

            {#if msg.metadata?.warnings?.length}
                <div class="warning" data-testid="warning">
                    ⚠️ {msg.metadata.warnings.join(', ')}
                </div>
            {/if}
        </div>
    {/each}

    {#if room.status === 'thinking'}
        <p class="loading" data-testid="loading" data-role="chat-streaming">
            AI is reviewing case context...
        </p>
    {/if}
</div>

<!-- Input form with test selectors -->
<form onsubmit={(e) => {
    e.preventDefault();
    const input = document.querySelector('input[name="message"]') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    room.addOptimistic(text);
    input.value = '';
    room.sendMessage();
}}>
    <input
        type="text"
        name="message"
        placeholder="Ask about the liability clause..."
        data-testid="chat-input"
        data-role="chat-input"
        disabled={room.status === 'thinking' || room.status === 'streaming'}
    />
    <button
        type="submit"
        data-testid="chat-send"
        data-role="chat-send"
        disabled={room.status === 'thinking' || room.status === 'streaming'}
    >
        {room.status === 'thinking' ? 'Thinking...' : room.status === 'streaming' ? 'Streaming...' : 'Send'}
    </button>
</form>

<style>
    .chat-window {
        border: 1px solid #ccc;
        padding: 1rem;
        height: 300px;
        overflow-y: auto;
        margin-bottom: 1rem;
    }
    .msg {
        margin-bottom: 0.5rem;
        padding: 0.5rem;
        border-radius: 4px;
    }
    .msg.user {
        background-color: #e0f7fa;
        text-align: right;
    }
    .msg.assistant {
        background-color: #f1f8e9;
        text-align: left;
    }
    .loading {
        font-style: italic;
        color: #666;
    }
    .confidence {
        display: block;
        font-size: 0.8em;
        color: #666;
        margin-top: 5px;
    }
    .citations {
        font-size: 0.85em;
        margin-top: 8px;
        padding: 5px;
        background: #f5f5f5;
        border-radius: 4px;
    }
    .citation {
        display: inline-block;
        margin: 2px 5px;
        padding: 2px 6px;
        background: #e0e0e0;
        border-radius: 3px;
    }
    .warning {
        margin-top: 8px;
        padding: 8px;
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 4px;
        color: #856404;
    }
</style>