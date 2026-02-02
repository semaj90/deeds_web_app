<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		size?: number | string;
		strokeWidth?: number;
		color?: string;
		class?: string;
	}

	let props: Props = $props();
</script>

<Icon {...props}>
	<path d="M18 20V10" />
	<path d="M12 20V4" />
	<path d="M6 20v-6" />
</Icon>
