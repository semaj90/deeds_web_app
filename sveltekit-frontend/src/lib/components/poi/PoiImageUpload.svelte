<script lang="ts">
	interface Props { poiId?: string; poiName?: string; }
	let { poiId = '', poiName = '' }: Props = $props();
</script>

<div class="p-4 border border-dashed border-gray-300 rounded-lg text-center text-sm text-gray-500">
	Upload photo for {poiName || 'POI'}
</div>
