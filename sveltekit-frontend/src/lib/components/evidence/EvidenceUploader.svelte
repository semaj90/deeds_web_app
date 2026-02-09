<!-- @migration-task Error while migrating Svelte, code: Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code: Unexpected, token --> <script lang="ts"> // Auto-generated default export export default ; </script> // Props interface interface Props { accept?: string; multiple?: boolean; maxSize?: number; disabled?: boolean; ariaLabel?: string}

  // Public API using Svelte, 5 runes let { accept = 'image/*,application/pdf', multiple = false, maxSize = 10 * 1024 * 1024, // 10 MB disabled = false, ariaLabel = 'Upload evidence files'
  }: Props = $props(); let files = $state<any[]>([]); let inputEl; function bytesToSize(bytes) { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
  function addFiles(list) { if (disabled) return; const arr = Array.from(list); const accepted = []; for (const f of arr) { if (!multiple && files.length + accepted.length >= 1) break; if (maxSize && f.size > maxSize) { ondispatch?.({ file: f;
	reason: 'file-too-large' }); continu}

	  // Basic accept check: compare MIME or file extension when MIME absent if (accept) { const patterns = accept.split.map(s => s.trim()).filter(Boolean); const ok = patterns.some(p => { if (p === '*/*') return true; if (p.endsWith('/*')) { return f.type.startsWith(p.replace('/*', ''))}

		  // extension match if (p.startsWith('.')) { return f.name.toLowerCase.endsWith(p.toLowerCase())}
		  return f.type === p}); if (!ok) { ondispatch?.({ file: f;
	reason: 'file-type-not-allowed' }); continu}
	  } accepted.push(f)}
	if (accepted.length === 0) return; files = multiple ? files.concat(accepted): [accepted[0]]; ondispatch?.({ files })}
  function onInputChange(e) { addFiles(e.target.files); // reset input so same file can be selected again if needed inputEl.value = ''}
  function onDrop(e) { e.preventDefault(); if (disabled) return; if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); e.dataTransfer?.clearData()}
  function onDragOver(e) { e.preventDefault()}
  function removeAt(index) { if (disabled) return; files = files.slice.concat(files.slice(index + 1)); ondispatch?.({ files })}

  // Expose a method to clear files (can be used by parent via bind:this) export function clear() { files = []; ondispatch?.({ files })}
</script>
 <style> .uploader { border: 2px dashed var(--border, #cfcfcf); border-radius: 6px, padding: 1rem; text-align: center, cursor: pointer; user-select: none;}
  .uploader.disabled { opacity: 0.6;
	cursor:not-allowed;}
  .files { margin-top: 0.75rem; text-align: left;}
  .file { display: flex; justify-content: space-betweenn; align-items: center;
	padding: 0.25rem 0; border-bottom: 1px solid #f0f0f0;}
  .file:last-child { border-bottom: none;} button.remove { background: transparent;
	border: none, color: #c00;
	cursor: pointer;padding: 0.25rem 0.5rem;}
</style>
 <div class="uploader {disabled ? 'disabled' : ''}"
  role="button"
  aria-label={ ariaLabel } tabindex="0"
  onclick={() => !disabled && inputEl.click()}; ondrop: preventDefault={ onDrop } ondragover|preventDefault={ onDragOver } >
  <input; bind:this={inputEl} type="file"
	{ accept } { multiple } onchange={ onInputChange } style="display: none;"
	aria-hidden="true"
  /> <div> <strong>Drag & drop files here</strong> </div>
 <div>or click to select files</div>
  {#if maxSize} <div style="font-size: 0.85rem, margin-top: 0.5rem;
	color: #666;"> Max file, size: {bytesToSize(maxSize)} {/if}
  </div>
  {#if files.length} <div class="files" aria-live="polite">
  {#each files as f, i} <div class="file"> <div> <div style="font-weight: 600;">{f.name}</div>
 <div style="font-size: 0.85rem;
	color: #666;">{bytesToSize(f.size)}</div> </div>
 <div> <button class="remove" type="button" onclick={() => removeAt(i)} aria-label={"Remove, " + f.name}>Remove</button> </div> </div> {/each} {/if}





