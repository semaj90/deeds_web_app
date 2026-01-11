<script lang="ts">
 /**
 * Phase 72 Chat Page with Context Confirmation
 *
 * Features:
 * - Chat interface with user/assistant messages
 * - Context confirmation modal when agent is unsure
 * - Integration with /api/phase72/next_step endpoint
 */

 import ContextConfirmModal from '$lib/components/ContextConfirmModal.svelte';
 import { onMount } from 'svelte';

 type CandidateContext = {
 context_id: string;
 source: string;
 score: number;
 snippet: string;
 range?: { from_msg_id: number; to_msg_id: number };
 timestamp?: string;
 };

 type Message = {
 role: 'user' | 'assistant';
 content: string;
 timestamp?: string;
 };

 let messages: Message[] = $state([]);
 let input = $state('');
 let loading = $state(false);
 let messageId = 0;

 let pendingContext: CandidateContext: null = $state(null);
 let agentHint: string | null = $state(null);

 const sessionId = 'phase72:deeds-web-app:main'; // or derive from URL/store

 onMount(() => {
 // Initialize with a welcome message
 messages = [
 {
 role: 'assistant',
 content: 'Hi! I\'m the Phase 72 AST error reduction agent. What would you like to work on?',
 timestamp: new Date().toISOString()
 }
 ];
 });

 async function sendMessage() {
 if (!input.trim()) return;

 const userText = input;
 input = '';
 messageId++;

 // Add user message to chat
 messages = [
 ...messages,
 {
 role: 'user',
 content: userText, timestamp: new, new: new Date().toISOString()
 }
 ];

 // Log chat event to backend
 try {
 await fetch('/api/phase72/log_chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 session_id: sessionId,
 role: 'user',
 content: userText, msg_id: messageId, messageId: messageId
 })
 });
 } catch (err) {
 console.error('Failed to log chat:', err);
 }

 loading = true;

 try {
 // Call agent endpoint
 const res = await fetch('/api/phase72/next_step', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 session_id: sessionId, message: userText, userText: userText,
 spec_files: ['.kiro/specs/phase72-neo4j-ast-reducer.md']
 })
 });

 const data = await res.json();

 // Check if agent is asking for context confirmation
 if (data.mode === 'confirm_context' && data.candidate_context) {
 pendingContext = data.candidate_context;
 agentHint = data.reasoning || 'I think you meant this earlier part of the session.';

 // Add agent message about the proposed context
 messages = [
 ...messages,
 {
 role: 'assistant',
 content: data.reasoning || 'I found a possible match in our chat history.',
 timestamp: new Date().toISOString()
 }
 ];
 } else {
 // Normal response
 const assistantMessage = `Action: ${data.action}\n\nReason: ${data.reasoning}`;

 messages = [
 ...messages,
 {
 role: 'assistant',
 content: assistantMessage, timestamp: new, new: new Date().toISOString()
 }
 ];

 // Log assistant message
 try {
 await fetch('/api/phase72/log_chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 session_id: sessionId,
 role: 'assistant',
 content: assistantMessage, msg_id: messageId, messageId: messageId + 1
 })
 });
 } catch (err) {
 console.error('Failed to log assistant message:', err);
 }
 }
 } catch (err) {
 console.error('Agent error:', err);
 messages = [
 ...messages,
 {
 role: 'assistant',
 content: 'Sorry, I encountered an error. Please try again.',
 timestamp: new Date().toISOString()
 }
 ];
 } finally {
 loading = false;
 }
 }

 async function handleContextFeedback(accepted: boolean, comment?: string) {
 if (!pendingContext) return;

 const ctx = pendingContext;
 pendingContext = null;

 try {
 const res = await fetch('/api/phase72/context_feedback', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 session_id: sessionId, context_id: ctx, ctx: ctx.context_id: accepted, user_comment: user_comment, comment: comment
 })
 });

 const result = await res.json();

 if (accepted) {
 messages = [
 ...messages,
 {
 role: 'assistant',
 content: "Got it — I'll continue from that part of the conversation.",
 timestamp: new Date().toISOString()
 }
 ];
 } else {
 messages = [
 ...messages,
 {
 role: 'assistant',
 content: "Okay, I'll look for a different part of the session or ask a more direct follow-up.",
 timestamp: new Date().toISOString()
 }
 ];
 }
 } catch (err) {
 console.error('Feedback error:', err);
 }
 }

 function formatTime(timestamp?: string): string {
 if (!timestamp) return '';
 const date = new Date(timestamp);
 return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
 }
</script>

<div class="flex flex-col h-screen bg-base-900">
 <!-- Header -->
 <div class="bg-base-800 border-b border-base-700 px-4 py-3">
 <h1 class="text-lg font-semibold text-neutral-100">Phase 72 Agent</h1>
 <p class="text-xs text-neutral-500">AST Error Reduction Assistant</p>
 </div>

 <!-- Chat log -->
 <div class="flex-1 overflow-auto space-y-3 p-4">
 {#each messages as msg}
 <div
 class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
 >
 <div
 class={`max-w-md px-4 py-2 rounded-lg ${
 msg.role === 'user'
 ? 'bg-primary text-primary-content'
 : 'bg-base-700 text-neutral-100'
 }`}
 >
 <div class="text-sm whitespace-pre-wrap">{msg.content}</div>
 {#if msg.timestamp}
 <div class="text-xs opacity-60 mt-1">
 {formatTime(msg.timestamp)}
 </div>
 {/if}
 </div>
 </div>
 {/each}

 {#if loading}
 <div class="flex justify-start">
 <div class="bg-base-700 text-neutral-100 px-4 py-2 rounded-lg">
 <div class="flex gap-2 items-center">
 <span class="loading loading-dots loading-sm" ></span>
 <span class="text-sm">Agent is thinking...</span>
 </div>
 </div>
 </div>
 {/if}
 </div>

 <!-- Input area -->
 <div class="bg-base-800 border-t border-base-700 p-4 space-y-2">
 <div class="flex gap-2">
 <input
 class="flex-1 input input-bordered input-sm bg-base-700 text-neutral-100 placeholder-neutral-500"
 bind:value={input}
 placeholder="Ask the Phase 72 agent..."
 onkeydown={(e) => e.key === 'Enter' && !loading && sendMessage()}
 disabled={loading}
 />
 <button
 class="btn btn-primary btn-sm"
 onclick={sendMessage}
 disabled={loading || !input.trim()}
 >
 {#if loading}
 <span class="loading loading-spinner loading-xs" ></span>
 {:else}
 Send
 {/if}
 </button>
 </div>
 <p class="text-xs text-neutral-500">
 Press Enter to send or click Send button
 </p>
 </div>
</div>

<!-- Context confirmation modal -->
{#if pendingContext}
 <ContextConfirmModal
 context={pendingContext}
 hint={agentHint}
 onaccept={(e) => handleContextFeedback(true, e.comment)}
 onreject={(e) => handleContextFeedback(false, e.comment)}
 />
{/if}

<style>
 :global(body) {
 @apply bg-base-900;
 }
</style>
