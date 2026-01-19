<script lang="ts">
    import Button from '$lib/components/ui/enhanced-bits/Button.svelte';
    import documentUploadMachine from '$lib/machines/document-upload-machine';
    import { onMount } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { createActor } from 'xstate';

    const actor = createActor(documentUploadMachine).start();

    // Svelte 5 runes
    let snapshot = $state(actor.getSnapshot());

    onMount(() => {
        const sub = actor.subscribe((s) => {
            snapshot = s;
        });
        return () => {
            sub.unsubscribe();
            actor.stop();
        };
    });

    const context = $derived(snapshot.context);
    const value = $derived(snapshot.value);

    let fileInput = $state<HTMLInputElement>();
    let dragOver = $state(false);

    function handleFileChange(e: Event) {
        const target = e.target as HTMLInputElement;
        if (target.files) {
            actor.send({ type: 'SELECT_FILES', files: Array.from(target.files) });
        }
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        dragOver = false;
        if (e.dataTransfer?.files) {
            actor.send({ type: 'SELECT_FILES', files: Array.from(e.dataTransfer.files) });
        }
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        dragOver = true;
    }

    function handleDragLeave() {
        dragOver = false;
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput?.click();
        }
    }

    function handleSubmit() {
        actor.send({ type: 'SUBMIT' });
    }

    function handleReset() {
        actor.send({ type: 'RESET' });
    }

    function handleRetry() {
        actor.send({ type: 'RETRY' });
    }

    function formatSize(bytes: number) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
</script>

