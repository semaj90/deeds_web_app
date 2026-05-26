<script lang="ts">
  import { Dialog } from "bits-ui";
  import { onMount } from "svelte";

  let open = $state(false);
  let files = $state<any[]>([]);
  let selectedFile = $state<File | null>(null);
  let uploading = $state(false);
  let errorMessage = $state("");

  async function loadFiles() {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      files = data.files ?? [];
    } catch (err) {
      console.error("Failed to load files:", err);
    }
  }

  async function uploadFile() {
    if (!selectedFile) return;

    uploading = true;
    errorMessage = "";

    try {
      const form = new FormData();
      form.append("file", selectedFile);

      const res = await fetch("/api/files", {
        method: "POST",
        body: form
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Upload failed");
      }

      selectedFile = null;
      await loadFiles();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Upload failed";
    } finally {
      uploading = false;
    }
  }

  async function deleteFile(id: string) {
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Delete failed");
      }

      await loadFiles();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Delete failed";
    }
  }

  // Load files on mount and when dialog opens
  $effect(() => {
    if (open) {
      loadFiles();
    }
  });

  onMount(() => {
    loadFiles();
  });
</script>

<div class="container mx-auto p-8">
  <h1 class="text-3xl font-bold mb-6">Storage Debug: SeaweedFS + Drizzle</h1>

  <div class="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
    <p class="text-slate-400 mb-8">
      Test the end-to-end upload flow: Browser &rarr; SvelteKit &rarr; SeaweedFS (Docker) & Postgres.
    </p>

    <Dialog.Root bind:open>
      <Dialog.Trigger class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95">
        Manage Uploads
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50" />

        <Dialog.Content class="fixed left-1/2 top-1/2 w-[min(720px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-slate-900 border border-slate-800 p-8 shadow-2xl z-50">
          <Dialog.Title class="text-2xl font-bold text-white mb-6">
            Upload Evidence
          </Dialog.Title>

          <div class="space-y-6">
            <div class="group relative flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-2xl p-10 hover:border-blue-500 hover:bg-slate-800/50 transition-all cursor-pointer">
              <input
                type="file"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onchange={(event) => {
                  selectedFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
                }}
              />
              
              <div class="text-slate-500 group-hover:text-blue-400 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              </div>
              
              <p class="mt-4 font-medium text-slate-300">
                {selectedFile ? selectedFile.name : "Select or drag file here"}
              </p>
              {#if selectedFile}
                <p class="text-sm text-slate-500">{(selectedFile.size / 1024).toFixed(2)} KB</p>
              {/if}
            </div>

            <button
              class="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98]"
              disabled={!selectedFile || uploading}
              onclick={uploadFile}
            >
              {#if uploading}
                <span class="flex items-center justify-center gap-2">
                  <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading to SeaweedFS...
                </span>
              {:else}
                Upload to Storage
              {/if}
            </button>

            {#if errorMessage}
              <div class="p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-400 text-sm">
                {errorMessage}
              </div>
            {/if}

            <div class="mt-8">
              <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                Recently Uploaded
                <span class="text-xs font-normal text-slate-500 px-2 py-1 bg-slate-800 rounded-full">{files.length} files</span>
              </h3>
              
              <div class="max-h-[300px] overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800">
                {#if files.length === 0}
                  <div class="p-8 text-center text-slate-600 italic">No files uploaded yet</div>
                {/if}
                
                {#each files as file}
                  <div class="flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                    <div class="min-w-0 flex-1 mr-4">
                      <div class="font-medium text-slate-200 truncate">{file.originalName}</div>
                      <div class="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <span class="px-1.5 py-0.5 bg-slate-700 rounded capitalize">{file.status}</span>
                        <span>{(file.sizeBytes / 1024).toFixed(1)} KB</span>
                        <span class="truncate opacity-60">{file.objectKey}</span>
                      </div>
                    </div>

                    <button
                      class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                      title="Delete file"
                      onclick={() => deleteFile(file.id)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <div class="mt-8 flex justify-end">
            <Dialog.Close class="px-5 py-2.5 text-slate-400 hover:text-white font-medium rounded-lg transition-colors">
              Close
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>
</div>

<style>
  :global(body) {
    background-color: #0f172a;
    color: white;
  }
</style>
