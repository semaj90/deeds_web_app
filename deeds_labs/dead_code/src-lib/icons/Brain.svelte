<script lang="ts">
	import Icon from './Icon.svelte';
	interface Props { size?: number | string; strokeWidth?: number; color?: string; class?: string; }
	let props: Props = $props();
</script>
<Icon {...props}><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h-1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-.09A7.98 7.98 0 0 1 4 10h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H4a2 2 0 0 1 2-2c.74 0 1.39.4 1.73 1H9a2 2 0 0 1 2-2Z" /><path d="M9 3v2" /><path d="M15 3v2" /></Icon>
