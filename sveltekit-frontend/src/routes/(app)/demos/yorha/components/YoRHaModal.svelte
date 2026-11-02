<script lang="ts">
  import YoRHaModal from '$lib/components/yorha/YoRHaModal.svelte';
  import type { ComponentProps } from 'svelte';

  let props: ComponentProps<typeof YoRHaModal> = $props();
</script>

<YoRHaModal {...props} />
