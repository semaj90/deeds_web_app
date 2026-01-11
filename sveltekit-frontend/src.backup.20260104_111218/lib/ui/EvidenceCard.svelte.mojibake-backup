<script lang="ts">
  import type { Evidence } from '$lib/types';
  import { Archive } from "lucide-svelte";
import { Download } from "lucide-svelte";
import { Eye } from "lucide-svelte";
import { FileText } from "lucide-svelte";
import { Image } from "lucide-svelte";
import { Music } from "lucide-svelte";
import { Trash2 } from "lucide-svelte";
import { Video } from "lucide-svelte";
import { Zap } from "lucide-svelte";;
  // Migrated from createEventDispatcher to callback props;
  import Tooltip from './Tooltip.svelte';

  interface Props {
    evidence: Evidence;
    isTagged?: boolean;
    isDropped?: boolean;
    selected?: boolean;
    onSelect?: (id: string) => void;
    onDelete?: (id: string) => void;
    onDownload?: (id: string) => void;
    readonly?: boolean;
    showActions?: boolean;
  }

  let {
    evidence,
    isTagged = false,
    isDropped = false,
    selected = false,
    onSelect,
    onDelete,
    onDownload,
    readonly = false,
    showActions = true
  }: Props = $props ();

  const dispatch = createEventDispatcher();

  // Calculate icon based on file type
  function getFileIcon(mimeType: string) {
    if (mimeType?.startsWith('image/')) return Image;
    if (mimeType?.startsWith('video/')) return Video;
    if (mimeType?.startsWith('audio/')) return Music;
    if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('7z')) return Archive;
    return FileText;
  }

  // Format file size
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Handle card click
  function handleCardClick() {
    onSelect?.(evidence.id);
  }

  // Handle drag start
  function handleDragStart(e: DragEvent) {
    if (readonly) return;

    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('text/plain', evidence.id);

    // Add visual feedback
    console.log('🎮 Dragging evidence:', evidence.title);
  }

  // Handle action clicks
  function handleDelete(e: Event) {
    e.stopPropagation();
    onDelete?.(evidence.id);
  }

  function handleDownload(e: Event) {
    e.stopPropagation();
    onDownload?.(evidence.id);
  }
</script>

