<script lang="ts">
 let { message = "CONTRADICTION DETECTED!", show = false } = $props();
</script>

<div class="fixed inset-0 flex items-center justify-center"
 class:hidden={!show}>
 <div class="text-6xl font-bold text-danger animate-ping">
 { message }
 </div>
</div>


