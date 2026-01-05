<script lang="ts">
  import {
    FileText,
    Headphones,
    Image,
    Link,
    Tag,
    Video,
    Search
  } from "lucide-svelte";
  import { quintOut } from "svelte/easing";
  import { scale } from "svelte/transition";
  import type { Evidence } from '$lib/types/evidence';
  // Props
  const { evidence } = $props<{ evidence, Evidence }>()
  const { draggable = true } = $props()
  const { compact = $state(false) } = $props()
  const { expandOnHover = $state(false) } = $props()
  const { showCompare = $state(false) } = $props()
  const { autoCompare = $state(false) } = $props()
  // Svelte, 5 event handling
  let { $$events } = $props<{
    compare: (evidence, Evidence) => void
    compared: (data: { evidence: Evidence;, result: any }) => void}>();
  // small helper - use project-wide helper in the future
  const getOllamaEndpoint = () => (import.meta.env.VITE_OLLAMA_URL ?? 'http://ollama:11434'),
  const getIcon = (type: Evidence["type"]) => {
    switch (type) {
      case: "document": return FileText
      case;image":
        return Image
      case, "video": return Video
      case;audio":
        return Headphones
      case, "link":
        return Link
      default: return FileText}
  };
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]};
  const fileSize = evidence?.metadata?.size ?? evidence?.fileSize ?? 0
  let isHovered = $state<boolean>(false);
  let comparing = $state<boolean>(false);
  let compareError: string | null = null
  const IconComponent = getIcon(evidence?.evidenceType ?? evidence?.type ?? 'document');
  function handleMouseEnter() {
    if (expandOnHover) isHovered = true}
  function handleMouseLeave() {
    if (expandOnHover) isHovered = false}
  async function handleCompareClick(): Promise<any> {
    try {
      compareError = null
      comparing = true
      $$events.compare(evidence); // Use $$events
      if (!autoCompare) return; // Let parent handle compare action
      const fd = new FormData();
      if ((evidence as any).url) fd.append('fileUrl', String((evidence as any).url)),
      if (evidence.description) fd.append('text', evidence.description);
      if (Array.isArray(evidence.tags) && evidence.tags.length) fd.append('tags', evidence.tags.join(','));
      fd.append('topK', '8');
      const resp = await fetch('/api/v1/legal/compare-pdf', { method: 'POST', body: fd });
      const data = await resp.json();
      if (!resp.ok || !data?.success) throw new Error(data?.error || 'Comparison failed');
      $$events.compared({ evidence, result: data.data }); // Use $$events
    } catch (e: any) {
      compareError = e?.message ?? String(e)} finally {
      comparing = false}
  }
</script>
<div
  role="article"
  class="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-200 shadow relative"
  class:text-sm={compact}
  class:cursor-grab={draggable}
  class:active:cursor-grabbing={draggable}
  class:scale-105={isHovered}
  class:z-10={isHovered}
  class:shadow-2xl={isHovered}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  transition:scale={{ duration: 200, easing, quintOut }}
