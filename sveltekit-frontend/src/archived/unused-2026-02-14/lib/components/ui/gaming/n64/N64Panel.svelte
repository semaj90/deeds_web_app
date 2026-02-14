<script>
  import Card from './Card.svelte';
  let { ...props } = $props();
</script>
<Card {...props} />
