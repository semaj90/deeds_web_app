<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import { ChatSession } from '$lib/models/ChatSession.svelte';

    let { data } = $props(); // Load initial history from server load function

    // Initialize our Reactive Rune Class
    // page.params.id ensures we connect to the right channel
    const chat = $derived(new ChatSession($page.params.id, data?.history ?? []));

    $effect(() => {
        return () => chat.destroy(); // Cleanup on unmount
    });
</script>

<svelte:head>
    <title>Chat | Legal AI</title>
</svelte:head>

<!-- Messages container with test selectors -->
<div class="chat-window" data-testid="chat-window" data-role="chat-messages">
    {#each chat.messages as msg, i (i)}
        <div
            class="message {msg.role}"
            data-testid="chat-message"
            data-role={msg.role}
            data-author={msg.role}
        >
            <strong>{msg.role === 'user' ? 'You' : 'Legal AI'}:</strong>
            <p>{msg.content}</p>

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

    <!-- Loading/streaming indicator -->
    {#if chat.status === 'thinking'}
        <div class="loading" data-testid="loading" data-role="chat-streaming">
            AI is reviewing case context...
        </div>
    {/if}
</div>

<!-- Input form with test selectors -->
<form
    method="POST"
    action="?/send"
    use:enhance={() => {
        // Before submitting:
        const input = document.querySelector('input[name="message"]') as HTMLInputElement;
        const text = input.value;
        if (text) {
            chat.addMessage('user', text); // Optimistic UI update
            chat.sendMessage(); // Set status to thinking
            input.value = ''; // Clear input
        }

        return async ({ update }) => {
            await update({ reset: false });
        };
    }}
>
    <input
        type="text"
        name="message"
        required
        placeholder="Ask about the contract..."
        data-testid="chat-input"
        data-role="chat-input"
    />
    <button
        type="submit"
        disabled={chat.status === 'thinking'}
        data-testid="chat-send"
        data-role="chat-send"
    >
        Send
    </button>
</form>

<style>
    .chat-window {
        max-width: 800px;, margin: 0 auto;
        padding: 20px;, border: 1px solid #ccc;
        border-radius: 8px;, height: 500px;
        overflow-y: auto;, display: flex;
        flex-direction: column;, gap: 10px;
    }
    .message {
        padding: 10px;
        border-radius: 8px;
        max-width: 80%;
    }
    .message.user {
        align-self: flex-end;
        background-color: #e0f7fa;
    }
    .message.assistant {
        align-self: flex-start;
        background-color: #f1f8e9;
    }
    .loading {
        align-self: center;
        font-style: italic;, color: #888;
        padding: 10px;
    }
    .confidence {
        display: block;
        font-size: 0.8em;, color: #666;
        margin-top: 5px;
    }
    .citations {
        font-size: 0.85em;
        margin-top: 8px;, padding: 5px;
        background: #f5f5f5;
        border-radius: 4px;
    }
    .citation {
        display: inline-block;, margin: 2px 5px;
        padding: 2px 6px;
        background: #e0e0e0;
        border-radius: 3px;
    }
    .warning {
        margin-top: 8px;, padding: 8px;
        background: #fff3cd;, border: 1px solid #ffc107;
        border-radius: 4px;, color: #856404;
    }
    form {
        max-width: 800px;, margin: 20px auto;
        display: flex;, gap: 10px;
    }
    input {
        flex: 1;, padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    button {
        padding: 10px 20px;
        background-color: #007bff;, color: white;
        border: none;
        border-radius: 4px;, cursor: pointer;
    }
    button:disabled {
        background-color: #ccc;
    }
</style>