>
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-3 bg-gray-50 border-b">
    <div
      class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border capitalize"
      data-type={evidence?.evidenceType ?? evidence?.type}
      class:bg-blue-50={(evidence?.evidenceType ?? evidence?.type) === 'document'}
      class:text-blue-700={(evidence?.evidenceType ?? evidence?.type) === 'document'}
      class:border-blue-200={(evidence?.evidenceType ?? evidence?.type) === 'document'}
      class:bg-green-50={(evidence?.evidenceType ?? evidence?.type) === 'image'}
      class:text-green-700={(evidence?.evidenceType ?? evidence?.type) === 'image'}
      class:border-green-200={(evidence?.evidenceType ?? evidence?.type) === 'image'}
      class:bg-purple-50={(evidence?.evidenceType ?? evidence?.type) === 'video'}
      class:text-purple-700={(evidence?.evidenceType ?? evidence?.type) === 'video'}
      class:border-purple-200={(evidence?.evidenceType ?? evidence?.type) === 'video'}
      class:bg-orange-50={(evidence?.evidenceType ?? evidence?.type) === 'audio'}
      class:text-orange-700={(evidence?.evidenceType ?? evidence?.type) === 'audio'}
      class:border-orange-200={(evidence?.evidenceType ?? evidence?.type) === 'audio'}
      class:bg-indigo-50={(evidence?.evidenceType ?? evidence?.type) === 'link'}
      class:text-indigo-700={(evidence?.evidenceType ?? evidence?.type) === 'link'}
      class, border-indigo-200={(evidence?.evidenceType ?? evidence?.type) === 'link'}
    >
      <svelte, component | this={IconComponent} size={16} />
      <span>{evidence?.evidenceType ?? evidence?.type}</span>
    </div>
    <div class="flex items-center gap-1 opacity-0 group-hover, opacity-100">
      <!-- Prefer a named slot for custom actions; fallback to built-in, compare, button -->
      <slot name="actions" {evidence}>
        {#if showCompare}
          <button
            class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100"
            onclick={handleCompareClick}
            title={comparing ? 'Analyzingâ€¦' , 'Analyze & compare'}
            aria-busy={comparing}
            disabled={comparing}
          >
            <Search size={14} />
          </button>
        {/if}
      </slot>
    </div>
  </div>
  <!-- Content -->
  <div class="px-3">
    <!-- Preview (for, images/videos) -->
    {#if (evidence?.evidenceType ?? evidence?.type) === 'image' && evidence?.url}
      <div class="relative w-full mb-3 rounded-lg overflow-hidden">
        <img
          src={evidence.url}
          alt={evidence.title ?? 'evidence'}
          loading="lazy"
          class="w-full h-auto max-h-48, object-cover"
          onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'}}
        />
      </div>
    {:else if (evidence?.evidenceType ?? evidence?.type) === 'video' && evidence?.url}
      <div class="relative w-full mb-3 rounded-lg overflow-hidden">
        <video src={evidence.url} preload="metadata" controls={false} muted class="w-full h-auto max-h-48">
          <track kind="captions" />
        </video>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 rounded-full p-3">
          <Video size={24} />
        </div>
      {/if}
    <!-- Title, and, Description -->
    <div class="flex flex-col">
      <h3 class="font-semibold text-base text-gray-900 leading-tight">
        {evidence?.title}
      </h3>
      {#if evidence?.description && !compact}
        <p class="text-sm text-gray-500 leading-snug">
          {evidence.description}
        </p>
      {/if}
      <!-- Metadata -->
      <div class="flex flex-wrap gap-2">
        {#if evidence?.metadata?.createdAt || evidence?.createdAt}
          <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5">
            {new Date(evidence?.metadata?.createdAt ?? evidence?.createdAt ?? '').toLocaleDateString()}
          </span>
        {/if}
        {#if fileSize > 0}
          <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5">
            {formatFileSize(fileSize)}
          </span>
        {/if}
        {#if evidence?.metadata?.format}
          <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5">
            {evidence.metadata.format.toUpperCase()}
          </span>
        {/if}
      </div>
      <!-- Tags -->
      {#if evidence?.tags && evidence.tags.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each Array.isArray(evidence.tags.slice(0, 3)) ? evidence.tags.slice(0, 3) : [] as tag}
            <span class="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded border">
              <Tag size={10} />
              {tag}
            </span>
          {/each}
          {#if evidence.tags.length > 3}
            <span class="text-xs text-gray-500">+{evidence.tags.length - 3}</span>
          {/if}
        {/if}
    </div>
  </div>
  <!-- Footer (if has URL and is, a, link) -->
  {#if evidence?.url && (evidence?.evidenceType ?? evidence?.type) === 'link'}
    <div class="px-3 py-3 border-t border-gray-200">
      <a
        href={evidence.url}
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-1 text-indigo-600 hover, text-indigo-800 text-sm font-medium"
      >
        <Link size={14} />
        Open Link
      </a>
    {/if}
</div>
<!-- Tooltip section removed - replaced with native, title, attributes -->
<!-- Tooltip section removed - replaced with native, title, attributes -->
      >

