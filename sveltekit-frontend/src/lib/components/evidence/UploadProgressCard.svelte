<script lang="ts">
  interface UploadState {
    filename: string; progress: number;
    status: 'idle'|'uploading'|'processing'|'complete'|'failed';
    error?: string; fileSize?: number; uploadedBytes?: number;
  }

  interface Props {
    filename?: string; fileSize?: number;
    onCancel?: () => void; onRetry?: () => void;
  }

  let {filename='',fileSize=0,onCancel,onRetry}:Props=$props();

  let uploadState=$state({filename:'',progress:0,status:'idle'});

  let pct=$derived(Math.round(uploadState.progress*100));

  function fmt(b:number):string{
    if(b===0)return'0 B';const k=1024,s=['B','KB','MB','GB'];
    const i=Math.floor(Math.log(b)/Math.log(k));
    return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+s[i];
  }

  export function startUpload(){uploadState={...uploadState,status:'uploading',progress:0}}
  export function updateProgress(p:number){uploadState={...uploadState,progress:p}}
  export function completeUpload(){uploadState={...uploadState,status:'complete',progress:1}}
  export function failUpload(msg:string){uploadState={...uploadState,error:msg,status:'failed'}}
</script>

<div class="upload-progress-card">
  <div class="card-header">
    <span class="filename">{uploadState.filename}</span>
    <span class="status">{uploadState.status}</span>
  </div>
  {#if uploadState.status==='uploading'}
    <div class="progress-bar" style="width:{pct}%"></div>
    <span>{pct}%</span>
  {/if}
  {#if uploadState.error}
    <div class="error">{uploadState.error}</div>
  {/if}
  <div class="actions">
    {#if uploadState.status==='uploading' && onCancel}
      <button onclick={onCancel}>Cancel</button>
    {/if}
    {#if uploadState.status==='failed' && onRetry}
      <button onclick={onRetry}>Retry</button>
    {/if}
  </div>
</div>

<style>
  .upload-progress-card{border:1px solid #e5e7eb;border-radius:0.5rem;padding:1rem;background:white}
  .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem}
  .filename{font-weight:600;color:#1f2937}
  .status{font-size:0.75rem;text-transform:uppercase;color:#6b7280}
  .progress-bar{height:6px;background:#3b82f6;border-radius:3px;transition:width 0.3s}
  .error{color:#dc2626;padding:0.5rem;background:#fef2f2;border-radius:0.25rem}
  .actions{display:flex;gap:0.5rem;margin-top:0.5rem}
  button{padding:0.25rem 0.75rem;border-radius:0.25rem;cursor:pointer;border:1px solid #d1d5db;background:white}
</style>
