<script lang="ts">
  /**
   * POIPhotoModal — canonical location: $lib/components/POIPhotoModal.svelte
   *
   * This barrel re-exports the component via a thin wrapper so both import paths
   * resolve to the same feature without duplicating implementation.
   */
  import POIPhotoModalImpl from '$lib/components/POIPhotoModal.svelte';

  interface ForensicData {
    hasFace?: boolean;
    hasText?: boolean;
    securityFlags?: string[];
    suspiciousElements?: string[];
    perceptualHash?: string;
    lightingConditions?: string;
    imageQuality?: 'high' | 'medium' | 'low';
    dimensions?: { width: number; height: number };
  }

  interface POIPhoto {
    url: string;
    originalName: string;
    size: number;
    mimeType: string;
    uploadedAt: string;
    aiCaption?: string;
    aiTags?: string[];
    exifData?: Record<string, unknown>;
    forensicData?: ForensicData;
  }

  interface Props {
    photos?: POIPhoto[];
    currentIndex?: number;
    open?: boolean;
    onclose?: () => void;
    onFaceMatch?: (photo: POIPhoto) => void;
  }

  let {
    photos = [],
    currentIndex = $bindable(0),
    open = $bindable(false),
    onclose,
    onFaceMatch,
  }: Props = $props();
</script>

<POIPhotoModalImpl
  {photos}
  bind:currentIndex
  bind:open
  {onclose}
  {onFaceMatch}
/>
