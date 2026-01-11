<script lang="ts">
 import Panel from '$lib/ui/Panel.svelte';
 import ChatBubble from '$lib/ui/ChatBubble.svelte';
 import Button from '$lib/ui/Button.svelte';

 let input = $state('');

 const messages = [
 {
 id: 1,
 role: 'assistant' as const,
 text: 'Greetings, Prosecutor. I am your legal AI assistant. How may I assist with your case analysis today?',
 time: '19:02:52',
 },
 {
 id: 2,
 role: 'user' as const,
 text: 'Summarize the key aggravating factors for CASE-002 and suggest a sentencing range.',
 time: '19:03:10',
 },
 {
 id: 3,
 role: 'assistant' as const,
 text: 'Analyzing CASE-002: Human Trafficking / Forced Labor...\n\nKey Aggravating Factors:\n1. Multiple victims (15+ documented)\n2. Vulnerability of victims (migrants, economic distress)\n3. Extended duration of offense (2+ years)\n4. Use of coercion and deception\n5. Financial gain motive\n\nRecommended Sentencing Range: 15-25 years\nBased on Federal Sentencing Guidelines §2L2.1\n\nWould you like me to prepare a detailed sentencing memo?',
 time: '19:03:15',
 },
 ];

 function handleSubmit() {
 if (!input.trim()) return;
 // Wire to backend later
 console.log('Sending:', input);
 input = '';
 }
</script>

<div class="panel-outline bg-panelSoft min-h-[70vh] flex flex-col">
 <div class="px-4 py-2 border-b border-black/50 flex items-center justify-between">
 <div class="heading-sub">AI CHAT INTERFACE</div>
 <div class="flex gap-2">
 <Button variant="secondary">Terminal</Button>
 <Button variant="primary">AI Chat</Button>
 <Button variant="danger">Clear</Button>
 </div>
 </div>

 <div class="flex-1 p-4 flex flex-col gap-3 overflow-auto custom-scrollbar">
 {#each messages as m}
 <ChatBubble role={m.role} timestamp={m.time}>
 {m.text}
 </ChatBubble>
 {/each}
 </div>

 <form
 class="border-t border-black/70 flex items-center gap-2 px-4 py-3 bg-panel"
 onsubmit={(e) => {
 e.preventDefault();
 handleSubmit();
 }}
 >
 <input
 bind:value={input}
 placeholder="Ask AI about aggravating factors, sentencing guidelines, or evidence conflicts..."
 class="flex-1 bg-panelSoft text-sand px-3 py-2 rounded border border-black/60 text-sm font-mono
 focus:outline-none focus:ring-2 focus:ring-accent/50"
 />
 <Button type="submit" variant="primary">Send</Button>
 </form>
</div>