<div class="upload-container font-mono border-2 border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
    <h2 class="text-2xl font-bold mb-4 tracking-tighter uppercase border-b-2 border-black pb-2">
        Document_Ingestion_System
    </h2>

    {#if snapshot.matches('idle') || snapshot.matches('validating') || snapshot.matches('ready')}
        <div
            role="button"
            tabindex="0"
            class="drop-zone border-2 border-dashed border-gray-400 p-10 text-center transition-colors mb-4 cursor-pointer"
            class:drag-over={dragOver}
            ondragover={(e: DragEvent) => {
                e.preventDefault();
                dragOver = true;
            }}
            ondragleave={() => (dragOver = false)}
            ondrop={handleDrop}
            onclick={() => fileInput?.click()}
            onkeydown={(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInput?.click();
                }
            }}
        >
            <input
                type="file"
                multiple
                bind:this={fileInput}
                onchange={handleFileChange}
                class="hidden"
            />

            {#if snapshot.matches('validating')}
                <div class="animate-pulse text-blue-600">
                    [VALIDATING_RESOURCES...]
                </div>
            {:else}
                <div class="text-gray-500">
                    <p class="text-lg">DRAG_AND_DROP_FILES</p>
                    <p class="text-xs mt-2 italic">OR CLICK TO BROWSE_FILESYSTEM</p>
                </div>
            {/if}
        </div>

        {#if context.files.length > 0}
            <div class="file-list mb-4 space-y-2" in:slide>
                <h3 class="text-xs font-bold uppercase text-gray-400 mb-2">Selected_Queue:</h3>
                {#each context.files as file}
                    <div class="file-item flex justify-between bg-gray-50 p-2 text-xs border border-gray-200">
                        <span class="truncate max-w-[70%]">{file.name}</span>
                        <span class="text-gray-400">{formatSize(file.size)}</span>
                    </div>
                {/each}

                {#if Object.keys(context.validationErrors).length > 0}
                    <div class="errors mt-2 p-2 bg-red-50 border border-red-200 text-red-600 text-[10px]" in:fade>
                        {#each Object.entries(context.validationErrors) as [field, msgs]}
                            {#each msgs as msg}
                                <div>[VALIDATION_ERROR: {msg}]</div>
                            {/each}
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}

        <div class="actions flex justify-end gap-3 mt-6">
            <Button
                variant="outline"
                onclick={handleReset}
                disabled={snapshot.matches('validating')}
            >
                RESET
            </Button>
            <Button
                onclick={handleSubmit}
                disabled={!snapshot.matches('ready')}
                class="px-8"
            >
                START_UPLOAD
            </Button>
        </div>

    {:else if snapshot.matches('uploading') || snapshot.matches('processing')}
        <div class="status-overlay py-12 text-center" in:fade>
            <div class="mb-8">
                <div class="text-xl font-bold mb-2 uppercase tracking-widest animate-pulse">
                    {snapshot.matches('uploading') ? 'TRANSMITTING_DATA' : 'NEURAL_PROCESSING'}
                </div>

                <div class="progress-bar-container w-full h-4 border-2 border-black bg-gray-100 relative overflow-hidden">
                    <div
                        class="progress-fill h-full bg-black transition-all duration-300"
                        style="width: {snapshot.matches('uploading') ? context.uploadProgress : context.processingProgress}%"
                    ></div>
                </div>

                <div class="flex justify-between mt-1 text-[10px]">
                    <span>STATUS: {snapshot.value.toString().toUpperCase()}</span>
                    <span>{snapshot.matches('uploading') ? context.uploadProgress : context.processingProgress}%</span>
                </div>
            </div>

            <div class="terminal-output bg-black text-green-500 p-4 text-left font-mono text-[10px] h-32 overflow-hidden bg-opacity-90">
                <div>> INITIATING_CONNECTION...</div>
                {#if snapshot.matches('uploading')}
                    <div>> UPLOADING_DOCUMENT_PACKETS...</div>
                    <div>> PACKET_COUNT: {context.files.length}</div>
                    <div>> TARGET: PostgreSQL17 + MinIO + Qdrant</div>
                {:else}
                    <div>> CONNECTION_ESTABLISHED.</div>
                    <div>> ANALYZING_DOCUMENT_TOPOLOGY...</div>
                    <div>> EXTRACTING_LEGAL_ENTITIES...</div>
                    <div>> STORING: PostgreSQL → Neo4j → CouchDB</div>
                {/if}
            </div>
        </div>

    {:else if snapshot.matches('completed')}
        <div class="success-result p-6 border-2 border-green-500 bg-green-50" in:fade>
            <div class="text-green-700 font-bold text-center mb-4">
                [SYSTEM_SUCCESS: ALL_DATA_PROCESSED]
            </div>

            <div class="text-xs space-y-2 text-gray-600 mb-6">
                {#if context.aiResults}
                    <div class="p-4 bg-white border border-green-200">
                        <p class="font-bold mb-2 text-black border-b border-black pb-1">AI_SUMMARY:</p>
                        <p class="leading-relaxed">{context.aiResults.summary}</p>
                    </div>
                {/if}
            </div>

            <Button onclick={handleReset} class="w-full">
                PROCESS_NEW_DOCUMENTS
            </Button>
        </div>

    {:else if snapshot.matches('error')}
        <div class="error-result p-6 border-2 border-red-500 bg-red-50" in:fade>
            <div class="text-red-700 font-bold text-center mb-4 uppercase">
                [SYSTEM_CRITICAL_FAILURE]
            </div>
            <div class="text-xs text-red-600 p-4 bg-white border border-red-200 mb-6 font-mono">
                > ERROR_LOG: {context.error}
            </div>

            <div class="flex gap-4">
                <Button variant="outline" onclick={handleReset} class="flex-1">ABORT</Button>
                <Button onclick={handleRetry} class="flex-1">RETRY_TRANSMISSION</Button>
            </div>
        </div>
    {/if}
</div>

<style>
    .drop-zone.drag-over {
        background-color: rgba(0, 0, 0, 0.05);
        border-color: black;
    }

    .progress-fill {
        background-image: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.2) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255, 255, 255, 0.2) 50%,
            rgba(255, 255, 255, 0.2) 75%,
            transparent 75%,
            transparent
        );
        background-size: 20px 20px;
        animation: progress-stripes 1s linear infinite;
    }

    @keyframes progress-stripes {
        from { background-position: 0 0; }
        to { background-position: 20px 0; }
    }
</style>




