<script>
  import Input from './Input.svelte';
  let { ...props } = $props();
</script>
<Input type="range" {...props} />