<div
  class="evidence-card nes-container is-dark with-title"
  class:selected
  class:readonly
  class:is-tagged={isTagged}
  class:is-dropped={isDropped}
  draggable={!readonly}
  onclick={handleCardClick}
  ondragstart={handleDragStart}
  role="button"
  tabindex="0"
  aria-label="Evidence: {evidence.title} - Drag to canvas for AI tagging"
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  }}
>
  <div class="card-header">
    <div class="file-icon">
      <getFileIcon(evidence.mimeType || 'application/octet-stream') size={24} / />
    </div>

    {#if isTagged}
      <div class="ai-indicator">
        <Zap size={16} />
        <span>AI Tagged</span>
      </div>
    {/if}

    {#if showActions && !readonly}
      <div class="card-actions">
        <button
          class="action-btn download-btn nes-btn is-small"
          onclick={handleDownload}
          aria-label="Download {evidence.title}"
          title="Download"
        >
          <Download size={14} />
        </button>

        <button
          class="action-btn delete-btn nes-btn is-small"
          onclick={handleDelete}
          aria-label="Delete {evidence.title}"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    {/if}
  </div>

  <div class="card-content">
    <h3 class="evidence-title nes-text">{evidence.title}</h3>

    {#if evidence.description}
      <p class="evidence-description nes-text is-disabled">{evidence.description}</p>
    {/if}

    <div class="evidence-meta">
      <div class="meta-item nes-text is-disabled">
        <FileText size={12} />
        <span>{evidence.evidenceType}</span>
      </div>

      {#if evidence.fileSize}
        <div class="meta-item nes-text is-disabled">
          <Archive size={12} />
          <span>{formatFileSize(evidence.fileSize)}</span>
        </div>
      {/if}
    </div>

    {#if evidence.tags && evidence.tags.length > 0}
      <div class="evidence-tags">
        {#each evidence.tags.slice(0, 2) as tag}
          <span class="nes-badge">
            <span class="is-primary">{tag}</span>
          </span>
        {/each}
        {#if evidence.tags.length > 2}
          <span class="nes-badge">
            <span class="is-warning">+{evidence.tags.length - 2}</span>
          </span>
        {/if}
      </div>
    {/if}
  </div>

  {#if evidence.aiSummary}
    <div class="ai-summary nes-container is-rounded">
      <div class="summary-header nes-text is-primary">
        <Eye size={12} />
        <span>AI Summary</span>
      </div>
      <Tooltip text={evidence.aiSummary}>
        <p class="summary-text nes-text">{evidence.aiSummary.length > 100 ? evidence.aiSummary.substring(0, 100) + '...' : evidence.aiSummary}</p>
      </Tooltip>
    </div>
  {/if}

  <!-- Drag instruction -->
  {#if !readonly && !isDropped}
    <div class="drag-hint nes-text is-disabled">
      🖱️ Drag to canvas for AI tagging
    </div>
  {/if}
</div>

<style>
  .evidence-card {
    width: 160px;
    background: #1a1a1a;
    border: 3px solid #333;
    border-radius: 8px;
    padding: 12px;
    cursor: grab;
    transition: all 0.3s ease;
    position: relative;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    font-size: 0.7rem;
  }

  .evidence-card:hover {
    border-color: #ffc107;
    box-shadow: 0 6px 16px rgba(255, 193, 7, 0.2);
    transform: translateY(-3px);
  }

  .evidence-card:active {
    cursor: grabbing;
    transform: translateY(-1px);
  }

  .evidence-card.selected {
    border-color: #ffc107;
    box-shadow: 0 0 0 4px rgba(255, 193, 7, 0.3);
  }

  .evidence-card.readonly {
    cursor: default;
  }

  .evidence-card.readonly:hover {
    transform: none;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }

  .evidence-card.is-tagged {
    border-color: #92cc41;
    box-shadow: 0 0 0 4px rgba(146, 204, 65, 0.2);
  }

  .evidence-card.is-dropped {
    border-color: #ffc107;
    background: linear-gradient(135deg, #2a2a2a, #3a3a3a);
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .file-icon {
    color: #92cc41;
    background: #2a2a2a;
    padding: 6px;
    border-radius: 6px;
  }

  .ai-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #92cc41;
    font-size: 0.6rem;
    font-weight: bold;
    text-transform: uppercase;
    animation: glow 2s infinite;
  }

  @keyframes glow {
    0%, 100% { text-shadow: 0 0 5px rgba(146, 204, 65, 0.5); }
    50% { text-shadow: 0 0 10px rgba(146, 204, 65, 0.8); }
  }

  .card-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .evidence-card:hover .card-actions {
    opacity: 1;
  }

  .action-btn {
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    font-size: 0.6rem;
  }

  .download-btn:hover {
    background-color: #2a4a2a;
    border-color: #92cc41;
  }

  .delete-btn:hover {
    background-color: #4a2a2a;
    border-color: #ef4444;
  }

  .delete-btn {
    color: #ef4444;
  }

  .card-content {
    flex: 1;
    text-align: center;
  }

  .evidence-title {
    font-size: 0.8rem;
    font-weight: bold;
    margin: 0 0 6px 0;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .evidence-description {
    font-size: 0.6rem;
    margin: 0 0 8px 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .evidence-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .meta-item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 0.5rem;
  }

  .evidence-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    margin-bottom: 8px;
  }

  .ai-summary {
    background: #2a2a2a;
    padding: 6px;
    margin: 8px 0;
    border: 1px solid #444;
  }

  .summary-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 0.6rem;
    font-weight: bold;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .summary-text {
    font-size: 0.6rem;
    line-height: 1.4;
    margin: 0;
    cursor: help;
  }

  .drag-hint {
    font-size: 0.5rem;
    text-align: center;
    margin-top: 6px;
    opacity: 0.7;
  }

  /* Focus styles for accessibility */
  .evidence-card:focus {
    outline: 2px solid #ffc107;
    outline-offset: 2px;
  }

  .action-btn:focus {
    outline: 2px solid #ffc107;
    outline-offset: 1px;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .evidence-card {
      width: 140px;
      padding: 10px;
      font-size: 0.65rem;
    }
  }
</style>
