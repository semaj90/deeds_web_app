<script lang="ts">
  import YoRHaDetectiveModal from '$lib/components/yorha/YoRHaDetectiveModal.svelte';
  import type { ComponentProps } from 'svelte';

  let props: ComponentProps<typeof YoRHaDetectiveModal> = $props();
</script>

<YoRHaDetectiveModal {...props} />
