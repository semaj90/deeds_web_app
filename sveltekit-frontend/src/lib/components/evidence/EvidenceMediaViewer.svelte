<!--
  EvidenceMediaViewer — unified inline player for any evidence media type.

  Sniffs file type from `mimeType`/`fileType`/`evidenceType` (in that order) +
  filename extension as fallback, then renders the appropriate full-width
  player with native browser controls:

    image  → <img> with click-to-zoom
    video  → <video controls>
    audio  → <audio controls>
    pdf    → <iframe> to /api/library/documents/[id]/pdf or direct URL
    text   → <pre> with fetched text
    other  → "Download" button

  Storage-agnostic — accepts any `url` (MinIO presigned, SeaweedFS S3, public URL).
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		url: string | null | undefined;
		fileName?: string | null;
		mimeType?: string | null;
		fileType?: string | null;
		/** Optional explicit category (image|video|audio|pdf|text|document) */
		evidenceType?: string | null;
		title?: string | null;
		/** When true, image opens lightbox on click. Default true. */
		lightbox?: boolean;
		/** Max preview height in viewport units. Default 70. */
		maxHeightVh?: number;
	}

	let {
		url,
		fileName = null,
		mimeType = null,
		fileType = null,
		evidenceType = null,
		title = null,
		lightbox = true,
		maxHeightVh = 70
	}: Props = $props();

	let zoomed = $state(false);

	type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'unknown';

	const kind: Kind = $derived.by((): Kind => {
		const mime = (mimeType ?? fileType ?? '').toLowerCase();
		const ext = (fileName ?? url ?? '').toLowerCase().split('.').pop() ?? '';
		const explicit = (evidenceType ?? '').toLowerCase();

		if (mime.startsWith('image/') || explicit === 'image' || ['png','jpg','jpeg','gif','webp','svg','bmp','tiff'].includes(ext)) return 'image';
		if (mime.startsWith('video/') || explicit === 'video' || ['mp4','webm','mov','mkv','avi'].includes(ext)) return 'video';
		if (mime.startsWith('audio/') || explicit === 'audio' || ['mp3','wav','ogg','m4a','flac','aac'].includes(ext)) return 'audio';
		if (mime === 'application/pdf' || explicit === 'pdf' || ext === 'pdf') return 'pdf';
		if (mime.startsWith('text/') || explicit === 'text' || ['txt','md','log','csv','json','xml','yaml','yml'].includes(ext)) return 'text';
		return 'unknown';
	});

	let textContent = $state<string>('');
	let textLoading = $state(false);
	let textError = $state<string | null>(null);

	$effect(() => {
		if (kind !== 'text' || !url) return;
		textLoading = true;
		textError = null;
		fetch(url)
			.then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
			.then((t) => { textContent = t.slice(0, 200_000); }) // cap at 200KB to keep DOM light
			.catch((e) => { textError = e instanceof Error ? e.message : String(e); })
			.finally(() => { textLoading = false; });
	});

	const safeName = $derived(title ?? fileName ?? 'evidence');
	const containerStyle = $derived(`max-height: ${maxHeightVh}vh;`);
</script>

<div class="evidence-viewer" data-testid="evidence-viewer">
{#if !url}
	<div class="rounded-lg border border-panel bg-panelSoft p-6 text-center text-sand">
		<Icon name="file" size={32} class="mx-auto mb-2 opacity-50" />
		<p class="text-sm">No media URL available</p>
	</div>
{:else if kind === 'image'}
	<button
		type="button"
		class="group block w-full overflow-hidden rounded-lg border border-panel bg-panelSoft"
		onclick={() => { if (lightbox) zoomed = true; }}
		aria-label={`View ${safeName} full-size`}
	>
		<img
			src={url}
			alt={safeName}
			class="w-full object-contain transition-transform group-hover:scale-[1.02]"
			style={containerStyle}
			loading="lazy"
		/>
	</button>

	{#if zoomed}
		<button
			type="button"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
			onclick={() => (zoomed = false)}
			aria-label="Close lightbox"
		>
			<img src={url} alt={safeName} class="max-h-full max-w-full object-contain" />
			<span class="absolute right-4 top-4 rounded-full bg-panel p-2 text-sand">
				<Icon name="x" size={20} />
			</span>
		</button>
	{/if}
{:else if kind === 'video'}
	<div class="overflow-hidden rounded-lg border border-panel bg-black">
		<video
			src={url}
			controls
			preload="metadata"
			class="w-full"
			style={containerStyle}
		>
			<track kind="captions" />
			Your browser does not support video playback.
		</video>
	</div>
{:else if kind === 'audio'}
	<div class="rounded-lg border border-panel bg-panelSoft p-4">
		<div class="mb-3 flex items-center gap-2 text-sm text-sand">
			<Icon name="headphones" size={18} />
			<span class="truncate font-medium">{safeName}</span>
		</div>
		<audio src={url} controls preload="metadata" class="w-full">
			Your browser does not support audio playback.
		</audio>
	</div>
{:else if kind === 'pdf'}
	<div class="overflow-hidden rounded-lg border border-panel bg-panelSoft" style={containerStyle}>
		<iframe
			src={`${url}#toolbar=1&navpanes=0`}
			title={safeName}
			class="h-full w-full"
			style="min-height: 60vh; border: 0;"
		></iframe>
	</div>
{:else if kind === 'text'}
	<div class="rounded-lg border border-panel bg-panelSoft" style={containerStyle}>
		{#if textLoading}
			<div class="flex items-center gap-2 p-4 text-sm text-sand">
				<Icon name="loader" size={16} class="animate-spin" />
				Loading text…
			</div>
		{:else if textError}
			<div class="p-4 text-sm text-danger">Failed to load: {textError}</div>
		{:else}
			<pre class="overflow-auto p-4 text-xs leading-relaxed text-sand"
			     style={containerStyle}>{textContent}</pre>
		{/if}
	</div>
{:else}
	<div class="flex flex-col items-center gap-3 rounded-lg border border-panel bg-panelSoft p-8 text-center">
		<Icon name="file" size={40} class="text-sand opacity-60" />
		<div>
			<p class="text-sm font-medium text-sand">{safeName}</p>
			{#if mimeType ?? fileType}
				<p class="text-xs text-sand opacity-60">{mimeType ?? fileType}</p>
			{/if}
		</div>
		<a
			href={url}
			download={fileName ?? true}
			class="btn-base btn-primary inline-flex items-center gap-2"
		>
			<Icon name="download" size={16} />
			Download
		</a>
	</div>
{/if}
</div>
