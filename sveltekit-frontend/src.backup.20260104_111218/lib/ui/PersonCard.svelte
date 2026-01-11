<script lang="ts">
 import Button from './Button.svelte';
 import Tag from './Tag.svelte';

 let { id, name, role = 'witness', riskLevel = 'medium', photo, summary, lastSeen = 'Unknown', connections = 0, verified = false, onclick } = $props<{
 id: string;
 name: string;
 role?: 'suspect' | 'witness' | 'victim' | 'associate';
 riskLevel?: 'high' | 'medium' | 'low';
 photo?: string | undefined;
 summary: string;
 lastSeen?: string;
 connections?: number;
 verified?: boolean;
 onclick?: (() => void) | undefined;
 }>();

 function roleLabel(r: typeof role) {
 if (r === 'suspect') return 'SUSPECT';
 if (r === 'witness') return 'WITNESS';
 if (r === 'victim') return 'VICTIM';
 return 'ASSOCIATE';
 }

 function roleColor(r: typeof role): 'red' | 'blue' | 'yellow' | 'default' {
 if (r === 'suspect') return 'red';
 if (r === 'witness') return 'blue';
 if (r === 'victim') return 'yellow';
 return 'default';
 }
</script>

<div
 class="panel-soft p-4 cursor-pointer hover:bg-panel transition-colors"
 onclick={onclick}
 role="button"
 tabindex="0"
 onkeydown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 onclick?.();
 }
 }}
>
 <div class="flex gap-3">
 <!-- Photo/Avatar -->
 <div class="w-20 h-20 flex-shrink-0 relative">
 {#if photo}
 <img
 src={photo}
 alt={name}
 class="w-full h-full object-cover rounded border border-black/40"
 />
 {:else}
 <div class="w-full h-full rounded border border-black/40 bg-sandDark
 flex items-center justify-center text-3xl font-mono text-black/60">
 {name.charAt(0)}
 </div>
 {/if}

 <!-- Risk indicator -->
 <div class="absolute -top-1 -right-1">
 <span class={
 riskLevel === 'high' ? 'pill-red' :
 riskLevel === 'medium' ? 'pill-yellow' :
 'pill-green'
 }>
 {riskLevel}
 </span>
 </div>
 </div>

 <!-- Info -->
 <div class="flex-1 min-w-0">
 <!-- Header row -->
 <div class="flex items-start justify-between gap-2 mb-2">
 <div class="flex-1 min-w-0">
 <div class="flex items-center gap-2 mb-1">
 <h3 class="font-mono text-sm tracking-[0.12em] uppercase truncate">
 {name}
 </h3>
 {#if verified}
 <span class="i-heroicons-check-badge text-accent flex-shrink-0" title="Identity Verified" ></span>
 {/if}
 </div>
 <div class="text-[10px] font-mono tracking-[0.16em] uppercase text-black/60">
 ID: {id}
 </div>
 </div>

 <Tag color={roleColor(role)}>
 {roleLabel(role)}
 </Tag>
 </div>

 <!-- Summary -->
 <div class="text-xs leading-relaxed text-black/80 mb-2 line-clamp-2">
 {summary}
 </div>

 <!-- Metadata -->
 <div class="flex items-center justify-between text-[10px] font-mono text-black/60">
 <span>Last seen: {lastSeen}</span>
 <span>{connections} connections</span>
 </div>
 </div>
 </div>

 <!-- Action row -->
 <div class="mt-3 pt-3 border-t border-black/20 flex gap-2">
 <Button variant="secondary" onclick={(e) => { e?.stopPropagation(); }}>
 <span class="i-heroicons-document-text mr-1" ></span>
 View Profile
 </Button>
 <Button variant="secondary" onclick={(e) => { e?.stopPropagation(); }}>
 <span class="i-heroicons-link mr-1" ></span>
 Connections
 </Button>
 </div>
</div>

<style>
 .line-clamp-2 {
 display: -webkit-box;
 -webkit-line-clamp: 2;
 -webkit-box-orient: vertical;
 overflow: hidden;
 }
</style>
