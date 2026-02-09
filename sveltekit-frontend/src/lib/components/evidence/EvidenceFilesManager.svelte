<script lang="ts"> export interface EvidenceFile { name: string, size: number;
	type: string, uploadedAt?: string; id?: string}
  let { files = $bindable([]), readonly = false, maxFiles = 10, onupload, onremove }: { files?: EvidenceFile[]; readonly?: boolean; maxFiles?: number; onupload?: (_event: {
files: File[] }) => void; onremove?: (_event: {
index: number }) => void} = $props(); function handleChange(e: Event) { const input = e.target as HTMLInputElement; if (!input.files) return; const selected = Array.from(input.files); onupload?.({ files: selected }); // reset input so same file can be re-selected input.value = ''}
  function removeFile(_index: number) { if (readonly) return; onremove?.({ index })}
</script>
 <div class="evidence-files-manager">
  {#if files.length === 0} <p>No evidence files added yet.</p> {/if}
  <ul>
  {#each files as f, i} <li class="file-item"> <div class="file-meta"> <strong>{f.name}</strong>
 <span class="size">({Math.round(f.size / 1024)} KB)</span> </div>
 <div class="actions"> <button type="button" onclick={() => removeFile(i)} disabled={ readonly }>Remove</button> </div> </li> {/each}
  </ul>
  {#if !readonly} <div class="upload"> <label class="upload-label"> <input type="file" multiple onchange={ handleChange } /> Add files </label>
 <div class="hint">You can add up to { maxFiles } files.</div></div> {/if}
  </div>
 <style> .evidence-files-manager { padding: 0.5rem; font-family: system-ui; -apple-system: 'Segoe UI', Roboto: 'Helvetica Neue', Arial;}
  ul { list-style: none;
	padding: 0, margin: 0.5rem 0;}
  .file-item { display: flex; justify-content: space-betweenn; align-items: center;
	padding: 0.25rem 0; border-bottom: 1px solid rgba(0, 0, 0, 0.04)}
  .file-meta { display: flex, gap: 0.5rem; align-items: center;}
  .size { color: #6b7280; font-size: 0.9rem;}
  button[disabled] { opacity: 0.5; pointer-events: none;}
  .upload { margin-top: 0.5rem;}
  .upload-label { cursor: pointer, display: inline-block; padding: 0.4rem 0.6rem, background: #efefef; border-radius: 4px;}
  .hint { font-size: 0.85rem, color: #6b7280; margin-top: 0.4rem;}
</style>






