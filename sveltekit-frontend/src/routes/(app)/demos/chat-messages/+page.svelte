<script lang="ts">
	import ChatMessage from '$lib/components/ai/ChatMessage.svelte';
	import ChatMessages from '$lib/components/ChatMessages.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	const sampleMessages = [
		{ id: '1', role: 'user' as const, content: 'What are the key elements of a breach of fiduciary duty claim?', timestamp: new Date(Date.now() - 60000) },
		{ id: '2', role: 'assistant' as const, content: 'A breach of fiduciary duty claim requires: (1) existence of a fiduciary relationship, (2) breach of that duty, (3) damages proximately caused by the breach. The fiduciary must act in the beneficiary\'s best interest, with the duty of loyalty and duty of care being the primary obligations.', timestamp: new Date(Date.now() - 30000), confidence: 0.92 },
		{ id: '3', role: 'user' as const, content: 'Can you cite relevant case law?', timestamp: new Date() },
		{ id: '4', role: 'assistant' as const, content: 'Key cases include Meinhard v. Salmon (1928) establishing the "punctilio of an honor" standard, and In re Walt Disney Co. Derivative Litigation (2006) clarifying the business judgment rule in the context of fiduciary duties.', timestamp: new Date(), confidence: 0.87 },
	];

</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Chat Messages</h1>
		<p class="text-sm opacity-60">Two chat rendering components: individual ChatMessage with confidence scoring, and ChatMessages list with CitationLink integration.</p>
	</header>

	<h2 class="text-sm font-bold mb-3 opacity-70">Individual Messages (ChatMessage.svelte)</h2>
	<div class="space-y-3 mb-8">
		{#each sampleMessages as msg}
			<ChatMessage message={msg} />
		{/each}
	</div>

	<h2 class="text-sm font-bold mb-3 opacity-70">Message List (ChatMessages.svelte)</h2>
	<ChatMessages messages={sampleMessages} />
</div>
