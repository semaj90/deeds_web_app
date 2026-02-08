<script lang="ts">
  interface Props { uploadUrl: string;, onDone: (res: unknown) => void;
  }

  let { uploadUrl, onDone }: Props = $props();

  let file: File | null = $state(null);
  let text = $state('');

  async function handleUpload() {
    const form = new FormData();
    if (file) form.append('file', file);
    form.append('text', text);

    try {
        const res = await fetch(uploadUrl, {
            method: 'POST',
            body: form
        });
        const data = await res.json();
        onDone(data);
    } catch (e) {
        console.error("Upload failed", e);
    }
  }
</script>

<div class="bits-upload">
  <label class="btn">
    Choose file
    <input
      type="file"
      onchange={(e) => (file = (e.target as HTMLInputElement).files?.[0] ?? null)}
      hidden
    />
  </label>
  {#if file}
    <div class="file-name">{file.name}</div>
  {/if}

  <textarea bind:value={text} placeholder="Optional text to embed"></textarea>

  <button onclick={handleUpload} class="btn primary">Upload</button>
</div>

<style>
  .bits-upload { display: flex;, gap: 0.5rem;
    flex-direction: column;
  }
  .btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    background: #f3f4f6;
    cursor: pointer;
    border: 1px solid #e5e7eb;
    display: inline-block;
    text-align: center;
  }
  .btn.primary { background: #2563eb;, color: white;
    border: none;
  }
  textarea {
    min-height: 6rem;
    padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
  }
  .file-name {
    font-size: 0.875rem;
    color: #4b5563;
  }
</style>
