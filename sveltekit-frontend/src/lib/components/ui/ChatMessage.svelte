<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		message: {
			role: 'user' | 'assistant' | 'error';
			content: string;
			timestamp?: string;
		};
		analyticsLog?: (_event: any) => void;
	}

	let { message, analyticsLog = () => {} }: Props = $props();

	$effect(() => {
		if (message && message.content) {
			analyticsLog({ event: 'chat_message_rendered', role: message.role, timestamp: Date.now() });
		}
	});
</script>

<div
	class="flex items-start gap-2 py-2 px-3 rounded-lg mb-2
		{message.role === 'user' ? 'bg-sand/10 text-right' : ''}
		{message.role === 'assistant' ? 'bg-nier-surface-light text-left' : ''}
		{message.role === 'error' ? 'bg-danger/10 text-left' : ''}"
>
	{#if message.role === 'user'}
		<Icon name="user" class="w-5 h-5" />
	{:else if message.role === 'assistant'}
		<Icon name="bot" class="w-5 h-5" />
	{:else}
		<Icon name="alert-triangle" class="w-5 h-5" />
	{/if}
	<div class="flex-1">
		<div class="text-sm">{message.content}</div>
		{#if message.timestamp}
			<div class="text-xs text-sand/40">{message.timestamp}</div>
		{/if}
	</div>
</div>
