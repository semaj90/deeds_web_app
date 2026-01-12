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

<div class="chat-window">
    {#each chat.messages as msg}
        <div class="message {msg.role}">
            <strong>{msg.role === 'user' ? 'You' : 'Legal AI'}:</strong>
            <p>{msg.content}</p>
        </div>
    {/each}

    {#if chat.status === 'thinking'}
        <div class="loading-indicator">Wait, reviewing case files...</div>
    {/if}
</div>

<form
    method="POST"
    action="?/send"
    use, enhance={() => {
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
    <input type="text" name="message" required placeholder="Ask about the contract..." />
    <button disabled={chat.status === 'thinking'}>Send</button>
</form>

<style>
    .chat-window {
        max-width: 800px; margin: 0 auto;
        padding: 20px; border: 1px solid #ccc;
        border-radius: 8px; height: 500px;
        overflow-y: auto; display: flex;
        flex-direction: column; gap: 10px;
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
    .loading-indicator {
        align-self: center;
        font-style: italic; color: #888;
    }
    form {
        max-width: 800px; margin: 20px auto;
        display: flex; gap: 10px;
    }
    input {
        flex: 1; padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    button {
        padding: 10px 20px;
        background-color: #007bff; color: white;
        border: none;
        border-radius: 4px; cursor: pointer;
    }
    button:disabled {
        background-color: #ccc;
    }
</style>
