<script lang="ts">
 // Minimal fallback chat test component so the page import resolves.
 let { open = false, caseId = '' } = $props<{
 open?: boolean;
 caseId?: string;
 }>();

 function openModal() {
 open = true;
 }
 function closeModal() {
 open = false;
 }
 let message = '';
 async function send() {
 // lightweight local-only fake send (no network)
 console.log('send message for', caseId, message);
 message = '';
 }
</script>

<div>
 <button
 class="px-3 py-2 rounded bg-indigo-600 text-white"
 onclick={openModal}
 aria-haspopup="dialog"
 >
 Open Chat (test)
 </button>

 {#if open}
 <div
 role="dialog"
 aria-modal="true"
 class="fixed inset-0 z-50 flex items-center justify-center"
 >
 <div class="bg-white rounded-lg shadow-lg w-[min(800px,90%)] p-4">
 <div class="flex justify-between items-center mb-4">
 <h3 class="text-lg font-semibold">Enhanced AI Chat (stub)</h3>
 <button class="text-sm text-gray-500" onclick={closeModal}>Close</button>
 </div>
 <div class="mb-3">
 <p class="text-sm text-gray-600">Case: {caseId}</p>
 </div>
 <textarea
 class="w-full border rounded p-2 mb-3"
 bind:value={message}
 rows="4"
 placeholder="Type a test message..."
 ></textarea>
 <div class="flex justify-end gap-2">
 <button class="px-3 py-2 rounded border" onclick={closeModal}>Cancel</button>
 <button class="px-3 py-2 rounded bg-blue-600 text-white" onclick={send}>Send</button>
 </div>
 </div>
 </div>
 {/if}
</div>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .page-repair {
 padding: 2rem;
 font-family: sans-serif;
 }
</style>
