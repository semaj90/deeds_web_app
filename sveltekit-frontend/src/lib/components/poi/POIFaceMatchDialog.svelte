<script lang="ts">
 import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
 import AvatarFallback from '$lib/components/ui/avatar/AvatarFallback.svelte';
 import AvatarImage from '$lib/components/ui/avatar/AvatarImage.svelte';
 import Badge from '$lib/components/ui/badge/Badge.svelte';
 import Card from '$lib/components/ui/card/Card.svelte';
 import CardContent from '$lib/components/ui/card/CardContent.svelte';
 import DialogRoot from '$lib/components/ui/dialog/DialogRoot.svelte';
 import DialogPortal from '$lib/components/ui/dialog/DialogPortal.svelte';
 import DialogOverlay from '$lib/components/ui/dialog/DialogOverlay.svelte';
 import DialogContent from '$lib/components/ui/dialog/DialogContent.svelte';
 import DialogDescription from '$lib/components/ui/dialog/DialogDescription.svelte';
 import DialogHeader from '$lib/components/ui/dialog/DialogHeader.svelte';
 import DialogTitle from '$lib/components/ui/dialog/DialogTitle.svelte';
 import Percent from '@lucide/svelte/icons/percent';
 import Search from '@lucide/svelte/icons/search';
 import Users from '@lucide/svelte/icons/users';
 import X from '@lucide/svelte/icons/x';

 interface POI {
 id: string;
	name: string;
 alias?: string;
	threatLevel: string;
 photos?: Array<{
	url: string;
 thumbnailUrl: string;
 metadata?: any;
 ai?: any;
 }>;
 }

 interface Match {
 poi: POI;
	similarity: number;
 confidence: 'high' | 'medium' | 'low';
 }

 interface Props {
 open: boolean;
	matches: Match[];
 onClose?: () => void;
 onSelect?: (poi: POI) => void;
 }





 let { open = $bindable(), matches, onClose, onSelect }: Props = $props();


 const handleClose = (): void => {
 open = false;
 onClose?.();
 };

 const handleSelectPOI = (poi: POI): void => {
 onSelect?.(poi);
 };

 function getConfidenceColor(confidence: string): string {
 switch (confidence) {
 case 'high': return 'bg-accent text-white';
 case 'medium': return 'bg-warning text-black';
 case 'low': return 'bg-danger text-white';
 default:return 'bg-sand/20 text-white';
 }
 }

 function getSimilarityColor(similarity: number): string {
 if (similarity >= 0.9) return 'text-accent';
 if (similarity >= 0.7) return 'text-warning';
 return 'text-danger';
 }

 function getInitials(name: string): string {
 return name
 .split(' ')
 .map((n) => n[0])
 .join('')
 .toUpperCase();
 }
</script>

<DialogRoot bind:open={ open }>
 <DialogPortal>
 <DialogOverlay />
 <DialogContent>
 <div class="max-w-4xl max-h-[80vh] overflow-y-auto">
 <DialogHeader>
 <div class="flex items-center gap-2">
 <Search class="w-5 h-5" />
 <DialogTitle>Face Match Results</DialogTitle>
 </div>
 <DialogDescription>
 Found {matches.length} potential face matches based on facial recognition analysis.
 </DialogDescription>
 </DialogHeader>

 <div class="space-y-4">
 {#if matches.length === 0}
 <div class="text-center py-8">
 <Users class="w-12 h-12 text-sand/40 mx-auto mb-4" />
 <p class="text-sand/60">No face matches found</p>
 </div>
 {:else}
 <div class="grid gap-4">
 {#each matches as match (match.poi.id)}
 <Card>
 <CardContent class="p-4">
 <div class="flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onclick={() => handleSelectPOI(match.poi)}>
 <!-- POI Photo -->
 <div class="flex-shrink-0">
 {#if match.poi.photos && match.poi.photos.length > 0}
 <Avatar class="w-16 h-16">
 <AvatarImage src={match.poi.photos[0].thumbnailUrl} alt={match.poi.name} />
 <AvatarFallback>{getInitials(match.poi.name)}</AvatarFallback>
 </Avatar>
 {:else}
 <Avatar class="w-16 h-16">
 <AvatarFallback class="bg-sand/10">
 <Users class="w-8 h-8 text-sand/60" />
 </AvatarFallback>
 </Avatar>
 {/if}
 </div>

 <!-- POI Info -->
 <div class="flex-1">
 <div class="flex items-center gap-2 mb-1">
 <h3 class="font-semibold text-lg">{match.poi.name}</h3>
 {#if match.poi.alias}
 <span class="text-sand/60">"{match.poi.alias}"</span>
 {/if}
 </div>

 <div class="flex items-center gap-2 mb-2">
 <Badge class={getConfidenceColor(match.confidence)}>
 {match.confidence.toUpperCase()} CONFIDENCE
 </Badge>
 <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20 text-sand/80">Threat: {match.poi.threatLevel.toUpperCase()}</span>
 </div>

 <div class="flex items-center gap-1 text-sm">
 <Percent class="w-4 h-4" />
 <span class={getSimilarityColor(match.similarity)}>
 {Math.round(match.similarity * 100)}% similarity
 </span>
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 {/each}
 </div>
 {/if}
 </div>

 <div class="flex justify-end pt-4 border-t">
 <button class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2" onclick={handleClose}>
 <X class="w-4 h-4 mr-2" />
 Close
 </button>
 </div>
 </div>
 </DialogContent>
 </DialogPortal>
</DialogRoot>




