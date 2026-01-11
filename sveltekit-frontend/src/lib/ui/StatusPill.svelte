<script lang="ts">
 let { risk = 'medium', status = 'active' } = $props<{
 risk?: 'low' | 'medium' | 'high';
 status?: 'active' | 'pending' | 'closed';
 }>();
</script>

<div class="flex gap-1">
 <span
 class={risk === 'high'
 ? 'pill-red'
 : risk === 'medium'
 ? 'pill-yellow'
 : 'pill-green'}
 >
 { risk }
 </span>
 <span
 class={status === 'closed'
 ? 'tag bg-black text-sand'
 : status === 'pending'
 ? 'pill-yellow'
 : 'pill-green'}
 >
 { status }
 </span>
</div>

