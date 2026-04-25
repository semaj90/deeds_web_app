<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import FileUploadSection from './FileUploadSection.svelte';
	import { browser } from '$app/environment';

	interface Props {
		uploadUrl?: string;
		caseId?: string;
		accept?: string;
		maxSizeMB?: number;
		onupload?: (result: UploadResult) => void;
		class?: string;
	}

	interface UploadResult {
		success: boolean;
		evidenceId?: string;
		jobId?: string;
		queued?: boolean;
		error?: string;
	}

	interface QueuedUpload {
		id: string;
		file: { name: string; size: number; type: string };
		caseId: string;
		queuedAt: string;
	}

	let {
		uploadUrl = '/api/evidence/upload',
		caseId = '',
		accept = '.pdf,.doc,.docx,.txt,.jpg,.png',
		maxSizeMB = 50,
		onupload,
		class: className = ''
	}: Props = $props();

	let uploading = $state(false);
	let progress = $state(0);
	let status = $state<'idle' | 'uploading' | 'queued' | 'done' | 'error'>('idle');
	let statusMessage = $state('');
	let queuedUploads = $state<QueuedUpload[]>([]);
	let isOnline = $state(true);

	$effect(() => {
		if (!browser) return;
		isOnline = navigator.onLine;
		const onOnline = () => { isOnline = true; processQueue(); };
		const onOffline = () => { isOnline = false; };
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		loadQueue();
		return () => {
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
		};
	});

	function loadQueue() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem('upload-queue');
			if (saved) queuedUploads = JSON.parse(saved);
		} catch { /* ignore */ }
	}

	function saveQueue() {
		if (!browser) return;
		try {
			localStorage.setItem('upload-queue', JSON.stringify(queuedUploads));
		} catch { /* ignore */ }
	}

	async function handleFiles(files: File[]) {
		if (files.length === 0) return;

		for (const file of files) {
			if (!isOnline) {
				queueFile(file);
				continue;
			}
			await uploadFile(file);
		}
	}

	async function uploadFile(file: File) {
		uploading = true;
		status = 'uploading';
		progress = 0;
		statusMessage = `Uploading ${file.name}...`;

		try {
			const formData = new FormData();
			formData.append('file', file);
			if (caseId) formData.append('caseId', caseId);

			const res = await fetch(uploadUrl, { method: 'POST', body: formData });

			if (!res.ok) {
				if (!isOnline) {
					queueFile(file);
					return;
				}
				throw new Error(`Upload failed: ${res.status}`);
			}

			const data = await res.json();
			status = 'done';
			progress = 100;
			statusMessage = `${file.name} uploaded successfully`;
			onupload?.({ success: true, evidenceId: data.evidenceId, jobId: data.jobId });
		} catch (err) {
			if (!isOnline) {
				queueFile(file);
			} else {
				status = 'error';
				statusMessage = err instanceof Error ? err.message : 'Upload failed';
				onupload?.({ success: false, error: statusMessage });
			}
		} finally {
			uploading = false;
		}
	}

	function queueFile(file: File) {
		const entry: QueuedUpload = {
			id: crypto.randomUUID(),
			file: { name: file.name, size: file.size, type: file.type },
			caseId,
			queuedAt: new Date().toISOString(),
		};
		queuedUploads = [...queuedUploads, entry];
		saveQueue();
		status = 'queued';
		statusMessage = `${file.name} queued for upload when online`;
		onupload?.({ success: true, queued: true });
	}

	async function processQueue() {
		if (!isOnline || queuedUploads.length === 0) return;
		statusMessage = `Processing ${queuedUploads.length} queued uploads...`;
		// Queue processing requires IndexedDB file storage (future enhancement)
		// For now, notify user that queued items need re-upload
		statusMessage = `${queuedUploads.length} files were queued offline — please re-upload`;
		queuedUploads = [];
		saveQueue();
	}

	function clearQueue() {
		queuedUploads = [];
		saveQueue();
		status = 'idle';
		statusMessage = '';
	}
</script>

<div class="flex flex-col gap-3 {className}">
	<!-- Online/Offline indicator -->
	{#if !isOnline}
		<div class="flex items-center gap-2 px-3 py-2 rounded bg-amber-950/50 border border-amber-800 text-amber-300 text-xs">
			<Icon name="wifi-off" size={14} />
			<span>Offline — files will be queued for upload</span>
		</div>
	{/if}

	<FileUploadSection
		{accept}
		{maxSizeMB}
		label={isOnline ? 'Upload Evidence' : 'Queue Files (Offline)'}
		onfiles={handleFiles}
		disabled={uploading}
	/>

	<!-- Upload Progress -->
	{#if status !== 'idle'}
		<div class="flex items-center gap-2 px-3 py-2 rounded text-xs border {status === 'uploading' ? 'bg-blue-950/40 border-blue-800 text-blue-300' : status === 'done' ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : status === 'queued' ? 'bg-amber-950/40 border-amber-800 text-amber-300' : 'bg-red-950/40 border-red-800 text-red-300'}"
		>
			{#if status === 'uploading'}
				<Icon name="loader-2" size={14} class="animate-spin" />
			{:else if status === 'done'}
				<Icon name="check-circle" size={14} />
			{:else if status === 'queued'}
				<Icon name="clock" size={14} />
			{:else}
				<Icon name="alert-triangle" size={14} />
			{/if}
			<span class="flex-1">{statusMessage}</span>
		</div>
	{/if}

	<!-- Queued uploads -->
	{#if queuedUploads.length > 0}
		<div class="flex items-center justify-between px-3 py-2 rounded bg-stone-800/50 border border-stone-700 text-xs text-stone-400">
			<span>{queuedUploads.length} file{queuedUploads.length === 1 ? '' : 's'} queued</span>
			<div class="flex gap-2">
				{#if isOnline}
					<button
						class="text-emerald-400 hover:text-emerald-300 bg-transparent border-none cursor-pointer text-xs"
						onclick={processQueue}
					>Process Queue</button>
				{/if}
				<button
					class="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-xs"
					onclick={clearQueue}
				>Clear</button>
			</div>
		</div>
	{/if}
</div>
