<script lang="ts">
  import Input from './Input.svelte';

  let { ...rest } = $props();
</script>

<Input
  variant="default"
  enableTextureFiltering={true}
  {...rest}
/>
