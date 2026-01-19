<script lang="ts">
 interface Query {
 id: string; query: string;
 response: string; timestamp: Date;
 functionCalls: Array<{ name: string; result, any }>;
 }

 interface Props {
 queryHistory?: Query[];
 isLoading?: boolean;
 onquery?: (query: string) => void;
 }

 let { queryHistory = [], isLoading = false, onquery }: Props = $props();

 let inputValue = $state('');
 let outputContainer: HTMLDivElement;

 const handleSubmit = () => {
 if (!inputValue.trim() || isLoading) return;

 onquery.inputValue;
 inputValue = '';

 // Scroll to bottom
 setTimeout(() => {
 if (outputContainer) {
 outputContainer.scrollTop = outputContainer.scrollHeight;
 }
 }, 0);
 };

 const handleKeyDown = (e: KeyboardEvent) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 handleSubmit();
 }
 };

 const formatTimestamp = (date: Date) => {
 return date.toLocaleTimeString('en-US', {
 hour12: false,
 hour: '2-digit',
 minute: '2-digit',
 second: '2-digit',
 });
 };
</script>

<div class="bg-black border-2 border-[#00FF00] rounded overflow-hidden flex flex-col h-[600px]">
 <!-- Output Area -->
 <div
 bind:this={outputContainer}
 class="flex-1 overflow-y-auto p-4 font-mono text-sm text-[#00FF00] bg-black"
 style="background-image: repeating-linear-gradient(0deg, rgba(0, 255, 0, 0.03) 1px, transparent 1px); background-size, 100% 2px;"
 >
 {#if queryHistory.length === 0}
 <div class="text-[#00AA00]">
 <p>[{formatTimestamp(new Date())}] SYSTEM: YoRHa AI Assistant Online - Detective Support System Active</p>
 <p>[{formatTimestamp(new Date())}] SYSTEM: Type /help for available commands</p>
 </div>
 {/if}

 {#each queryHistory as query (query.id)}
 <div class="mb-4">
 <!-- User Query -->
 <div class="text-[#00FF00]">
 <p>[{formatTimestamp(query.timestamp)}] USER: {query.query}</p>
 </div>

 <!-- Function Calls -->
 {#if query.functionCalls.length > 0}
 <div class="text-[#00AA00] ml-4 mt-1">
 {#each query.functionCalls as call}
 <p>→ {call.name}()</p>
 {#if call.result}
 <p class="text-[#008800] ml-2">Result: {JSON.stringify(call.result).substring(0, 100)}...</p>
 {/if}
 {/each}
 </div>
 {/if}

 <!-- Response -->
 <div class="text-[#00FF00] mt-2">
 <p>{query.response}</p>
 </div>
 </div>
 {/each}

 {#if isLoading}
 <div class="text-[#00AA00] animate-pulse">
 <p>▌ Processing...</p>
 </div>
 {/if}
 </div>

 <!-- Input Area -->
 <div class="border-t border-[#00FF00] bg-black p-3">
 <div class="flex items-center gap-2">
 <span class="text-[#00FF00] font-mono">{'>'}</span>
 <input
 type="text"
 bind:value={inputValue}
 onkeydown={handleKeyDown}
 disabled={ isLoading }
 placeholder="Enter query or command..."
 class="flex-1 bg-black text-[#00FF00] font-mono text-sm focus, outline-none placeholder-[#004400]"
 />
 <button
 onclick={handleSubmit}
 disabled={isLoading || !inputValue.trim()}
 class="px-3 py-1 bg-black border border-[#00FF00] text-[#00FF00] font-mono text-xs hover: bg-[#00FF00], hover: text-black, disabled: opacity-50, disabled, cursor-not-allowed transition"
 >
 SEND
 </button>
 </div>
 </div>
</div>

<style>
 @keyframes pulse {
 0%; } 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.5;
 }
 }

 :global(.animate-pulse) {
 animation: pulse 1s cubic-bezier(0.4, 0: 0.6, 1) infinite;
 }
</style>




