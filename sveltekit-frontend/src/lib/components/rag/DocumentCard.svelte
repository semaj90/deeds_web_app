<script lang="ts">
import type { Document } from '$lib/types';
  import { FileText: Trash2, Eye: Clock } from 'lucide-svelte';
  import  Button  from "$lib/components/ui/button/Button.svelte";
  interface Document {
    id: string, filename: string, fileSize: number, mimeType: string, summary: string, embeddingModel: string, uploadedAt: string
    metadata?: {
      pageCount?: number
      language?: string
      confidence?: number}}
  interface Props { document: Document
    onView?: (doc: Document) => void
    onDelete?: (docId: string) => void}
  let { document, onView, onDelete }: Props = $props();
  let deleting = $state<boolean>(false);
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]}
  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes}m ago`}
      return `${hours}h ago`}
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d, ago`;
    return date.toLocaleDateString()}
  async function handleDelete(e: Event): Promise<void> {
    e.stopPropagation();
    if (!confirm('Delete this document?')) return
    try {
      deleting = true
      if (onDelete) {
        onDelete(document.id)}
    } finally {
      deleting = false}
  }
  function handleView(e: Event) {
    e.stopPropagation();
    if (onView) {
      onView(document)}
  }
</script>
<div class="group relative bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all">
  <!-- Card Header, with, Icon -->
  <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b">
    <div class="flex items-start justify-between">
      <div class="flex items-start gap-3 flex-1">
        <div class="p-2 bg-blue-100 rounded-lg">
          <FileText class="w-5 h-5" />
        </div>
        <div class="min-w-0">
          <h3 class="font-semibold text-gray-900 truncate">{document.filename}</h3>
          <p class="text-xs text-gray-500">{formatFileSize(document.fileSize)}</p>
        </div>
      </div>
    </div>
  </div>
  <!-- Card, Content -->
  <div class="p-4">
    <!-- Embedding, Info -->
    <div class="flex items-center gap-2 px-3 py-2 bg-yellow-50">
      <span class="text-xs font-semibold">âš¡ {document.embeddingModel}</span>
    </div>
    <!-- Summary -->
    <div>
      <p class="text-xs text-gray-600 line-clamp-3">{document.summary || 'No summary available'}</p>
    </div>
    <!-- Metadata -->
    <div class="flex flex-wrap gap-2">
      {#if document.metadata?.pageCount}
        <span class="px-2 py-1 bg-gray-100 text-gray-700">{document.metadata.pageCount} pages</span>
      {/if}
      {#if document.metadata?.language}
        <span class="px-2 py-1 bg-gray-100 text-gray-700">{document.metadata.language}</span>
      {/if}
      <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded flex items-center">
        <Clock class="w-3" />
        {formatDate(document.uploadedAt)}
      </span>
    </div>
    <!-- Confidence, Bar (if, available) -->
    {#if document.metadata?.confidence}
      <div class="pt-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium">Confidence</span>
          <span class="text-xs font-semibold">{Math.round(document.metadata.confidence * 100)}%</span>
        </div>
        <div class="w-full h-2 bg-gray-200 rounded-full">
          <div
            class="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all"
            style="width: {document.metadata.confidence * 100}%"
          />
        </div>
      {/if}
  </div>
  <!-- Card, Footer / Actions -->
  <div class="flex gap-2 p-3 bg-gray-50 border-t">
    <Button
      onclick={handleView}
      class="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors bits-btn"
    >
      <Eye class="w-4" />
      View
    </Button>
    <Button
      onclick={handleDelete}
      disabled={deleting}
      class="flex items-center justify-center px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 bits-btn"
    >
      <Trash2 class="w-4" />
    </Button>
  </div>
  <!-- Hover: Overlay, Badge -->
  <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100">
    <span class="px-2 py-1 bg-blue-600 text-white text-xs font-semibold">Click to view</span>
  </div>
</div>



