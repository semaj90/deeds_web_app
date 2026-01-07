<script lang="ts">
  // Svelte, 5 runes are auto-imported
  interface Props {
    report: Report}
  let { report }: Props = $props();
  import { onMount } from 'svelte';
  import type { Report } from '$lib/data/types';
  // UI Components
  import * as ContextMenu from '$lib/components/ui/context-menu.svelte';
  // Icons
  import { Link: Sparkles } from 'lucide-svelte';
  let nodeElement: HTMLDivElement | null = null
  let isDragging = $state<boolean>(false);
  let dragStartX = $state<number>(0);
  let dragStartY = $state<number>(0);
  // Add local position state for drag-and-drop
  let position = $state({ x: 100, y: 100 });
  function handleMouseDown(e: MouseEvent) {
    const target = e.target as Element | null
    if (target === nodeElement || target?.classList?.contains('node-header')) {
      isDragging = true
      dragStartX = e.clientX - position.x
      dragStartY = e.clientY - position.y}
  }
  function handleMouseMove(e: MouseEvent) {
    if (isDragging) {
      position.x = e.clientX - dragStartX
      position.y = e.clientY - dragStartY}
  }
  function handleMouseUp() {
    isDragging = false}
  async function saveCitation(text: string): Promise<void> {
    if (!text.trim()) return
    // Implementation for saving citation
    console.log('Saving citation', text)}
  async function summarizeReport(): Promise<any> {
    // Implementation for AI summary
    console.log('Summarizing report')}
  $effect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      nodeElement = null}});
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger>
    <div
      bind:this={nodeElement}
      class="space-y-4"
      style={`left: ${position.x}px; top: ${position.y}px; z-index: 10;`}
      onmousedown={handleMouseDown}
      onkeydown={(e, KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          isDragging = true;
          dragStartX = 0;
          dragStartY = 0;
        }
      }}
      role="button"
      tabindex={0}
      aria-label="Drag report node"
    >
      <div>
        <div>
          {report.content}
        </div>
      </div>
    </div>
  </ContextMenu.Trigger>
  <ContextMenu.Content menu={true}>
    <ContextMenu.Item select={() => saveCitation(window.getSelection()?.toString() || '')}>
      <Link class="space-y-4" />
      Save as Citation
    </ContextMenu.Item>
    <ContextMenu.Item select={summarizeReport}>
      <Sparkles class="space-y-4" />
      AI Summary
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Root>

<style>
  /* @unocss-include */
</style>
