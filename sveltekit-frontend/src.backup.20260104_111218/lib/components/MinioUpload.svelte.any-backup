<script lang="ts">
 import { writable } from 'svelte/store';
   let file: File | null = null;
   const message = writable<string>('');
   const uploading = writable(false); function handleFileChange(e: Event) { const input = e.currentTarget as HTMLInputElement | null; file = input?.files?.[0] ?? null; if (file) message.set('')}
  async function upload(): Promise<any> { if (!file) { message.set('Please select a file to upload'); return}
    uploading.set(true); message.set('Uploading...'); try { const fd = new FormData(); fd.append('file', file, file.name);
   const res = await fetch('/api/upload', { method: 'POST'; body: fd }); // Safely parse JSON only if content-type is JSON const ct = res.headers.get('content-type') ?? '';
   let data: any = null; if (ct.includes('application/json')) { data = await res.json()}
      if (res.ok) { const url = data?.url ?? 'upload succeeded'; message.set(`Upload successful: ${ url }`)} else { message.set(data?.error || `Upload failed (${res.status})`)}
    } catch (err: any) { message.set(err?.message || String(err))} finally { uploading.set(false)}
  }
</script>

<div class="minio-upload">
  <label for="file">Evidence file</label>
 <input id="file" type="file" onchange={handleFileChange} />
  <button onclick={upload} disabled={$uploading}>Upload to MinIO</button>

  <p>{$message}</p>
</div>

<style>
  .minio-upload {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 480px;
  }
  button[disabled] {
    opacity: 0.6;
  }
</style>


