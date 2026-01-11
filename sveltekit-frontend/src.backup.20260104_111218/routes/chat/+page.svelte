<script lang="ts">
    import { enhance } from '$app/forms';
    import { ChatSession } from '$lib/stores';

    // 1. Reactive Chat State Logic
    // Using the Barrel Store Pattern
    const room = new ChatSession('case-101');
</script>

<div class="chat-window">
    {#each room.messages as msg}
        <div class="msg {msg.role}">
            <strong>{msg.role}:</strong> {msg.content}
        </div>
    {/each}

    {#if room.status === 'thinking'}
        <p class="loading">AI is reviewing case context...</p>
    {/if}
</div>

<form method="POST" action="?/send" use:enhance={() => {
    // Optimistic Update before server response
    const input = document.querySelector('input[name="message"]') as HTMLInputElement;
    if (input.value) {
        room.addOptimistic(input.value);
        input.value = '';
    }

    return async ({ update }) => { await update({ reset: false }); };
}}>
    <input type="hidden" name="chatId" value={room.chatId} />
    <input type="text" name="message" placeholder="Ask about the liability clause..." />
    <button>Send</button>
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
</style>
