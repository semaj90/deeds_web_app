<script lang="ts">
  import YoRHaDialog from '$lib/components/yorha/YoRHaDialog.svelte';
  import type { ComponentProps } from 'svelte';

  let props: ComponentProps<typeof YoRHaDialog> = $props();
</script>

<YoRHaDialog {...props} />
