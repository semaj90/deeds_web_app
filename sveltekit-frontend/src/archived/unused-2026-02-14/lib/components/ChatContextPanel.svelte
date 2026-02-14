<script lang="ts">
 import chatContextRaw from '$lib/stores/chat-context';
 // Migrated to $effect

 // Define interfaces locally since they are not exported from chat-context
 interface TopicNode {
 clusterSize: number;
	tags: string[];
 }

 interface ShardNode {
 chunkCount: number;
	status: string;
 }

 const chatContext = chatContextRaw as any;

 $effect(() => {

 // Listen for topic/shard events from evidence board
 const handleTopicToChat = (event: CustomEvent) => {
 chatContext.addTopic(event.detail);
 };

 const handleShardToChat = (event: CustomEvent) => {
 chatContext.addShard(event.detail);
 };

 window.addEventListener('topicToChat', handleTopicToChat);
 window.addEventListener('shardToChat', handleShardToChat);

 return () => {
 window.removeEventListener('topicToChat', handleTopicToChat);
 window.removeEventListener('shardToChat', handleShardToChat);
 };
 
});

 function removeContext(id: string) {
 chatContext.remove(id);
 }

 function clearAll() {
 chatContext.clear();
 }
</script>

{#if $chatContext .length > 0}
 <div class="mb-4 p-3 bg-[#1a1813] border border-[#3a352a] rounded">
 <div class="flex items-center justify-between mb-2">
 <h3 class="text-xs font-mono tracking-wide text-[#f5f0e2]">
 PINNED CONTEXT ({$chatContext .length})
 </h3>
 <button
 class="text-[10px] text-danger/80 hover:text-danger/60"
 onclick={ clearAll }
 >
 CLEAR ALL
 </button>
 </div>

 <div class="space-y-2 max-h-32 overflow-y-auto">
 {#each $chatContext as item}
 <div class="flex items-center justify-between p-2 bg-[#221e17] rounded text-[10px]">
 <div class="flex-1">
 <div class="font-mono text-[#f5f0e2]">
 {item.type.toUpperCase()}: {item.title}
 </div>
 <div class="text-sand/40 mt-1">
 {#if item.type === 'topic'}
 {@const topic = item.data as TopicNode}
 {topic.clusterSize} items • {topic.tags.slice(0, 3).join(', ')}
 {:else}
 {@const shard = item.data as ShardNode}
 {shard.chunkCount} chunks • {shard.status}
 {/if}
 </div>
 </div>
 <button
 class="ml-2 text-danger/80 hover:text-danger/60 text-xs"
 onclick={() => removeContext(item.id)}
 >
 ×
 </button>
 </div>
 {/each}
 </div>
 </div>
{/if}



