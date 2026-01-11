<script lang="ts">
  import type { Evidence } from '$lib/schemas/evidence';
  import { formatDistanceToNow } from 'date-fns';

  interface Props {
    evidence: Evidence;
    onAskAI?: (evidence: Evidence) => void;
    onDelete?: (id: string) => void;
  }

  let { evidence, onAskAI, onDelete }: Props = $props();

  const formatDate = (date: Date | undefined) => {
    if (!date) return 'Unknown';
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };
</script>

<div class="evidence-card">
  <div class="card-header">
    <div class="title-section">
      <h3>{evidence.file_name}</h3>
      <span class="evidence-type">{evidence.evidence_type}</span>
    </div>
    <div class="actions">
      {#if onAskAI}
        <button class="btn-ask-ai" onclick={() => onAskAI?.(evidence)}>
          Ask AI
        </button>
      {/if}
      {#if onDelete}
        <button class="btn-delete" onclick={() => onDelete?.(evidence.id || '')}>
          Delete
        </button>
      {/if}
    </div>
  </div>

  {#if evidence.ai_summary}
    <div class="summary">
      <h4>AI Summary</h4>
      <p>{evidence.ai_summary}</p>
    </div>
  {/if}

  <div class="metadata">
    <div class="meta-item">
      <span class="label">File Type:</span>
      <span class="value">{evidence.file_type}</span>
    </div>
    <div class="meta-item">
      <span class="label">Size:</span>
      <span class="value">{formatFileSize(evidence.file_size)}</span>
    </div>
    <div class="meta-item">
      <span class="label">Uploaded:</span>
      <span class="value">{formatDate(evidence.uploaded_at)}</span>
    </div>
  </div>

  {#if evidence.tags && evidence.tags.length > 0}
    <div class="tags">
      <h4>Tags</h4>
      <div class="tag-list">
        {#each evidence.tags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    </div>
  {/if}

  {#if evidence.ai_tags && evidence.ai_tags.length > 0}
    <div class="ai-tags">
      <h4>AI Tags</h4>
      <div class="tag-list">
        {#each evidence.ai_tags as tag}
          <span class="ai-tag">{tag}</span>
        {/each}
      </div>
    </div>
  {/if}

  {#if (evidence as any).chat_turns && (evidence as any).chat_turns.length > 0}
    <div class="chat-insights">
      <h4>AI Analysis</h4>
      {#each (evidence as any).chat_turns as turn}
        {#if turn.keywords && turn.keywords.length > 0}
          <div class="keywords">
            <h5>Keywords</h5>
            <div class="keyword-list">
              {#each turn.keywords as keyword}
                <span class="keyword-chip">{keyword}</span>
              {/each}
            </div>
          </div>
        {/if}
        {#if turn.suggestions && turn.suggestions.length > 0}
          <div class="suggestions">
            <h5>AI Suggestions</h5>
            <ul class="suggestion-list">
              {#each turn.suggestions as suggestion}
                <li class="suggestion-item">{suggestion}</li>
              {/each}
            </ul>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if evidence.file_url}
    <div class="file-link">
      <a href={evidence.file_url} target="_blank" rel="noopener noreferrer">
        View File →
      </a>
    </div>
  {/if}
</div>

<style>
  .evidence-card {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 16px;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.2s;
  }

  .evidence-card:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .title-section {
    flex: 1;
  }

  .title-section h3 {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 600;
  }

  .evidence-type {
    display: inline-block;
    padding: 2px 8px;
    background: #f0f0f0;
    border-radius: 4px;
    font-size: 12px;
    color: #666;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn-ask-ai,
  .btn-delete {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-ask-ai {
    background: #007bff;
    color: white;
  }

  .btn-ask-ai:hover {
    background: #0056b3;
  }

  .btn-delete {
    background: #dc3545;
    color: white;
  }

  .btn-delete:hover {
    background: #c82333;
  }

  .summary {
    margin-bottom: 12px;
    padding: 8px;
    background: #f9f9f9;
    border-left: 3px solid #007bff;
  }

  .summary h4 {
    margin: 0 0 4px 0;
    font-size: 12px;
    font-weight: 600;
    color: #666;
  }

  .summary p {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
  }

  .metadata {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin-bottom: 12px;
    font-size: 12px;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
  }

  .meta-item .label {
    font-weight: 600;
    color: #666;
  }

  .meta-item .value {
    color: #333;
  }

  .tags,
  .ai-tags {
    margin-bottom: 12px;
  }

  .tags h4,
  .ai-tags h4 {
    margin: 0 0 6px 0;
    font-size: 12px;
    font-weight: 600;
    color: #666;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag,
  .ai-tag {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
  }

  .tag {
    background: #e3f2fd;
    color: #1976d2;
  }

  .ai-tag {
    background: #f3e5f5;
    color: #7b1fa2;
  }

  .chat-insights {
    margin-bottom: 12px;
    padding: 8px;
    background: #fff3cd;
    border-left: 3px solid #ffc107;
  }

  .chat-insights h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: #856404;
  }

  .keywords,
  .suggestions {
    margin-bottom: 8px;
  }

  .keywords h5,
  .suggestions h5 {
    margin: 0 0 4px 0;
    font-size: 12px;
    font-weight: 600;
    color: #856404;
  }

  .keyword-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .keyword-chip {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    background: #fff;
    color: #856404;
    border: 1px solid #ffc107;
  }

  .suggestion-list {
    margin: 0;
    padding-left: 16px;
  }

  .suggestion-item {
    font-size: 12px;
    line-height: 1.4;
    color: #333;
    margin-bottom: 2px;
  }

  .file-link {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #e0e0e0;
  }

  .file-link a {
    color: #007bff;
    text-decoration: none;
    font-size: 12px;
    font-weight: 600;
  }

  .file-link a:hover {
    text-decoration: underline;
  }
</style>
