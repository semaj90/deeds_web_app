<script lang="ts">
	import CanonicalPOIPhotoModal from '../../components/POIPhotoModal.svelte';

	type LegacyPhoto = {
		url: string;
		thumbnailUrl?: string | null;
		metadata?: {
			exif?: Record<string, unknown>;
			gps?: { lat: number; lng: number } | null;
			timestamp?: string | null;
			device?: string | null;
			ai?: {
				caption?: string;
				tags?: string[];
				qualityScore?: number;
				faceEmbedding?: number[];
			};
		};
	} | null;

	interface Props {
		open?: boolean;
		photo?: LegacyPhoto;
		onClose?: () => void;
	}

	let { open = $bindable(false), photo = null, onClose }: Props = $props();
	let currentIndex = $state(0);

	let photos = $derived.by(() => {
		if (!photo) return [];
		return [{
			...photo,
			url: photo.url,
			thumbnailUrl: photo.thumbnailUrl ?? photo.url,
			exifData: photo.metadata?.exif,
			uploadedAt: photo.metadata?.timestamp ?? '',
			aiCaption: photo.metadata?.ai?.caption ?? null,
			aiTags: photo.metadata?.ai?.tags ?? [],
			forensicData: {
				qualityScore: photo.metadata?.ai?.qualityScore,
				gps: photo.metadata?.gps,
				device: photo.metadata?.device,
				faceEmbedding: photo.metadata?.ai?.faceEmbedding,
			},
		}];
	});

	function handleClose() {
		onClose?.();
	}
</script>

<CanonicalPOIPhotoModal
	{photos}
	bind:open
	bind:currentIndex
	onclose={handleClose}
/>

